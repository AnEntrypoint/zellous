# Zellous

Serverless voice and chat over public Nostr relays. No backend required.

**Live app:** https://anentrypoint.github.io/zellous/nostr-chat/

## Features

- Voice channels — click to join, click again to leave (WebRTC mesh, dynamic mesh→star SFU hub election at 3+ peers via RTT scoring)
- Text chat via Nostr events, with reply/delete, markdown, mentions, and link/code-block rendering
- Server/community management with invite links (`?room=<serverId>`)
- Right-click server icons for context menu (Copy Invite Link, Edit, Leave, Delete)
- Join preview modal when opening an invite URL
- Mobile-responsive layout, keyboard navigation, and WCAG AA color contrast
- Opus audio codec, push-to-talk and VAD modes, webcam support
- Role management — Owner/Admin/Mod badges in member list and voice tiles
- Admin-only server announcements and kick-from-voice
- Command palette (Ctrl/Cmd+K), emoji picker, thread panel, per-server pages

## Usage

Open the app and connect with:
- A Nostr browser extension (NIP-07) — the extension holds your key; this app never sees it.
- A private key (`nsec1...`)
- Generate a new ephemeral key

If you generate or import a key directly (not via extension), it is stored as
plaintext in your browser's `localStorage`, unencrypted, with no passphrase.
**This is the only copy of your identity.** There is deliberately no backend
and no account here — "your keys are your identity" means clearing site
data, switching browsers or devices, or losing the device is permanent,
unrecoverable identity loss with no password-reset path even conceptually
possible. **Back up your key** (Settings → Account → "Back up key") before
you rely on this identity for anything, and treat it like a password: any
XSS bug in this app or a compromised dependency could read it directly.
Switching to extension auth clears any locally-stored key from this app's
storage, so the two mechanisms don't silently compete for which identity
you're posting as after a later page reload.

## Trust model

This is a static client with no backend by design — that has real
tradeoffs, disclosed here rather than left implicit:

- **No relay-side moderation.** Public rooms sit on open, unauthenticated
  NIP-28 relays; anyone can post anything, and "private" servers still ride
  on those same public relays — actual access control depends entirely on
  relay-side configuration this client cannot enforce or guarantee.
- **"Delete" is a request, not a guarantee.** It publishes a NIP-09 kind:5
  deletion event; relays are not obligated to honor it, and other clients
  may already have cached the original message.
- **Rate-limiting is client-side only** (chat.js enforces a 5-messages/10s
  cap on the composer this UI drives) — it slows down accidental flooding
  through this app's own send path, not a hostile client that bypasses this
  UI and publishes directly against the relay's own event-rate limits.
- **Runtime dependencies are fetched live** from esm.sh (wireweave,
  nostr-tools) and cdn.jsdelivr.net (markdown/syntax-highlighting libs), all
  pinned to exact versions so the executing code cannot change without a
  deliberate pin bump in this repo — but there is no Subresource Integrity
  hash yet, so CDN or upstream-package compromise remains a real risk this
  pinning narrows but does not eliminate.
- **No operational visibility.** There is no backend to log to, monitor, or
  run incident response from — if something breaks or is abused, this
  client has no built-in way to detect or report it.

## Local Development

`docs/` is a static site with no build step; serve it with correct MIME types for `.js`/`.mjs` module scripts:

```bash
npx serve docs
```

Visit `http://localhost:3000/nostr-chat/`. See `AGENTS.md` for the full local dev-server + browser-witness validation loop used when making changes.

### Testing voice/signaling locally

There is nothing extra to run — voice and signaling both work against `npx serve docs` exactly as they do on the deployed site, with no local relay or signaling server of any kind:

- **Signaling** goes over the same public Nostr relays the deployed app uses (kind 30078 events) — there is no local relay to stand up.
- **Voice** is native browser WebRTC. On the same machine/LAN, no STUN/TURN is needed at all (see Architecture above); across networks, the browser's default public STUN is used automatically.

To actually exercise a voice/signaling session locally:
1. Serve `docs/` (as above) and open two browser tabs/windows to the same `nostr-chat/` URL (an incognito/private window for the second one keeps it a separate identity, since keys persist in `localStorage`).
2. Join the same voice channel from both. They negotiate a real WebRTC connection through the same relays the deployed app uses — no additional local infrastructure, environment variable, or flag is required.
3. To test the 3+-peer SFU hub election path, open a third tab the same way.

## Architecture

Static site — `docs/` directory served via GitHub Pages. Full details (including the SDK consumption model) live in `AGENTS.md`; short version:

- `docs/nostr-chat/index.html` — app entry point
- `docs/js/` — first-party client modules: feature logic (chat, voice, auth, files, queue, ...) plus `wireweave-bridge.js`, which wires the protocol layer to `window.*` globals, and `nostr-adapter.js`, which adapts app state to the UI layer
- `docs/js/state.js` — shared Preact-signals state module
- The real Nostr/voice protocol implementation (events, relay pool, auth, channels, roles, voice signaling) lives in the `wireweave` package, consumed live over `https://esm.sh/wireweave` — no local vendored copy
- The entire chat/community UI (`mountCommunityApp`) is owned by the `anentrypoint-design` SDK and consumed live from its GitHub Pages deploy (`https://anentrypoint.github.io/design/247420.js`/`.css`) — there is no local vendored copy or bespoke UI code in this repo

Voice uses native WebRTC with Nostr kind 30078 events as the signaling channel. No server, no STUN/TURN required for LAN; uses default browser STUN for WAN. Hub election, RTT scoring, and SFU forwarding live in `wireweave`'s `voice.js`.

**Voice topology tradeoffs, disclosed plainly:** above 2 peers, one participant's own browser is elected "hub" (lowest average RTT) and relays everyone else's audio — that peer absorbs disproportionate bandwidth/CPU, and closing its tab or a poor connection degrades the whole room. WebRTC's DTLS-SRTP transport encryption means the hub peer necessarily has access to decrypted audio for everyone it relays (there is no end-to-end encryption layered on top of transport encryption) — this is an inherent property of client-side SFU relay, not a bug. Only STUN/ICE-restart-on-stall is implemented; there is no TURN relay, so users behind symmetric NAT or restrictive corporate/campus firewalls may be unable to connect at all.

## Browser Support

Voice uses standard `RTCPeerConnection` + `getUserMedia` (Opus is negotiated
automatically as part of WebRTC, not via the WebCodecs API this repo does
not currently use) — supported in current Chrome/Chromium, Firefox, and
Safari. Push-to-talk's held-buffer queue feature additionally uses
`MediaRecorder`; its Opus-in-WebM/OGG container support has historically
had gaps in Safari specifically, so PTT's queued-segment playback may
degrade there even though live voice itself works.

## License

MIT
