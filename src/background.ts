import type { DomImageCapture, ImageRecord, ImageSource } from './types';
import { extractFileName } from './url-utils';

chrome.sidePanel
  .setPanelBehavior({ openPanelOnActionClick: true })
  .catch((error) => console.error('[BG] failed to set panel behavior', error));

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

function getHeader(headers: chrome.webRequest.HttpHeader[] | undefined, name: string): string | null {
  const header = headers?.find((h) => h.name.toLowerCase() === name.toLowerCase());
  return header?.value ?? null;
}

// In-memory only - lost whenever the service worker sleeps. That's fine for stage 3,
// which is console.log only; durable cross-restart state is stage 4's storage.session.
const knownRecords = new Map<string, ImageRecord>();

function pick<T>(preferred: T | null | undefined, fallback: T | null | undefined): T | null {
  return preferred ?? fallback ?? null;
}

function dedupeSources(sources: ImageSource[]): ImageSource[] {
  return Array.from(new Set(sources));
}

// existing = what we already knew about this URL, incoming = the new capture just received.
function mergeRecords(existing: ImageRecord, incoming: ImageRecord): ImageRecord {
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
    statusCode: pick(networkSide?.statusCode, otherNetworkSide?.statusCode),
    capturedAt: Math.min(existing.capturedAt, incoming.capturedAt),
  };
}

function logCapture(record: ImageRecord): void {
  console.log(`[BG] capture [${record.source.join('+')}]`, record);
}

function applyCapture(incoming: ImageRecord): void {
  const existing = knownRecords.get(incoming.url);
  const result = existing ? mergeRecords(existing, incoming) : incoming;

  knownRecords.set(incoming.url, result);
  logCapture(result);
}

chrome.webRequest.onHeadersReceived.addListener(
  (details) => {
    if (details.tabId < 0) return;

    const byteSizeHeader = getHeader(details.responseHeaders, 'content-length');
    const mimeTypeHeader = getHeader(details.responseHeaders, 'content-type');

    applyCapture({
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
      statusCode: details.statusCode,
      capturedAt: Date.now(),
    });
  },
  { urls: ['<all_urls>'], types: ['image'] },
  ['responseHeaders'],
);

chrome.runtime.onMessage.addListener((captures: DomImageCapture[], sender) => {
  const tabId = sender.tab?.id;
  if (tabId === undefined) {
    console.warn('[BG] dropped DOM capture message with no sender tab');
    return;
  }

  for (const capture of captures) {
    applyCapture({ ...capture, tabId });
  }
});

console.log('[BG] service worker started');
