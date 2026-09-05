// ═══════════════════════════════════════════════════════════
// [1] Module Imports and Type Declarations
// ═══════════════════════════════════════════════════════════
import type { DomImageCapture, ImageRecord, ImageSource } from './types';
import { extractFileName } from './url-utils';

// ═══════════════════════════════════════════════════════════
// [2] Side Panel Behavior Configuration
// ═══════════════════════════════════════════════════════════
chrome.sidePanel
  .setPanelBehavior({ openPanelOnActionClick: true })
  .catch((error) => console.error('[BG] failed to set panel behavior', error));

// ═══════════════════════════════════════════════════════════
// [3] Content Script Injection on Installation
// ═══════════════════════════════════════════════════════════
// Already-open tabs never ran content.ts (it's only declared for future navigations),
// so inject it manually - otherwise those tabs need a manual refresh, which the hard
// UX requirement forbids.
chrome.runtime.onInstalled.addListener(async () => {
  const tabs = await chrome.tabs.query({ url: ['http://*/*', 'https://*/*'] });

  for (const tab of tabs) {
    if (tab.id === undefined) continue;

    try {
      await chrome.scripting.executeScript({
        target: { tabId: tab.id, allFrames: true },
        files: ['content.js'],
      });
    } catch (error) {
      console.error(`[BG] failed to inject content script into tab ${tab.id}`, error);
    }
  }
});

// ═══════════════════════════════════════════════════════════
// [4] General Helper Utilities
// ═══════════════════════════════════════════════════════════
function getHeader(headers: chrome.webRequest.HttpHeader[] | undefined, name: string): string | null {
  const header = headers?.find((h) => h.name.toLowerCase() === name.toLowerCase());
  return header?.value ?? null;
}

function storageKey(tabId: number): string {
  return `tab:${tabId}`;
}

function originOf(url: string): string | null {
  try {
    return new URL(url).origin;
  } catch {
    return null;
  }
}

// ═══════════════════════════════════════════════════════════
// [5] Per-Tab In-Memory State Declarations
// ═══════════════════════════════════════════════════════════
// --- Per-tab in-memory state -------------------------------------------------
// The map below is the single source of truth while the service worker is alive;
// chrome.storage.session is a debounced mirror of it, not the other way around.
// See applyCapture/scheduleFlush for why: a naive per-capture read-modify-write
// against storage races when several captures land in the same tick.

const tabRecords = new Map<number, Map<string, ImageRecord>>();
const hydrating = new Map<number, Promise<Map<string, ImageRecord>>>();
const tabOrigins = new Map<number, string>();
const tabGenerations = new Map<number, number>();
const pendingFlushTimers = new Map<number, ReturnType<typeof setTimeout>>();
const flushingTabIds = new Set<number>();
const dirtyAgainTabIds = new Set<number>();

const FLUSH_DEBOUNCE_MS = 300;

// ═══════════════════════════════════════════════════════════
// [6] Record Sequencing and Tab Generation Tracking
// ═══════════════════════════════════════════════════════════
function generationOf(tabId: number): number {
  return tabGenerations.get(tabId) ?? 0;
}

// Derived from the records themselves, not a separate counter - a standalone counter
// would start back at 0 on every service worker wake while the hydrated records still
// carry their old seq values, colliding with the next "new" record.
function nextSeq(records: Map<string, ImageRecord>): number {
  let max = 0;
  for (const record of records.values()) {
    if (record.seq > max) max = record.seq;
  }
  return max + 1;
}

// ═══════════════════════════════════════════════════════════
// [7] Storage Session Hydration
// ═══════════════════════════════════════════════════════════
// The persisted shape for a tab's storage.session entry: the records dictionary
// alongside the origin they belong to, so a service worker that wakes up mid-session
// can compare against the origin it last knew about, not just an in-memory value
// that resets to nothing on every sleep.
interface TabStorageValue {
  origin: string | null;
  records: Record<string, ImageRecord>;
}

