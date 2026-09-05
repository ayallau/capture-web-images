export type ImageSource = 'network' | 'dom';

export interface ImageRecord {
  url: string;
  tabId: number;
  byteSize: number | null;
  /** null means "unknown", not "generic binary" — stage 7 falls back to the URL extension, never a fabricated MIME type. */
  mimeType: string | null;
  /** Which capture path(s) produced this record — a merged record holds both, and network-only is why altText/width/height are null. */
  source: ImageSource[];
  fileName: string | null;
  altText: string | null;
  /** Rendered size from getBoundingClientRect(), DOM-only — null on a network-only record. Fallback filter signal when byteSize is null (304s, chunked transfer). */
  width: number | null;
  height: number | null;
  /**
   * The page the image was loaded on. tabId dies with the tab, so this is
   * captured at record-creation time instead. Network captures (background.ts)
   * only have `details.initiator`, so this is origin-only there; DOM captures
   * (content.ts, stage 3) have `location.href`, so this is the full URL there.
   * When stage 3 merges a network record with a DOM record for the same URL,
   * the DOM value wins.
   */
  sourceUrl: string | null;
  /**
   * The top-level page the user is actually on, from sender.tab.url — not the same as
   * sourceUrl. Inside an iframe, sourceUrl is the iframe's own URL (e.g. Facebook renders
   * through an fbsbx.com iframe), while pageUrl is what the user believes they're looking
   * at. DOM-only until merged with a network record for the same URL (DOM wins, same as
   * sourceUrl/altText/width/height) — a network capture has no way to know the top-level
   * tab URL on its own.
   */
  pageUrl: string | null;
  /** HTTP status of the response. null on a DOM-only record (e.g. a data: URL, or a network capture that hasn't arrived yet) — there's no response to report a status for. */
  statusCode: number | null;
  /** Per-tab counter in capture order, assigned once when a URL is first seen (merges keep the original). capturedAt can collide within a millisecond; this gives a definite order, and is stage 7's ZIP filename fallback when fileName is null. */
  seq: number;
  capturedAt: number;
}

/**
 * What content.ts sends via chrome.runtime.sendMessage. Same shape as ImageRecord minus
 * tabId, pageUrl, and seq — the content script runs inside the page, not the extension,
 * so it can't know its own tab id, the top-level tab URL (only background.ts's message
 * sender can see that), or where it falls in the tab's capture sequence. background.ts
 * fills all three in when it receives the message.
 */
export type DomImageCapture = Omit<ImageRecord, 'tabId' | 'pageUrl' | 'seq'>;
