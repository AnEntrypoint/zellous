# Zellous

Serverless voice and chat over public Nostr relays. No backend required.

**Live app:** https://anentrypoint.github.io/zellous/nostr-chat/

## Features

- Voice channels — click to join, click again to leave
- Text chat via Nostr events
- Server/community management with invite links (`?room=<serverId>`)
- Right-click server icons for context menu (Copy Invite Link, Edit, Leave, Delete)
- Join preview modal when opening an invite URL
- Mobile-responsive layout — server list as bottom bar, slide-in channel sidebar, 44px touch targets
- WebRTC mesh voice with dynamic hub election (mesh→star SFU at 3+ peers via RTT scoring)
- Opus audio codec (24kbps, 48kHz)
- Push-to-talk and VAD modes
- Webcam support
- Role management — Owner/Admin/Mod badges in member list and voice tiles
- Admin-only server announcements (gold-bordered messages)
- Kick-from-voice via member context menu (admin only)
- **Iframe embedding** — embed the app in parent pages via postMessage bridge API

## Usage

Open the app and connect with:
- A Nostr browser extension (NIP-07)
- A private key (`nsec1...`)
- Generate a new ephemeral key

## Local Development

```bash
npx serve docs
```

Visit `http://localhost:3000/nostr-chat/`

## Architecture

Static site — `docs/` directory served via GitHub Pages.

- `docs/nostr-chat/index.html` — app entry point
- `docs/js/` — all client modules
- `js/state.js` — shared state module (loaded as `../js/state.js`)

Voice uses native WebRTC with Nostr kind 30078 events as signaling channel. No server, no STUN/TURN required for LAN; uses default browser STUN for WAN.

- `docs/js/nostr-voice-sfu.js` — dynamic hub election: polls RTT via `getStats()`, elects lowest-latency peer as hub, forwards audio via `replaceTrack()` without decode/re-encode

## Embedding in Iframes

Zellous can be embedded in parent pages via iframe. See **[CLAUDE.md](CLAUDE.md#embedding-zellous)** for:
- postMessage API with bidirectional events
- Available methods: `joinRoom`, `leaveRoom`, `sendMessage`, `getState`
- Working example: **[docs/embed.html](docs/embed.html)**
- Test harness: **[test-harness.html](test-harness.html)**

Quick start:
```html
<iframe src="https://anentrypoint.github.io/zellous/nostr-chat/index.html"></iframe>
<script>
const iframe = document.querySelector('iframe');
iframe.contentWindow.postMessage({type: 'getState', id: 1}, '*');
window.addEventListener('message', (e) => {
  if (e.data.id === 1) console.log('State:', e.data.result);
});
</script>
```

## Browser Support

Requires WebCodecs API (AudioEncoder/AudioDecoder):
- Chrome/Chromium 94+
- Edge 94+
- Opera 80+

## License

MIT
