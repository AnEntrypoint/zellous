# AGENTS.md history

Dated incident narratives, fixed-bug notes and the learning-audit log, moved out of `AGENTS.md` on 2026-10-09. Each entry below is the original paragraph, copied verbatim. The standing rules those paragraphs carried are restated in `AGENTS.md`, so nothing that is still true was dropped.

Editorial notes (outside the quoted entries) on identifiers these entries name that no longer match the tree on 2026-10-09:
- `dmView()` in `nostr-adapter.js` (2026-10-06 entry): not present in the tree. The DM home lives in `docs/js/adapter/dm.js` (`dmConversations`).
- `pageChannels()` in `nostr-adapter.js` (2026-10-07 entry context): now in `docs/js/adapter/rail.js`.
- `scripts/audit-ui.mjs` (2026-10-07 entry): not present in the tree on 2026-10-09.
- `wireweave-bridge.js` as the home of `setAudioConstraints`/`setForceRelay`/`media-warning`: now `docs/js/bridge/voice.js`.

## Validation-loop snippet 2 (port 5173)

**The validation-loop snippet 2 at port 5173 is the exception.** The `.mjs` files it serves need `text/javascript`, which the snippet sets explicitly. If you copy an older snippet that omits the MIME map, `.mjs` module loads fail; use port 5175 or add the MIME map.

## Learning audit (audit log summary)

Audit history from 2026-04-30 through 2026-08-11 (cold-start sampling, several adversarial audit sessions, and the CDN-independence migration) is summarized in rs-learn; the durable outcomes are the rules above and the code itself. Process notes that still apply:

## 2026-10-06: restored the documented CDN consumption

2026-10-06: restored the documented CDN consumption (a repo re-init had left stale vendored `docs/vendor/{design,wireweave}` copies, a dead `.gitmodules` and a root `test.js`; all removed). `zellous.css` was rewritten from 839 layered `!important` lines to a lean file that defers chat, composer and message layout to the SDK; the legacy `#drawerOverlay` is gone. Added a display-name modal (`auth.setDisplayName`, kind:0) and a direct-message home (`dmView()` in `nostr-adapter.js` feeds the SDK's `dmConversations`/`activeDmPeer`/`newDm`/`selectDm` contract). jsdelivr `/gh/@main` purge is rate-limited per path: verify a fresh SDK push against a `@<sha>` URL instead of polling `@main`.

## 2026-10-06 verification note

2026-10-06 (verification note): live witnessing of a fresh `@main` push needs a browser session with an empty HTTP cache (`agent-browser --session <new>`); a reused profile keeps serving the previous `247420.js` for hours and makes a landed fix look undeployed. The legacy hidden auth modal in `index.html` still contains a `.modal-btn.danger` "Logout" button, so selectors for the new `ui.confirm` dialog must be scoped to `[role=alertdialog]`.

## 2026-10-06 engine coverage

2026-10-06 (engine coverage): Safari's engine is testable without root -- Playwright's `ubuntu24.04-x64` WebKit fallback build (`PLAYWRIGHT_HOST_PLATFORM_OVERRIDE`) plus noble `.deb`s extracted with `dpkg -x` into `minibrowser-wpe/sys/lib` (its wrapper script overwrites `LD_LIBRARY_PATH`, so only `sys/lib` works), driven with `playwright-core` and the `iPhone 15` profile (real touch, coarse pointer). It found two bugs Chromium and Firefox hid: SVG icons inside flex buttons collapsed to 4px wide (`svg.ds-icon { flex-shrink: 0 }` in the design repo) and off-canvas drawers letting the page pan sideways (`.ca-app { position: relative; overflow: hidden }` at mobile widths). Firefox 157 plus geckodriver (tarball from download.mozilla.org, extracted with python `lzma`) also runs headless for real-keyboard checks.

## 2026-10-06 hardware-only checks

2026-10-06 (hardware-only checks, never witnessed by an agent): safe-area handling was verified only by substituting `env(safe-area-inset-*)` with 47px/34px in the served CSS under WebKit (header content clears the top inset, composer clears the bottom inset); the on-screen keyboard only by shrinking the viewport. Still needs a human on real iOS Safari and Android Chrome: focus the composer and confirm the page does not zoom and the composer stays above the keyboard; rotate to landscape on a notched iPhone; fling-scroll a long channel; long-press and swipe on message actions; open the drawer with a left-edge swipe (implemented in `ui-shell.js`, verified only with synthetic CDP touches in Chromium, never a real finger).

## 2026-10-07 GUI audit pass, three repos

2026-10-07 (GUI audit pass, three repos): `zellous` and `design` are on `main`; `design` is consumed at `@main`, and `wireweave` is pinned (see above). A user-perspective audit over the live page fixed what it found. Channel reorder now lives in the rail's own `railPill` (drag and Alt+Arrow), via `A.reorderChannel`, which republishes the destination category's full sibling list so a cross-category drop lands in the target category. The mobile hamburger toggles the drawer instead of only opening it. Off-canvas surfaces (the rail and the member list) take `inert` while closed, not `aria-hidden`: webjsx assigns `el[key] = null` as an expando for keys not `in el`, so a nulled `aria-hidden` attribute stays in the DOM. The 900px breakpoint is tracked in JS via `matchMedia`, because crossing it changes no signal and so triggers no re-render on its own. The mobile header carries the current server name ahead of the channel name, since below 900px the rail is off-canvas. Unread badges: `wireweave/src/unread.js` opens one subscription per server covering every text channel's `#e` tag, counts events newer than a per-channel persisted last-read, and marks the active channel read as messages land. `scripts/audit-ui.mjs` skips controls scrolled outside their scrollport and hover-only (`opacity: 0`) chrome, files occlusion by an open drawer under `behindOpen`, credits a focus ring drawn on an ancestor, and reports the tappable row next to an undersized control.

