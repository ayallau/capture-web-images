// ═══════════════════════════════════════════════════════════
// [1] Module Imports and Type Declarations
// ═══════════════════════════════════════════════════════════
import type { DomImageCapture } from './types';
import { extractFileName } from './url-utils';

// ═══════════════════════════════════════════════════════════
// [2] Constants and Local State Management
// ═══════════════════════════════════════════════════════════
const DEBOUNCE_MS = 300;

const sentUrls = new Set<string>();
let debounceTimer: ReturnType<typeof setTimeout> | undefined;

// Images the sweep skipped for having no usable URL yet, so we don't attach a
// second 'load' listener to the same element on the next debounced sweep.
const imagesAwaitingLoad = new WeakSet<HTMLImageElement>();

// ═══════════════════════════════════════════════════════════
// [3] Caption Extraction from Nearest Figcaption
// ═══════════════════════════════════════════════════════════
function nearestFigcaptionText(img: HTMLImageElement): string | null {
  const text = img.closest('figure')?.querySelector('figcaption')?.textContent?.trim();
  return text ? text : null;
}

// ═══════════════════════════════════════════════════════════
// [4] DOM Image Capture Record Construction
// ═══════════════════════════════════════════════════════════
function buildCapture(img: HTMLImageElement, url: string): DomImageCapture {
  const rect = img.getBoundingClientRect();

  return {
    url,
    byteSize: null,
    mimeType: null,
    source: ['dom'],
    fileName: extractFileName(url),
    altText: img.alt || img.title || nearestFigcaptionText(img),
    width: rect.width,
    height: rect.height,
    sourceUrl: location.href,
    statusCode: null,
    capturedAt: Date.now(),
  };
}

// Fires once when a previously-URL-less <img> finishes loading. Only schedules a
// sweep if this specific element actually has a URL now - otherwise nothing changed
// for it and a full-page sweep would run for no reason.
function handleImageLoad(img: HTMLImageElement): void {
  imagesAwaitingLoad.delete(img);
  if (img.currentSrc || img.src) scheduleSweep();
}

// ═══════════════════════════════════════════════════════════
// [5] DOM Tree Sweeping and Record Dispatch
// ═══════════════════════════════════════════════════════════
function sweep(): void {
  const captures: DomImageCapture[] = [];

  for (const img of document.querySelectorAll('img')) {
    // currentSrc, not src: with srcset present, src reports the markup default
    // while the browser actually loaded something else. But some lazy-loaders
    // (e.g. Pinterest) insert the <img> with src already set while currentSrc is
    // still empty until the browser finishes loading it - an empty currentSrc
    // doesn't mean "nothing to capture", so fall back to src rather than skip.
    const url = img.currentSrc || img.src;

    if (!url) {
      // No src at all yet (a lazier loader that fills it in later, e.g. from a
      // data-src swap). The observer only fires on insertion/attribute changes,
      // so without this the element would never be looked at again once those
      // stop - re-sweep once it actually loads instead of losing it for good.
      if (!imagesAwaitingLoad.has(img)) {
        imagesAwaitingLoad.add(img);
        img.addEventListener('load', () => handleImageLoad(img), { once: true });
      }
      continue;
    }

    if (sentUrls.has(url)) continue;

    sentUrls.add(url);
    captures.push(buildCapture(img, url));
  }

  if (captures.length === 0) return;

  console.log(`[CS] sending ${captures.length} image record(s)`);
  chrome.runtime.sendMessage(captures).catch((error: unknown) => {
    console.error('[CS] failed to send image records', error);
  });
}

// ═══════════════════════════════════════════════════════════
// [6] Debounced Sweep Scheduling
// ═══════════════════════════════════════════════════════════
function scheduleSweep(): void {
  if (debounceTimer !== undefined) clearTimeout(debounceTimer);
  debounceTimer = setTimeout(sweep, DEBOUNCE_MS);
}

// ═══════════════════════════════════════════════════════════
// [7] Initial Sweep and DOM Mutation Observer
// ═══════════════════════════════════════════════════════════
// Initial sweep catches everything rendered before this script was injected.
// The observer alone would miss it; a one-shot scan alone would miss anything
// a virtualized feed removes and re-adds later (e.g. Facebook: ~14 <img> in the
// DOM at any time vs ~44 seen over a session of scrolling). Both are required.
sweep();

const observer = new MutationObserver(scheduleSweep);
observer.observe(document.documentElement, {
  childList: true,
  subtree: true,
  attributes: true,
  attributeFilter: ['src', 'srcset'],
});

console.log('[CS] content script loaded');