async function hydrate(tabId: number): Promise<Map<string, ImageRecord>> {
  try {
    const key = storageKey(tabId);
    const stored = await chrome.storage.session.get(key);
    const raw = stored[key] as TabStorageValue | undefined;

    if (raw?.origin && !tabOrigins.has(tabId)) {
      tabOrigins.set(tabId, raw.origin);
    }

    return new Map(raw ? Object.entries(raw.records) : []);
  } catch (error) {
    // Never let a failed read leave a rejected promise cached in `hydrating` -
    // that would permanently wedge every future capture for this tab.
    console.error(`[BG] failed to hydrate records for tab ${tabId}`, error);
    return new Map();
  }
}

// Single-flight: if hydration for this tab is already in progress, callers await
// the same promise instead of issuing a second storage.session.get and clobbering
// each other's merges once both resolve into two different Map instances.
async function getTabRecords(tabId: number): Promise<Map<string, ImageRecord>> {
  const existing = tabRecords.get(tabId);
  if (existing) return existing;

  let promise = hydrating.get(tabId);
  if (!promise) {
    promise = hydrate(tabId);
    hydrating.set(tabId, promise);
  }

  const records = await promise;
  hydrating.delete(tabId);
  tabRecords.set(tabId, records);
  return records;
}

// ═══════════════════════════════════════════════════════════
// [8] Tab State Cleanup and Reset
// ═══════════════════════════════════════════════════════════
async function clearTab(tabId: number): Promise<void> {
  tabGenerations.set(tabId, generationOf(tabId) + 1);
  dirtyAgainTabIds.delete(tabId);

  const timer = pendingFlushTimers.get(tabId);
  if (timer !== undefined) {
    clearTimeout(timer);
    pendingFlushTimers.delete(tabId);
  }

  // Set a fresh empty map rather than deleting the entry: anything that arrives while
  // the storage write below is still pending must merge into a clean slate, not
  // re-trigger hydrate() - which could otherwise race the pending write and read the
  // just-cleared data straight back in.
  tabRecords.set(tabId, new Map());

  // Write the new origin now rather than just removing the old entry: this survives
  // a service worker sleep even before any capture or flush happens on the new site.
  // Without it, sleeping right after this navigation would forget an origin was ever
  // known, and the next real cross-origin change would look like a first navigation
  // and be missed (see handleNavigation).
  const value: TabStorageValue = { origin: tabOrigins.get(tabId) ?? null, records: {} };
  try {
    await chrome.storage.session.set({ [storageKey(tabId)]: value });
  } catch (error) {
    console.error(`[BG] failed to clear storage for tab ${tabId}`, error);
  }
  chrome.action.setBadgeText({ tabId, text: '0' }).catch(() => undefined);

  console.log(`[BG] cleared records for tab ${tabId} (origin changed)`);
}

// ═══════════════════════════════════════════════════════════
// [9] Network and DOM Record Merging
// ═══════════════════════════════════════════════════════════
// existing = what we already knew about this URL, incoming = the new capture just received.
function mergeRecords(existing: ImageRecord, incoming: Omit<ImageRecord, 'seq'>): ImageRecord {
  const domSide = incoming.source.includes('dom') ? incoming : existing.source.includes('dom') ? existing : null;
  const otherDomSide = domSide === incoming ? existing : incoming;
  const networkSide = incoming.source.includes('network')
    ? incoming
    : existing.source.includes('network')
      ? existing
      : null;
  const otherNetworkSide = networkSide === incoming ? existing : incoming;

  return {
    url: existing.url,
    tabId: incoming.tabId,
    byteSize: pick(networkSide?.byteSize, otherNetworkSide?.byteSize),
    mimeType: pick(networkSide?.mimeType, otherNetworkSide?.mimeType),
    source: dedupeSources([...existing.source, ...incoming.source]),
    fileName: pick(existing.fileName, incoming.fileName),
    altText: pick(domSide?.altText, otherDomSide?.altText),
    width: pick(domSide?.width, otherDomSide?.width),
    height: pick(domSide?.height, otherDomSide?.height),
    sourceUrl: pick(domSide?.sourceUrl, otherDomSide?.sourceUrl),
    pageUrl: pick(domSide?.pageUrl, otherDomSide?.pageUrl),
    statusCode: pick(networkSide?.statusCode, otherNetworkSide?.statusCode),
    capturedAt: Math.min(existing.capturedAt, incoming.capturedAt),
    seq: existing.seq,
  };
}

