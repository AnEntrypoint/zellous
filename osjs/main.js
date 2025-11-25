/**
 * Zellous OS.js Application
 *
 * This wrapper embeds Zellous as an iframe application within OS.js desktop environment.
 * It provides window management, settings integration, and event communication.
 */

import {
  app,
  h,
  text
} from 'hyperapp';

// Default window dimensions
const WINDOW_WIDTH = 1000;
const WINDOW_HEIGHT = 700;

// Zellous server URL (configure based on deployment)
const ZELLOUS_SERVER = window.location.origin.replace(/:\d+$/, ':3000');

/**
 * Create Zellous window content
 */
const createContent = (core, proc, win, args) => {
  // Get room from args or default
  const room = args.room || 'lobby';
  const token = args.token || proc.settings.token || '';

  // Build iframe URL with parameters
  let iframeUrl = `${ZELLOUS_SERVER}?room=${encodeURIComponent(room)}`;
  if (token) {
    iframeUrl += `&token=${encodeURIComponent(token)}`;
  }

  // Create container
  const container = document.createElement('div');
  container.className = 'zellous-container';

  // Create toolbar
  const toolbar = document.createElement('div');
  toolbar.className = 'zellous-toolbar';
  toolbar.innerHTML = `
    <div class="zellous-room-info">
      <span class="zellous-room-label">Room:</span>
      <input type="text" class="zellous-room-input" value="${room}" placeholder="Room name">
      <button class="zellous-join-btn">Join</button>
    </div>
    <div class="zellous-controls">
      <button class="zellous-settings-btn" title="Settings">⚙️</button>
      <button class="zellous-popout-btn" title="Open in new window">↗️</button>
    </div>
  `;

  // Create iframe
  const iframe = document.createElement('iframe');
  iframe.className = 'zellous-iframe';
  iframe.src = iframeUrl;
  iframe.allow = 'microphone; camera; autoplay';

  // Append elements
  container.appendChild(toolbar);
  container.appendChild(iframe);

  // Event handlers
  const roomInput = toolbar.querySelector('.zellous-room-input');
  const joinBtn = toolbar.querySelector('.zellous-join-btn');
  const settingsBtn = toolbar.querySelector('.zellous-settings-btn');
  const popoutBtn = toolbar.querySelector('.zellous-popout-btn');

  joinBtn.onclick = () => {
    const newRoom = roomInput.value.trim() || 'lobby';
    iframe.src = `${ZELLOUS_SERVER}?room=${encodeURIComponent(newRoom)}${token ? `&token=${encodeURIComponent(token)}` : ''}`;
  };

  roomInput.onkeypress = (e) => {
    if (e.key === 'Enter') joinBtn.click();
  };

  settingsBtn.onclick = () => {
    showSettings(core, proc, win);
  };

  popoutBtn.onclick = () => {
    window.open(iframe.src, '_blank', `width=${WINDOW_WIDTH},height=${WINDOW_HEIGHT}`);
  };

  // Message handler for iframe communication
  window.addEventListener('message', (event) => {
    if (event.source === iframe.contentWindow) {
      handleIframeMessage(event.data, proc);
    }
  });

  return container;
};

/**
 * Handle messages from Zellous iframe
 */
const handleIframeMessage = (data, proc) => {
  switch (data.type) {
    case 'zellous:speaking':
      // Could update window title or icon
      break;
    case 'zellous:notification':
      proc.core.make('osjs/notification', {
        title: 'Zellous',
        message: data.message,
        icon: proc.resource('icon.png')
      });
      break;
    case 'zellous:auth':
      // Store auth token in settings
      proc.settings.token = data.token;
      proc.saveSettings();
      break;
  }
};

/**
 * Show settings dialog
 */
const showSettings = (core, proc, win) => {
  core.make('osjs/dialog', 'prompt', {
    title: 'Zellous Settings',
    message: 'Enter Zellous server URL:',
    value: proc.settings.serverUrl || ZELLOUS_SERVER
  }, (btn, value) => {
    if (btn === 'ok' && value) {
      proc.settings.serverUrl = value;
      proc.saveSettings();
    }
  });
};

/**
 * Create the Zellous application
 */
const createApplication = (core, args, options, metadata) => {
  const proc = core.make('osjs/application', {
    args,
    options,
    metadata
  });

  // Default settings
  proc.settings = {
    serverUrl: ZELLOUS_SERVER,
    token: null,
    ...proc.settings
  };

  // Create main window
  const win = proc.createWindow({
    id: 'ZellousWindow',
    title: metadata.title.en_EN || 'Zellous',
    icon: proc.resource('icon.png'),
    dimension: { width: WINDOW_WIDTH, height: WINDOW_HEIGHT },
    position: { left: 100, top: 100 },
    attributes: {
      minDimension: { width: 400, height: 400 }
    }
  });

  // Handle window focus for audio context
  win.on('focus', () => {
    const iframe = win.$content?.querySelector('iframe');
    if (iframe?.contentWindow) {
      iframe.contentWindow.postMessage({ type: 'osjs:focus' }, '*');
    }
  });

  // Render window
  win.render(($content) => {
    $content.appendChild(createContent(core, proc, win, args));
  });

  return proc;
};

// Register application
OSjs.make('osjs/packages').register('Zellous', createApplication);
