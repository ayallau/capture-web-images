# Capture Web Images — Chrome Extension

A Chrome extension that captures every image loaded on a page, accumulates them
across the browsing session, and lets the user filter, multi-select, ZIP and
download them from a Side Panel.

## Commands

- Build (watch): `npm run dev`
- Build (production): `npm run build`
- Type check only: `npm run typecheck`
- Load into Chrome: `chrome://extensions` -> Developer mode -> Load unpacked -> select `dist/`

## Stack

- Manifest V3
- TypeScript (strict mode)
- esbuild — three entry points: `background.ts`, `content.ts`, `panel.ts`
- `fflate` for ZIP creation (bundled locally via npm)
- No UI framework. Plain DOM + TypeScript.

## Decisions already made — do not re-propose these

| Decision                | Rejected alternative | Reason                                                                                                         |
| ----------------------- | -------------------- | -------------------------------------------------------------------------------------------------------------- |
| esbuild                 | CRXJS, WXT, Vite     | 3 entry points, no framework. Extra abstraction not justified.                                                 |
| Side Panel              | Popup, full tab      | Popup closes on outside click, breaking multi-select. Panel also has a DOM, which the service worker lacks.    |
| Collect URLs + re-fetch | `chrome.debugger`    | Debugger shows a permanent warning banner and conflicts with DevTools. Violates the hard UX requirement below. |
| No UI framework         | React, Svelte        | Revisit only if the panel list logic becomes unmanageable.                                                     |

## Hard UX requirement

The end user must do NOTHING beyond installing the extension and opening the
side panel. No refreshing, no toggles, no DevTools, no external programs.
Any proposed solution that adds a user step is wrong by default.

Consequences:

- Capture starts at service worker boot, not when the panel opens.
- On `onInstalled`, inject the content script into already-open tabs via
  `chrome.scripting.executeScript` — otherwise those tabs need a manual refresh.

## The three runtime contexts

This is the core of the architecture. Each file runs in a different environment
with different capabilities. Do not mix them up.

