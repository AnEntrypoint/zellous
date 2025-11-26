/**
 * Zellous Loader for External OS.js Instances
 *
 * This standalone script registers Zellous as an application in any OS.js v3 instance.
 * Include this script in your OS.js to add Zellous as an available application.
 *
 * Usage:
 * 1. Host this file or include it directly in your OS.js bundle
 * 2. Load it after OS.js core is initialized
 *
 * Configuration:
 * - Set window.ZELLOUS_SERVER_URL before loading to override the default server
 */

(function() {
  'use strict';

  // Default Zellous server URL - can be overridden
  const ZELLOUS_SERVER = window.ZELLOUS_SERVER_URL || 'https://zellous.247420.xyz';

  // Window dimensions
  const WINDOW_WIDTH = 1000;
  const WINDOW_HEIGHT = 700;

  /**
   * Create Zellous application for OS.js
   */
  const createZellousApp = (core, args, options, metadata) => {
    const proc = core.make('osjs/application', {
      args,
      options,
      metadata
    });

    // Settings
    proc.settings = {
      serverUrl: null,
      token: null,
      ...proc.settings
    };

    const getServerUrl = () => proc.settings.serverUrl || ZELLOUS_SERVER;

    // Create main window
    const win = proc.createWindow({
      id: 'ZellousWindow',
      title: 'Zellous',
      icon: metadata.icon,
      dimension: { width: WINDOW_WIDTH, height: WINDOW_HEIGHT },
      position: { left: 100, top: 100 },
      attributes: {
        minDimension: { width: 400, height: 400 }
      }
    });

    // Build content
    win.render(($content) => {
      const room = args.room || 'lobby';
      const token = args.token || proc.settings.token || '';
      const serverUrl = getServerUrl();

      // Build iframe URL
      let iframeUrl = `${serverUrl}?room=${encodeURIComponent(room)}`;
      if (token) {
        iframeUrl += `&token=${encodeURIComponent(token)}`;
      }

      // Create container
      $content.innerHTML = `
        <div style="display: flex; flex-direction: column; height: 100%; background: #0a0a0a;">
          <div style="display: flex; justify-content: space-between; align-items: center; padding: 8px 12px; background: #141414; border-bottom: 1px solid #2a2a2a;">
            <div style="display: flex; align-items: center; gap: 8px;">
              <span style="font-size: 12px; color: rgba(255,255,255,0.6);">Room:</span>
              <input type="text" class="zellous-room" value="${room}" placeholder="Room name" style="padding: 6px 10px; background: #1e1e1e; border: 1px solid #2a2a2a; border-radius: 4px; color: #fff; font-size: 12px; width: 150px;">
              <button class="zellous-join" style="padding: 6px 12px; background: #3b82f6; border: none; border-radius: 4px; color: #fff; font-size: 12px; cursor: pointer;">Join</button>
            </div>
            <div style="display: flex; gap: 6px;">
              <button class="zellous-settings" style="padding: 6px 10px; background: #1e1e1e; border: 1px solid #2a2a2a; border-radius: 4px; color: #fff; cursor: pointer;" title="Settings">⚙️</button>
              <button class="zellous-popout" style="padding: 6px 10px; background: #1e1e1e; border: 1px solid #2a2a2a; border-radius: 4px; color: #fff; cursor: pointer;" title="Pop-out">↗️</button>
            </div>
          </div>
          <iframe class="zellous-frame" src="${iframeUrl}" style="flex: 1; border: none; width: 100%; background: #0a0a0a;" allow="microphone; camera; autoplay"></iframe>
        </div>
      `;

      // Elements
      const roomInput = $content.querySelector('.zellous-room');
      const joinBtn = $content.querySelector('.zellous-join');
      const settingsBtn = $content.querySelector('.zellous-settings');
      const popoutBtn = $content.querySelector('.zellous-popout');
      const iframe = $content.querySelector('.zellous-frame');

      // Join room
      const joinRoom = () => {
        const newRoom = roomInput.value.trim() || 'lobby';
        const currentToken = proc.settings.token || '';
        iframe.src = `${getServerUrl()}?room=${encodeURIComponent(newRoom)}${currentToken ? `&token=${encodeURIComponent(currentToken)}` : ''}`;
      };

      joinBtn.onclick = joinRoom;
      roomInput.onkeypress = (e) => { if (e.key === 'Enter') joinRoom(); };

      // Settings
      settingsBtn.onclick = () => {
        core.make('osjs/dialog', 'prompt', {
          title: 'Zellous Settings',
          message: 'Enter Zellous server URL:',
          value: getServerUrl()
        }, (btn, value) => {
          if (btn === 'ok' && value) {
            proc.settings.serverUrl = value;
            proc.saveSettings();
            joinRoom();
          }
        });
      };

      // Pop-out
      popoutBtn.onclick = () => {
        window.open(iframe.src, '_blank', `width=${WINDOW_WIDTH},height=${WINDOW_HEIGHT}`);
      };

      // Message handler for iframe communication
      window.addEventListener('message', (event) => {
        if (event.source === iframe.contentWindow) {
          switch (event.data.type) {
            case 'zellous:speaking':
              win.$element?.setAttribute('data-speaking', event.data.speaking);
              break;
            case 'zellous:notification':
              core.make('osjs/notification', {
                title: 'Zellous',
                message: event.data.message
              });
              break;
            case 'zellous:auth':
              proc.settings.token = event.data.token;
              proc.saveSettings();
              break;
          }
        }
      });
    });

    // Focus handler for audio context
    win.on('focus', () => {
      const iframe = win.$content?.querySelector('iframe');
      if (iframe?.contentWindow) {
        iframe.contentWindow.postMessage({ type: 'osjs:focus' }, '*');
      }
    });

    return proc;
  };

  // Application metadata
  const metadata = {
    name: 'Zellous',
    category: 'communication',
    icon: 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="%233b82f6" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>'),
    title: { en_EN: 'Zellous' },
    description: { en_EN: 'Push-to-Talk Voice, Video & Chat' },
    singleton: false
  };

  // Register with OS.js
  if (typeof OSjs !== 'undefined' && OSjs.make) {
    OSjs.make('osjs/packages').register('Zellous', (core, args, options) => {
      return createZellousApp(core, args, options, metadata);
    });
    console.log('[Zellous] Application registered with OS.js');
  } else {
    console.warn('[Zellous] OS.js not found, waiting for initialization...');
    // Try again when DOM is ready
    document.addEventListener('DOMContentLoaded', () => {
      if (typeof OSjs !== 'undefined' && OSjs.make) {
        OSjs.make('osjs/packages').register('Zellous', (core, args, options) => {
          return createZellousApp(core, args, options, metadata);
        });
        console.log('[Zellous] Application registered with OS.js (delayed)');
      }
    });
  }
})();
