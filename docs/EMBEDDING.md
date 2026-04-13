# Embedding Zellous in an Iframe

Zellous can be embedded as a serverless voice and chat widget in any web application. All communication happens via the `postMessage` API — no backend required.

## Quick Start

```html
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>My App with Zellous</title>
</head>
<body>
  <!-- Embed the iframe -->
  <div style="width: 400px; height: 600px;">
    <iframe id="zellous" src="https://your-domain.com/docs/nostr-chat/index.html" style="width:100%;height:100%;border:none;"></iframe>
  </div>

  <script>
    const iframe = document.getElementById('zellous');

    // Listen for events from Zellous
    window.addEventListener('message', (event) => {
      if (event.source !== iframe.contentWindow) return;

      console.log('Zellous event:', event.data);
      const { type, data } = event.data;

      if (type === 'ready') {
        console.log('Zellous loaded and ready');
        iframe.contentWindow.postMessage({ type: 'joinRoom', room: 'lobby' }, '*');
      }

      if (type === 'message-received') {
        console.log('Chat message:', data.text);
      }

      if (type === 'voice-joined') {
        console.log('User joined voice:', data.participants);
      }
    });
  </script>
</body>
</html>
```

## API Reference

### Events from Iframe → Parent

The iframe emits events via `postMessage`. Listen with `window.addEventListener('message', ...)`.

#### `ready`
Iframe has loaded and is ready to receive commands.

```javascript
{ type: 'ready' }
```

#### `error`
An operation failed.

```javascript
{ type: 'error', code: 'AUTH_REQUIRED', message: 'Must be logged in' }
```

#### `message-received`
A new chat message arrived.

```javascript
{ type: 'message-received', data: { text: 'hello', author: 'user123', channel: 'general' } }
```

#### `voice-joined`
User joined voice. `participants` is array of user objects.

```javascript
{ type: 'voice-joined', data: { channel: 'general', participants: [{id, name, isLocal}] } }
```

#### `voice-left`
User left voice channel.

```javascript
{ type: 'voice-left', data: { channel: 'general' } }
```

### Commands from Parent → Iframe

Send via `iframe.contentWindow.postMessage({ type, ...params }, '*')`.

#### `joinRoom`
Switch to a room/server.

```javascript
iframe.contentWindow.postMessage({
  type: 'joinRoom',
  room: 'lobby'
}, '*');
```

#### `leaveRoom`
Leave the current room.

```javascript
iframe.contentWindow.postMessage({
  type: 'leaveRoom'
}, '*');
```

#### `sendMessage`
Send a chat message.

```javascript
iframe.contentWindow.postMessage({
  type: 'sendMessage',
  text: 'Hello world!',
  channel: 'general'
}, '*');
```

#### `joinVoice`
Connect to voice channel.

```javascript
iframe.contentWindow.postMessage({
  type: 'joinVoice',
  channel: 'general'
}, '*');
```

#### `leaveVoice`
Disconnect from voice.

```javascript
iframe.contentWindow.postMessage({
  type: 'leaveVoice'
}, '*');
```

## Sizing & Responsive Design

- **Minimum width**: 320px (mobile)
- **Recommended width**: 400px–500px for chat + sidebar
- **Height**: 500px–800px recommended
- **Aspect ratio**: No constraint

The app adapts to any container size. Modals max-width is 90vw so they fit in narrow containers.

## Security Considerations

### Origin Validation

By default, Zellous accepts `postMessage` from any origin. For production, validate in the parent:

```javascript
window.addEventListener('message', (event) => {
  if (!['https://trusted.com'].includes(event.origin)) {
    return;
  }
  // Process message...
});
```

### CSP

If the parent has CSP, ensure:
- `frame-src` allows the iframe origin
- `connect-src` allows Nostr relay URLs (wss://)
- `script-src` allows `unsafe-inline` for ES6 modules

### LocalStorage

LocalStorage is isolated per origin by the browser. Parent and iframe don't share state.

## Troubleshooting

**Iframe loads blank**: Verify src URL is correct and importMap paths resolve. Check console for 404 errors.

**`window.__zellous` undefined**: Reload iframe. The init script in index.html must run first.

**postMessage not received**: Wait for iframe to load. Listen for `ready` event before sending commands.

**Audio not working**: Check browser permissions. Verify microphone is allowed for the page origin.

**State not isolated**: Each iframe gets its own `contentWindow` context automatically. No action needed.

## Testing

See `docs/test-embed-harness.html` for test suite covering:
- Same-origin embedding
- Different-path embedding  
- Narrow container (400px) responsiveness
- Multiple iframes on one page (state isolation)

Run locally:
```bash
npx serve docs
# Open http://localhost:3000/test-embed-harness.html
```

## Architecture Notes

### Namespace Isolation

All globals under `window.__zellous`:
- `window.__zellous.state` — app state (Preact signals)
- `window.__zellous.voice` — voice subsystem
- `window.__zellous.chat` — chat operations
- `window.__zellous.net` — network/relay operations
- `window.__zellous.embed` — postMessage bridge

Backward compat shims at `window.state`, `window.lk` etc. point to `window.__zellous.*`.

### WebSocket Connections

Voice and chat use WebSockets to Nostr relays. Each iframe maintains independent relay connections. No multiplexing at parent level.

## Limitations

1. **No cross-iframe messaging**: Iframes cannot directly communicate. Use parent page as message hub.

2. **LocalStorage isolation**: Each iframe has isolated localStorage (by origin). Login in one won't appear in another (by design).

3. **Shared public key**: To share Nostr key across iframes, manually copy `localStorage.getItem('zn_pk')` from first iframe to others.

4. **Web only**: This embedding method is for browsers. Node.js/server requires SDK (if available).

---

For architecture details, see `CLAUDE.md`.
