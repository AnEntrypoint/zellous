# Zellous

Serverless voice and chat over public Nostr relays. No backend required.

**Live app:** https://anentrypoint.github.io/zellous/nostr-chat/

## Features

- Voice channels — click to join, click again to leave
- Text chat via Nostr events
- Server/community management
- WebRTC mesh voice using Nostr signaling (no TURN server required)
- Opus audio codec (24kbps, 48kHz)
- Push-to-talk and VAD modes
- Webcam support

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

## Browser Support

Requires WebCodecs API (AudioEncoder/AudioDecoder):
- Chrome/Chromium 94+
- Edge 94+
- Opera 80+

## License

MIT