|                | `background.ts`                              | `content.ts`                                 | `panel.ts`                                   |
| -------------- | -------------------------------------------- | -------------------------------------------- | -------------------------------------------- |
| Environment    | Service Worker                               | Injected into every page                     | Side Panel HTML page                         |
| DOM access     | No                                           | Yes (the page's DOM)                         | Yes (its own DOM)                            |
| Lifetime       | Sleeps after ~30s idle                       | Lives with the page                          | Lives while panel is open                    |
| Debug at       | `chrome://extensions` -> "Service worker"    | F12 on the page                              | Right-click in panel -> Inspect              |
| Responsibility | `chrome.webRequest` capture, state ownership | `MutationObserver`, DOM scan, alt/title text | Render, filter, select, fetch, ZIP, download |

They do not share memory. They communicate via `chrome.runtime.sendMessage`
and `chrome.storage.session`.

Prefix every `console.log` with its context: `[BG]`, `[CS]`, `[PANEL]`.

## Inline SVG — deferred to stage 8

Measured across three real sites, inline `<svg>` outnumbers `<img>` by
2-8x (251/86, 42/26, 64/30), while only a handful of SVGs ever appear in
network capture. But almost all of them are UI icons — arrows, hearts,
close buttons — not content anyone would want to download. Capturing them
at stage 3 would leave the panel list roughly 75% chrome.

Deferred to stage 8. When it is implemented:

- A `<svg>` nested inside another counts once, not once per level — walk
  top-level `<svg>` elements only, don't take every match a naive
  `querySelectorAll('svg')` returns.
- Inline SVG has no `byteSize` — there is no network response to read a
  `Content-Length` from, so the stage 6 size filter cannot reach it on
  bytes. It needs the dimension signal described under "Shared data model".
- `<use href="#id">` pointing at an external sprite serializes to nothing.
- SVG that depends on the page's stylesheet renders broken once extracted.

## MV3 constraints — these shaped the architecture

1. **No `eval` / `new Function`** — CSP blocks it. Vet dependencies for internal use of it.
2. **No remotely hosted code** — no CDN `<script>`. Everything bundled. (Fetching _data_ over the network is fine.)
3. **No `URL.createObjectURL` in the service worker** — no DOM there. All fetching, zipping and downloading happens in `panel.ts`.
4. **No in-memory state** — the service worker restarts from scratch on wake. All capture state goes to `chrome.storage.session`, keyed by `tabId`.
5. **`webRequest` is metadata-only** — gives URL, headers, `Content-Length`, MIME type. Never the response body. This is why we re-fetch at export time.
6. **`details.tabId` can be negative** — `chrome.webRequest` reports a negative `tabId` (typically `-1`) for requests not owned by any tab: a site's own service worker, prefetch, browser-internal requests. `background.ts` drops any request with `tabId < 0` at capture time — stage 4 keys all state by `tabId`, and a negative one has no panel that could ever display it, so capturing it only pollutes storage.

## Fetch fallback chain (export time)

Try in order, per image, until one succeeds:

1. `fetch` from the content script (correct cache partition, correct Referer/cookies) — may fail on CORS.
2. `fetch` from the service worker with `cache: 'force-cache'` (bypasses CORS via host permissions) — may re-download due to cache partitioning.
3. `fetch` from the service worker without `force-cache`.

Failures must be surfaced to the user as a count, never swallowed silently.

**Signed/expiring URLs:** several CDN patterns embed a short-lived signature
in the URL and 403 once it expires — Meta/Instagram (`oe=` hex expiry) and
AWS CloudFront (`Expires` + `Signature` + `Key-Pair-Id` query params) are
the two known so far. Both expire within minutes to hours. On such sites
step 1 isn't just the CORS-friendly first try — it's the _only_ step likely
to succeed, because it's the only one hitting the correct cache partition;
steps 2 and 3 go to the network with an already-expired URL and will 403.
If the user waits too long before exporting, failures on these sites are
expected, not a bug. The failure message shown to the user should say so
(e.g. distinguish "link expired" from a generic fetch failure) rather than
reading as broken.

These CDN paths are also often opaque hashes with no file extension at all
(e.g. `/files/a/a3/a3f3a49...`) — another reason the ZIP filename's
extension must be derived from `mimeType` at export time, never from the
URL path.

## Shared data model

All three contexts read and write the same record shape. It lives in
`src/types.ts` and is the single source of truth. Never redefine a field
inline — mismatched field names between writer and reader are the most likely
silent bug in this project.

`ImageRecord` carries rendered `width`/`height` from
`getBoundingClientRect()`, populated by the content script. This is not
SVG-specific: many network records come back with `byteSize: 0` (304
responses) or `null` (chunked transfer), so the stage 6 filter cannot rely
on bytes alone. Dimensions are the fallback signal.

`seq: number` — per-tab counter in capture order, assigned once when a URL
is first seen; merges keep the original. `capturedAt` can collide within a
millisecond, so this gives a definite order, and stage 7 uses it as the ZIP
filename fallback when `fileName` is null. Derived from the hydrated
records (max existing seq), never from a separate counter — a separate one
desyncs after the service worker sleeps.

### Merge rules (network record + DOM record, same URL)

Match on URL. The content script must read `img.currentSrc`, not `img.src` —
when `srcset` is present, `src` reports the markup default while the browser
actually loaded something else.

- DOM wins: `sourceUrl` (full page URL beats `initiator`'s origin-only
  value), `altText`, `width`, `height`
- DOM wins: `pageUrl` — the top-level page the user is actually on, from
  `sender.tab.url`. Not the same as `sourceUrl`: inside an iframe
  `sourceUrl` is the iframe's own URL (Facebook renders through an
  fbsbx.com iframe) while `pageUrl` is what the user believes they're
  looking at. The panel and the CSV want `pageUrl`.
- Network wins: `byteSize`, `mimeType`, `statusCode`
- `capturedAt`: keep the earlier of the two
- A non-null value always beats `null`, even when it comes from the
  losing side

A merged record came from both sources, so `source` can no longer hold a
single value — use `('network' | 'dom')[]`. Knowing an image was
network-only is what explains why it has no alt text.

### Storage shape (stage 4)

`chrome.storage.session` keys each tab as `tab:<id>`, holding
`{ origin: string | null, records: Record<url, ImageRecord> }` — not a bare
records object. The panel reads `.records`, never the stored value directly.
`origin` is persisted alongside the records (not kept only in memory) so a
service worker that wakes mid-session compares against the origin it last
knew about, rather than an in-memory value that resets to nothing on every
sleep.

The in-memory `Map<tabId, Map<url, ImageRecord>>` is the source of truth
while the service worker is alive; storage is a debounced mirror of it,
never the other way around. Merges are synchronous with no `await` in the
middle, so JS's single thread gives atomicity for free. Flushes are
debounced ~300ms, single-flight per tab with a trailing flush: if a write
is already in flight the tab is marked dirty rather than starting a second
one, since a slow earlier write could otherwise land after a faster later
one and clobber it. A per-tab generation counter guards against a flush
scheduled before an origin change landing after it.

## Known edge cases (stage 8, not before)

`data:` URLs, `srcset`, CSS `background-image`, iframes (`all_frames: true`),
sites with Referer/hotlink protection, `Cache-Control: no-store`, tracking
pixels and spacers (minimum size filter).