function pick<T>(preferred: T | null | undefined, fallback: T | null | undefined): T | null {
  return preferred ?? fallback ?? null;
}

// Fixed order regardless of arrival order, so a merged record is always
// ['network', 'dom'] and never ['dom', 'network'] - stage 6 filters on this value.
const SOURCE_ORDER: ImageSource[] = ['network', 'dom'];

function dedupeSources(sources: ImageSource[]): ImageSource[] {
  const unique = new Set(sources);
  return SOURCE_ORDER.filter((source) => unique.has(source));
}

// ═══════════════════════════════════════════════════════════
// [10] Diagnostic Capture Logging
// ═══════════════════════════════════════════════════════════
function logCapture(record: ImageRecord): void {
  console.log(`[BG] capture [${record.source.join('+')}] #${record.seq}`, record);
}

// ═══════════════════════════════════════════════════════════
// [11] Capture Application Entry Point
// ═══════════════════════════════════════════════════════════
async function applyCapture(incoming: Omit<ImageRecord, 'seq'>): Promise<void> {
  try {
    const records = await getTabRecords(incoming.tabId);

    if (incoming.pageUrl && !tabOrigins.has(incoming.tabId)) {
      const origin = originOf(incoming.pageUrl);
      if (origin) tabOrigins.set(incoming.tabId, origin);
    }

    const existing = records.get(incoming.url);

    if (!existing) {
      const created: ImageRecord = { ...incoming, seq: nextSeq(records) };
      records.set(incoming.url, created);
      logCapture(created);
      scheduleFlush(incoming.tabId);
      return;
    }

    const merged = mergeRecords(existing, incoming);

    // Same URL reported again with nothing new (e.g. the same image found
    // independently by more than one frame) - skip the write/log so a duplicate
    // report doesn't masquerade as a change, and stage 5's panel doesn't
    // re-render for a no-op.
    if (JSON.stringify(merged) === JSON.stringify(existing)) return;

    records.set(incoming.url, merged);
    logCapture(merged);
    scheduleFlush(incoming.tabId);
  } catch (error) {
    console.error('[BG] failed to apply capture', error);
  }
}

// ═══════════════════════════════════════════════════════════
// [12] Storage Flush Queue (Debounce & Single-Flight)
// ═══════════════════════════════════════════════════════════
// Debounced, single-flight-with-trailing-flush: if a write for this tab is already
// in flight, mark it dirtyAgain instead of starting a second one - a slow write
// that started earlier could otherwise land after a faster one and clobber it with
// stale data. The trailing flush after the in-flight one finishes always reads a
// fresh snapshot, so nothing accumulated during the wait is lost.
function scheduleFlush(tabId: number): void {
  if (flushingTabIds.has(tabId)) {
    dirtyAgainTabIds.add(tabId);
    return;
  }
  if (pendingFlushTimers.has(tabId)) return;

  const timer = setTimeout(() => {
    pendingFlushTimers.delete(tabId);
    void flush(tabId);
  }, FLUSH_DEBOUNCE_MS);

  pendingFlushTimers.set(tabId, timer);
}

