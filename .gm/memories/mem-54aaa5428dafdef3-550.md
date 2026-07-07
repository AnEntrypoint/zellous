---
key: mem-54aaa5428dafdef3-550
ns: default
created: 1780039956666
updated: 1780039956666
---

## Resolved mutable: live-vs-dead-emoji-surfaces

browser-4 session5 live /nostr-chat/: railText='rooms #general 📣announcements voice 🔊Gener...' -> sdk-rooms.js 📣/🔊 ARE live-visible (real jank). deafenBtn/vadBtn/webcamBtn/pttBtn all zero-size (not visible) -> ptt.js+webcam.js emoji writes target DEAD legacy buttons (SDK VoiceControls/PttButton own live UI). legacy chatHeaderBar display:none -> ui-chat legacy dead. LIVE emoji=sdk-rooms.js,sdk-mobile-header.js,SDK community.js; DEAD=ptt.js,webcam.js,ui-chat.js,ui-shell.js,ui-voice.js.
