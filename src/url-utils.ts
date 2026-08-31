export function extractFileName(url: string): string | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }

  // data: and other non-http(s) schemes have no meaningful path segment to name a file after.
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;

  const lastSegment = parsed.pathname.split('/').pop();
  if (!lastSegment) return null;

  try {
    return decodeURIComponent(lastSegment);
  } catch {
    return lastSegment;
  }
}