async function flush(tabId: number): Promise<void> {
  const generation = generationOf(tabId);
  const records = tabRecords.get(tabId);
  if (!records) return;

  flushingTabIds.add(tabId);
  try {
    // The tab's origin changed (and its records were cleared) after this flush was
    // scheduled but before it ran - writing now would resurrect stale cross-origin data.
    if (generationOf(tabId) !== generation) return;

    const value: TabStorageValue = {
      origin: tabOrigins.get(tabId) ?? null,
      records: Object.fromEntries(records),
    };
    await chrome.storage.session.set({ [storageKey(tabId)]: value });
    await chrome.action.setBadgeText({ tabId, text: String(records.size) });
  } catch (error) {
    console.error(`[BG] failed to flush records for tab ${tabId}`, error);
  } finally {
    flushingTabIds.delete(tabId);
    if (dirtyAgainTabIds.has(tabId)) {
      dirtyAgainTabIds.delete(tabId);
      scheduleFlush(tabId);
    }
  }
}

// ═══════════════════════════════════════════════════════════
// [13] Core Event Listeners (Network, DOM, Navigation)
// ═══════════════════════════════════════════════════════════
chrome.webRequest.onHeadersReceived.addListener(
  (details) => {
    if (details.tabId < 0) return;

    const byteSizeHeader = getHeader(details.responseHeaders, 'content-length');
    const mimeTypeHeader = getHeader(details.responseHeaders, 'content-type');

    void applyCapture({
      url: details.url,
      tabId: details.tabId,
      byteSize: byteSizeHeader !== null ? Number(byteSizeHeader) : null,
      mimeType: mimeTypeHeader,
      source: ['network'],
      fileName: extractFileName(details.url),
      altText: null,
      width: null,
      height: null,
      sourceUrl: details.initiator ?? null,
      pageUrl: null,
      statusCode: details.statusCode,
      capturedAt: Date.now(),
    });
  },
  { urls: ['<all_urls>'], types: ['image'] },
  ['responseHeaders'],
);

chrome.runtime.onMessage.addListener((captures: DomImageCapture[], sender) => {
  const tabId = sender.tab?.id;
  if (tabId === undefined || tabId < 0) {
    console.warn('[BG] dropped DOM capture message: no valid sender tab');
    return;
  }

  const pageUrl = sender.tab?.url ?? null;

  void (async () => {
    for (const capture of captures) {
      await applyCapture({ ...capture, tabId, pageUrl });
    }
  })();
});

// SPA sites navigate constantly within one origin - someone browsing ten profiles on
// the same site wants all of them accumulated. Only clear when the top-level page's
// origin actually changes. Comparing frameId 0 only avoids treating an iframe
// navigation (e.g. an ad or embed reloading) as if the user left the site.
chrome.webNavigation.onCommitted.addListener((details) => {
  if (details.frameId !== 0) return;
  void handleNavigation(details.tabId, details.url);
});

// Split out from the listener so we can await hydration before comparing origins.
// The service worker sleeps exactly when the user stops interacting - the moment
// right before they navigate away - so "sleep, then navigate cross-origin" is a
// common pattern, not a rare one. Without waiting for the persisted origin to load
// first, a fresh service worker has no in-memory tabOrigins for this tab, and a real
// cross-origin navigation would look identical to a first-ever navigation and be
// missed, silently mixing two sites' images in one list.
async function handleNavigation(tabId: number, url: string): Promise<void> {
  const newOrigin = originOf(url);
  if (!newOrigin) return;

  await getTabRecords(tabId);

  const previousOrigin = tabOrigins.get(tabId);
  tabOrigins.set(tabId, newOrigin);

  // previousOrigin === undefined means we have no known origin to compare against -
  // neither in memory nor persisted (a tab with no capture and no prior commit yet).
  // That's a first-ever navigation, not proof the origin changed, so don't clear on it.
  if (previousOrigin !== undefined && previousOrigin !== newOrigin) {
    void clearTab(tabId);
  }
}

console.log('[BG] service worker started');
