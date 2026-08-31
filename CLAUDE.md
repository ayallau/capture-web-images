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

| Decision | Rejected alternative | Reason |
|---|---|---|
| esbuild | CRXJS, WXT, Vite | 3 entry points, no framework. Extra abstraction not justified. |
| Side Panel | Popup, full tab | Popup closes on outside click, breaking multi-select. Panel also has a DOM, which the service worker lacks. |
| Collect URLs + re-fetch | `chrome.debugger` | Debugger shows a permanent warning banner and conflicts with DevTools. Violates the hard UX requirement below. |
| No UI framework | React, Svelte | Revisit only if the panel list logic becomes unmanageable. |

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

| | `background.ts` | `content.ts` | `panel.ts` |
|---|---|---|---|
| Environment | Service Worker | Injected into every page | Side Panel HTML page |
| DOM access | No | Yes (the page's DOM) | Yes (its own DOM) |
| Lifetime | Sleeps after ~30s idle | Lives with the page | Lives while panel is open |
| Debug at | `chrome://extensions` -> "Service worker" | F12 on the page | Right-click in panel -> Inspect |
| Responsibility | `chrome.webRequest` capture, state ownership | `MutationObserver`, DOM scan, alt/title text | Render, filter, select, fetch, ZIP, download |

They do not share memory. They communicate via `chrome.runtime.sendMessage`
and `chrome.storage.session`.

Prefix every `console.log` with its context: `[BG]`, `[CS]`, `[PANEL]`.

## Inline SVG is a first-class source (stage 3)

Measured on a real page: 86 `<img>` tags, 251 inline `<svg>`, 35 CSS
backgrounds, 0 `data:` URLs — and only 3 of the SVGs showed up in network
capture. Inline SVG is not edge-case content; it's the majority of what's
on the page. `content.ts` must scan for it as a primary source, same as
`<img>`, not defer it to stage 8.

- A `<svg>` nested inside another `<svg>` counts once, not once per level —
  dedupe by walking only top-level `<svg>` elements, don't count every
  `<svg>` match a naive `querySelectorAll('svg')` returns.
- Inline SVG has no `byteSize` — there's no network response to read a
  `Content-Length` from. Capture rendered `width`/`height` from
  `getBoundingClientRect()` on the record instead, so stage 6's size
  filter has a dimension-based signal to work with (most inline SVGs are
  UI icons and should be filterable the same way tracking pixels are).

## MV3 constraints — these shaped the architecture

1. **No `eval` / `new Function`** — CSP blocks it. Vet dependencies for internal use of it.
2. **No remotely hosted code** — no CDN `<script>`. Everything bundled. (Fetching *data* over the network is fine.)
3. **No `URL.createObjectURL` in the service worker** — no DOM there. All fetching, zipping and downloading happens in `panel.ts`.
4. **No in-memory state** — the service worker restarts from scratch on wake. All capture state goes to `chrome.storage.session`, keyed by `tabId`.
5. **`webRequest` is metadata-only** — gives URL, headers, `Content-Length`, MIME type. Never the response body. This is why we re-fetch at export time.

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
step 1 isn't just the CORS-friendly first try — it's the *only* step likely
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

## Known edge cases (stage 8, not before)

`data:` URLs, `srcset`, CSS `background-image`, iframes (`all_frames: true`),
sites with Referer/hotlink protection, `Cache-Control: no-store`, tracking
pixels and spacers (minimum size filter).

Inline SVG is no longer on this list — see "Inline SVG is a first-class
source" above. It's handled at stage 3, not stage 8.

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

## Build stages

Work one stage at a time. Do not implement a later stage unless asked.

- [ ] 1. Skeleton: `manifest.json`, build pipeline, Side Panel opens
- [ ] 2. Capture v1: `webRequest` only, log to console
- [ ] 3. Capture v2: content script + `MutationObserver`, merge sources
- [ ] 4. State: `storage.session` per tab, dedupe by URL, reset on navigation
- [ ] 5. Panel UI: thumbnail + text + size list
- [ ] 6. Filters: size range, free-text search, multi-select
- [ ] 7. Export: fetch chain, ZIP via fflate, download, failure reporting
- [ ] 8. Edge cases (time-boxed)
- [ ] 9. Optional advanced mode: `chrome.debugger` toggle, off by default
- [ ] 10. Icons, settings screen, Web Store packaging

**Current stage: 1**

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