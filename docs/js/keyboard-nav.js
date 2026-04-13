const keyboardNav = {
  focusTrap: null,
  
  setup() {
    this._addFocusIndicators();
    this._addAriaLabels();
    this._setupFocusTrap();
    this._setupKeyHandlers();
    this._addSkipLink();
  },
  
  _addFocusIndicators() {
    const style = document.createElement('style');
    style.textContent = `
      *:focus-visible {
        outline: 2px solid var(--accent);
        outline-offset: 2px;
      }
      .cmd-result.selected {
        background: var(--bg-hover);
      }
    `;
    document.head.appendChild(style);
  },
  
  _addAriaLabels() {
    const labels = {
      '#voiceMicBtn': 'Toggle microphone',
      '#voiceDeafenBtn': 'Toggle deafen',
      '#voiceCamBtn': 'Toggle camera',
      '#voiceLeaveBtn': 'Leave voice channel',
      '#sendBtn': 'Send message',
      '#attachBtn': 'Attach file',
      '#serverSelector': 'Open server menu'
    };
    
    Object.entries(labels).forEach(([sel, label]) => {
      const el = document.querySelector(sel);
      if (el) el.setAttribute('aria-label', label);
    });
    
    const regions = {
      '#voiceGrid': 'Participants in voice channel',
      '#chatMessages': 'Chat message list',
      '#channelList': 'Channel navigation'
    };
    
    Object.entries(regions).forEach(([sel, role]) => {
      const el = document.querySelector(sel);
      if (el) {
        el.setAttribute('role', 'region');
        el.setAttribute('aria-label', role);
      }
    });
  },
  
  _setupFocusTrap() {
    document.addEventListener('keydown', (e) => {
      if (e.key !== 'Tab') return;
      
      const modal = document.querySelector('.modal-overlay.open');
      if (!modal) return;
      
      const focusable = modal.querySelectorAll(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      );
      
      if (focusable.length === 0) return;
      
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement;
      
      if (e.shiftKey && active === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    });
  },
  
  _setupKeyHandlers() {
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        const modal = document.querySelector('.modal-overlay.open');
        if (modal) {
          modal.click();
        }
      }
      
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        const listEl = document.querySelector('[role="listbox"]');
        if (!listEl) return;
        
        const items = listEl.querySelectorAll('[role="option"]');
        const active = listEl.querySelector('[role="option"].selected');
        let idx = active ? Array.from(items).indexOf(active) : -1;
        
        if (e.key === 'ArrowDown') {
          idx = Math.min(idx + 1, items.length - 1);
        } else {
          idx = Math.max(idx - 1, 0);
        }
        
        items.forEach(item => item.classList.remove('selected'));
        if (items[idx]) {
          items[idx].classList.add('selected');
          items[idx].scrollIntoView({block: 'nearest'});
        }
      }
    });
  },
  
  _addSkipLink() {
    if (document.querySelector('[href="#main"]')) return;
    
    const skip = document.createElement('a');
    skip.href = '#main';
    skip.textContent = 'Skip to main content';
    skip.style.cssText = `
      position: absolute;
      top: -40px;
      left: 0;
      background: var(--accent);
      color: white;
      padding: 8px 12px;
      z-index: 10000;
      text-decoration: none;
    `;
    skip.addEventListener('focus', () => {
      skip.style.top = '0';
    });
    skip.addEventListener('blur', () => {
      skip.style.top = '-40px';
    });
    document.body.insertBefore(skip, document.body.firstChild);
  },
  
  announce(message) {
    const live = document.querySelector('[role="status"][aria-live="polite"]') || 
                 document.createElement('div');
    live.setAttribute('role', 'status');
    live.setAttribute('aria-live', 'polite');
    live.style.position = 'absolute';
    live.style.left = '-9999px';
    live.textContent = message;
    if (!live.parentElement) document.body.appendChild(live);
    setTimeout(() => { live.textContent = ''; }, 3000);
  }
};

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => keyboardNav.setup());
} else {
  keyboardNav.setup();
}

window.__zellous.keyboardNav = keyboardNav;