Inline SVG belongs here too — see "Inline SVG — deferred to stage 8" above
for the measurements and the specific traps.

- Chrome classifies tracking beacons as type `"image"` even when the server
  returns `text/html`. Stage 6 must filter on actual `mimeType`, not on
  Chrome's resource type.
- ~15% of captures on ad-heavy sites are 1x1 tracking pixels (42 bytes).
  Minimum size filter is not optional.
- 304 Not Modified responses are valid cached images with no body and no
  `Content-Length`/`Content-Type` headers — `byteSize`/`mimeType` end up
  `null`. Distinguish these from genuinely broken responses via
  `statusCode`, not by treating null fields as failure.
- CSS `background-image` URLs already arrive through `webRequest` like any
  other image request — the content script only adds context (which
  element, nearby text), it doesn't add coverage. So this item of stage 8
  is a metadata improvement, not a coverage gap.
- Requests from other open tabs arrive in the same listener. Per-tab state
  isolation in stage 4 must be verified, not assumed.
- `webRequest` fires on 3xx redirects too. A 3xx has no body and is never an
  image. Stage 6 filter: exclude `statusCode >= 300` except 304, which IS a
  valid cached image.
- Ad-network iframes generate heavy cookie-sync traffic typed as `"image"`.
  On Pinterest, ~30 of 76 records came from `eus.rubiconproject.com`, not
  the page. Filtering on `sourceUrl` origin is more precise than a size
  threshold.
- Lazy-loading sites (Pinterest) insert `<img>` with `currentSrc` still
  empty. `content.ts` falls back to `src` and attaches a one-shot `load`
  listener; without this, zero DOM captures on that site.
- Multi-frame pages send the same URL from several frames. `applyCapture`
  skips the write when the merge produces no change.

  ## Panel implementation notes (stage 5)

- **Read from `tab:<id>.records`**, never the stored value directly. The
  storage entry is `{ origin, records }` — see "Storage shape (stage 4)".
- **Live updates via `chrome.storage.onChanged`**, not polling. Records
  arrive in bursts (a scroll can add 30 in one flush), so polling either
  wastes cycles between bursts or lags behind them. The listener fires
  exactly when a flush lands.
- **Thumbnails are `<img src={record.url}>` directly.** No thumbnail
  generation — the browser renders from its own cache, and the panel is a
  normal DOM page with no canvas or CORS problem to solve. A broken
  thumbnail is useful signal rather than a defect: it tells the user in
  advance which images will likely fail at export (expired signed URL,
  evicted from cache, `no-store`).
- **The list will look noisy and that is correct at this stage.** Expect
  tracking pixels, 200-byte UI icons, ad-network cookie-sync requests.
  Filtering is stage 6; stage 5 renders everything the store holds.
- **Virtualize the list** once it exceeds a few hundred entries. Measured
  captures per page ranged from ~30 to ~150 in a single session, and the
  count keeps growing while the user browses. Rendering every row eagerly
  will stall the panel.

## Build stages

Work one stage at a time. Do not implement a later stage unless asked.

- [x] 1. Skeleton: `manifest.json`, build pipeline, Side Panel opens
- [x] 2. Capture v1: `webRequest` only, log to console
- [x] 3. Capture v2: content script + `MutationObserver`, merge sources
- [x] 4. State: `storage.session` per tab, dedupe by URL, reset on navigation
- [ ] 5. Panel UI: thumbnail + text + size list
- [ ] 6. Filters: size range, free-text search, multi-select
- [ ] 7. Export: fetch chain, ZIP via fflate, download, failure reporting
- [ ] 8. Edge cases (time-boxed)
- [ ] 9. Optional advanced mode: `chrome.debugger` toggle, off by default
- [ ] 10. Icons, settings screen, Web Store packaging

**Current stage: 5**

## Conventions

- Named exports, never default exports
- `strict: true` — no implicit `any`, no non-null assertions without a comment
- Never edit anything in `dist/` — it is generated and wiped on every build
- `public/manifest.json` is the source; the build copies it to `dist/`
- Async `chrome.*` APIs: use promises, not callbacks
- Writes to `storage.session` must be serialized (queue or debounce) — concurrent
  writes from rapid image loads will clobber each other
- `host_permissions` must stay `http://*/*` + `https://*/*`, never `<all_urls>` —
  the narrower pair covers every capturable image without also matching
  `file://`, `ftp://` and extension/chrome-internal schemes

## Language

- Respond to me in Hebrew
- Keep all code, identifiers, comments, commit messages, and file
  contents in English
- When mixing, put Hebrew explanations in separate lines from code —
  not inline within a sentence containing code identifiers
