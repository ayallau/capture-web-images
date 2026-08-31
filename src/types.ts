export type ImageSource = 'network' | 'dom';

export interface ImageRecord {
  url: string;
  tabId: number;
  byteSize: number | null;
  /** null means "unknown", not "generic binary" — stage 7 falls back to the URL extension, never a fabricated MIME type. */
  mimeType: string | null;
  source: ImageSource;
  fileName: string | null;
  altText: string | null;
  /**
   * The page the image was loaded on. tabId dies with the tab, so this is
   * captured at record-creation time instead. Network captures (background.ts)
   * only have `details.initiator`, so this is origin-only there; DOM captures
   * (content.ts, stage 3) have `location.href`, so this is the full URL there.
   * When stage 3 merges a network record with a DOM record for the same URL,
   * the DOM value wins.
   */
  sourceUrl: string | null;
  capturedAt: number;
}
