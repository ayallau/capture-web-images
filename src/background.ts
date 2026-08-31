import type { ImageRecord } from './types';

chrome.sidePanel
  .setPanelBehavior({ openPanelOnActionClick: true })
  .catch((error) => console.error('[BG] failed to set panel behavior', error));

function getHeader(headers: chrome.webRequest.HttpHeader[] | undefined, name: string): string | null {
  const header = headers?.find((h) => h.name.toLowerCase() === name.toLowerCase());
  return header?.value ?? null;
}

function extractFileName(url: string): string | null {
  let pathname: string;
  try {
    pathname = new URL(url).pathname;
  } catch {
    return null;
  }

  const lastSegment = pathname.split('/').pop();
  if (!lastSegment) return null;

  try {
    return decodeURIComponent(lastSegment);
  } catch {
    return lastSegment;
  }
}

chrome.webRequest.onHeadersReceived.addListener(
  (details) => {
    if (details.tabId < 0) return;

    const byteSizeHeader = getHeader(details.responseHeaders, 'content-length');
    const mimeTypeHeader = getHeader(details.responseHeaders, 'content-type');

    const record: ImageRecord = {
      url: details.url,
      tabId: details.tabId,
      byteSize: byteSizeHeader !== null ? Number(byteSizeHeader) : null,
      mimeType: mimeTypeHeader,
      source: 'network',
      fileName: extractFileName(details.url),
      altText: null,
      sourceUrl: details.initiator ?? null,
      statusCode: details.statusCode,
      capturedAt: Date.now(),
    };

    console.log('[BG] captured image', record);
  },
  { urls: ['<all_urls>'], types: ['image'] },
  ['responseHeaders'],
);

console.log('[BG] service worker started');
