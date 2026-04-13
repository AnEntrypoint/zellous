const relayStatus = {
  _monitorId: null,

  init() {
    this._addRelayIndicator();
    this._startMonitoring();
    window.addEventListener('beforeunload', () => this.cleanup());
  },

  cleanup() {
    if (this._monitorId) clearInterval(this._monitorId);
  },

  _addRelayIndicator() {
    const topbar = document.querySelector('.flow-topbar .topbar-right');
    if (!topbar) return;

    const indicator = document.createElement('div');
    indicator.id = 'relayStatus';
    indicator.className = 'relay-status';
    indicator.style.cssText = `
      display: flex;
      align-items: center;
      gap: 6px;
      padding: 4px 8px;
      border-radius: 4px;
      background: var(--bg-raised);
      font-size: 12px;
      cursor: pointer;
    `;
    indicator.innerHTML = '<span class="relay-dot" style="width: 6px; height: 6px; border-radius: 50%; background: #22c55e;"></span><span id="relayCount">0</span>';
    topbar.insertBefore(indicator, topbar.firstChild);

    indicator.addEventListener('click', () => this._showRelayPopover());
  },

  _startMonitoring() {
    this._monitorId = setInterval(() => {
      if (!window.__debugNet?.relays) return;
      
      const relays = window.__debugNet.relays;
      const connected = relays.filter(r => r.status === 'connected').length;
      const total = relays.length;
      
      const dot = document.querySelector('.relay-dot');
      const count = document.getElementById('relayCount');
      if (count) count.textContent = connected;
      if (dot) {
        if (connected === 0) dot.style.background = '#ef4444';
        else if (connected < total / 2) dot.style.background = '#eab308';
        else dot.style.background = '#22c55e';
      }
      
      if (connected === 0 && !document.querySelector('.relay-offline-banner')) {
        this._showOfflineBanner();
      } else if (connected > 0) {
        document.querySelector('.relay-offline-banner')?.remove();
      }
    }, 2000);
  },
  
  _showRelayPopover() {
    if (!window.__debugNet?.relays) return;
    
    const existing = document.querySelector('.relay-popover');
    if (existing) existing.remove();
    
    const popover = document.createElement('div');
    popover.className = 'relay-popover';
    popover.style.cssText = `
      position: fixed;
      top: 60px;
      right: 20px;
      background: var(--bg-surface);
      border: 1px solid var(--border);
      border-radius: 8px;
      padding: 12px;
      z-index: 1000;
      max-width: 300px;
      max-height: 300px;
      overflow-y: auto;
      box-shadow: var(--shadow);
    `;
    
    const relays = window.__debugNet.relays;
    popover.innerHTML = '<div style="font-weight: 600; margin-bottom: 8px;">Connected Relays</div>' + 
      relays.map(r => `
        <div style="padding: 6px 0; border-bottom: 1px solid var(--bg-raised); display: flex; justify-content: space-between; font-size: 12px;">
          <span>${r.url.replace('wss://', '').split('/')[0]}</span>
          <span style="color: ${r.status === 'connected' ? '#22c55e' : r.latencyMs > 500 ? '#eab308' : '#ef4444'}">${r.latencyMs}ms</span>
        </div>
      `).join('');
    
    document.body.appendChild(popover);
    
    setTimeout(() => popover.remove(), 5000);
  },
  
  _showOfflineBanner() {
    const banner = document.createElement('div');
    banner.className = 'relay-offline-banner';
    banner.style.cssText = `
      position: fixed;
      top: 40px;
      left: 0;
      right: 0;
      background: #ef4444;
      color: white;
      padding: 8px 16px;
      text-align: center;
      z-index: 100;
      font-size: 13px;
    `;
    banner.textContent = '⚠ No relays connected. Reconnecting...';
    document.body.appendChild(banner);
  }
};

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => relayStatus.init());
} else {
  relayStatus.init();
}

window.__zellous.relayStatus = relayStatus;
