import type { DomImageCapture } from './types';
import { extractFileName } from './url-utils';

const DEBOUNCE_MS = 300;

const sentUrls = new Set<string>();
let debounceTimer: ReturnType<typeof setTimeout> | undefined;

function nearestFigcaptionText(img: HTMLImageElement): string | null {
  const text = img.closest('figure')?.querySelector('figcaption')?.textContent?.trim();
  return text ? text : null;
}

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

function sweep(): void {
  const captures: DomImageCapture[] = [];

  for (const img of document.querySelectorAll('img')) {
    // currentSrc, not src: with srcset present, src reports the markup default
    // while the browser actually loaded something else.
    const url = img.currentSrc;
    if (!url || sentUrls.has(url)) continue;

    sentUrls.add(url);
    captures.push(buildCapture(img, url));
  }

  if (captures.length === 0) return;

  console.log(`[CS] sending ${captures.length} image record(s)`);
  chrome.runtime.sendMessage(captures).catch((error: unknown) => {
    console.error('[CS] failed to send image records', error);
  });
}

function scheduleSweep(): void {
  if (debounceTimer !== undefined) clearTimeout(debounceTimer);
  debounceTimer = setTimeout(sweep, DEBOUNCE_MS);
}

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
