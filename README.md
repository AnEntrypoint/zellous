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

## Browser Support

Requires WebCodecs API (AudioEncoder/AudioDecoder):
- Chrome/Chromium 94+
- Edge 94+
- Opera 80+

## License

MIT
