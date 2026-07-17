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
- A Nostr browser extension (NIP-07)
- A private key (`nsec1...`)
- Generate a new ephemeral key

## Local Development

`docs/` is a static site with no build step; serve it with correct MIME types for `.js`/`.mjs` module scripts:

```bash
npx serve docs
```

Visit `http://localhost:3000/nostr-chat/`. See `AGENTS.md` for the full local dev-server + browser-witness validation loop used when making changes.

## Architecture

Static site — `docs/` directory served via GitHub Pages. Full details (including the SDK consumption model) live in `AGENTS.md`; short version:

- `docs/nostr-chat/index.html` — app entry point
- `docs/js/` — first-party client modules: feature logic (chat, voice, auth, files, queue, ...) plus `wireweave-bridge.js`, which wires the protocol layer to `window.*` globals, and `nostr-adapter.js`, which adapts app state to the UI layer
- `docs/js/state.js` — shared Preact-signals state module
- `docs/vendor/wireweave/src/` — the real Nostr/voice protocol implementation (events, relay pool, auth, channels, roles, voice signaling)
- The entire chat/community UI (`mountCommunityApp`) is owned by the `anentrypoint-design` SDK and consumed live from its GitHub Pages deploy (`https://anentrypoint.github.io/design/247420.js`/`.css`) — there is no local vendored copy or bespoke UI code in this repo

Voice uses native WebRTC with Nostr kind 30078 events as the signaling channel. No server, no STUN/TURN required for LAN; uses default browser STUN for WAN. Hub election, RTT scoring, and SFU forwarding live in `docs/vendor/wireweave/src/voice.js`.

## Browser Support

Requires WebCodecs API (AudioEncoder/AudioDecoder):
- Chrome/Chromium 94+
- Edge 94+
- Opera 80+

## License

MIT
