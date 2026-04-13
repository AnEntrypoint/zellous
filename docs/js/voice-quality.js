const voiceQuality = {
  thresholds: {good: 100, degraded: 300, poor: 999},
  sessionWarnedOnce: false,
  _footerBtnWired: false,

  getQuality(rttMs) {
    if (rttMs < this.thresholds.good) return 'good';
    if (rttMs < this.thresholds.degraded) return 'degraded';
    return 'poor';
  },

  getIcon(quality) {
    const icons = {good: '🟢', degraded: '🟡', poor: '🔴'};
    return icons[quality] || '—';
  },

  updateParticipantQuality(participantId, rttMs, packetLoss) {
    const tile = document.querySelector(`[data-participant="${participantId}"]`);
    if (!tile) return;

    const quality = this.getQuality(rttMs);
    const indicator = tile.querySelector('.quality-indicator');
    if (indicator) {
      indicator.textContent = this.getIcon(quality);
      indicator.title = `RTT: ${rttMs}ms, Loss: ${packetLoss || 0}%`;
    }
  },

  updateFooterQuality(rttMs) {
    const btn = document.querySelector('#voiceQualityBtn');
    if (!btn) return;

    const quality = this.getQuality(rttMs);
    btn.textContent = this.getIcon(quality);

    if (!this._footerBtnWired) {
      this._footerBtnWired = true;
      btn.addEventListener('click', () => this.showQualityPopover());
    }

    if (quality === 'poor' && !this.sessionWarnedOnce) {
      this.sessionWarnedOnce = true;
      if (window.__zellous.keyboardNav?.announce) {
        window.__zellous.keyboardNav.announce('Poor voice quality detected');
      }
    }
  },
  
  showQualityPopover() {
    const existing = document.querySelector('.quality-popover');
    if (existing) existing.remove();

    const debugNet = window.__debug?.relay?.avgLatency || 0;
    const rttMs = Math.round(debugNet);

    const popover = document.createElement('div');
    popover.className = 'quality-popover';
    popover.style.cssText = `
      position: fixed;
      bottom: 60px;
      right: 20px;
      background: var(--bg-surface);
      border: 1px solid var(--border);
      border-radius: 8px;
      padding: 12px;
      font-size: 12px;
      z-index: 1000;
      box-shadow: var(--shadow);
    `;
    popover.innerHTML = `
      <div><strong>Voice Quality</strong></div>
      <div>RTT: ${rttMs}ms</div>
      <div>Status: ${this.getQuality(rttMs)}</div>
    `;
    document.body.appendChild(popover);
    setTimeout(() => popover.remove(), 4000);
  }
};

window.__zellous.voiceQuality = voiceQuality;
