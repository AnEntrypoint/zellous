const sidebarManager = {
  isCollapsed: false,
  
  init() {
    const saved = localStorage.getItem('zn_sidebarCollapsed');
    if (saved === 'true') this.collapse();
    this._setupToggle();
    this._setupHoverExpand();
  },
  
  toggle() {
    if (this.isCollapsed) this.expand();
    else this.collapse();
  },
  
  collapse() {
    const sidebar = document.querySelector('.flow-sidebar');
    if (!sidebar) return;
    sidebar.classList.add('collapsed');
    sidebar.style.width = '64px';
    this.isCollapsed = true;
    localStorage.setItem('zn_sidebarCollapsed', 'true');
  },
  
  expand() {
    const sidebar = document.querySelector('.flow-sidebar');
    if (!sidebar) return;
    sidebar.classList.remove('collapsed');
    sidebar.style.width = '240px';
    this.isCollapsed = false;
    localStorage.setItem('zn_sidebarCollapsed', 'false');
  },
  
  _setupToggle() {
    const btn = document.createElement('button');
    btn.innerHTML = '⟨';
    btn.className = 'sidebar-toggle';
    btn.style.cssText = `
      position: absolute;
      right: -20px;
      top: 50%;
      transform: translateY(-50%);
      width: 24px;
      height: 48px;
      background: var(--accent);
      color: white;
      border: none;
      border-radius: 0 4px 4px 0;
      cursor: pointer;
      z-index: 50;
      font-size: 14px;
      display: none;
    `;
    btn.addEventListener('click', () => this.toggle());
    
    const sidebar = document.querySelector('.flow-sidebar');
    if (sidebar) {
      sidebar.parentElement.style.position = 'relative';
      sidebar.parentElement.appendChild(btn);
    }
  },
  
  _setupHoverExpand() {
    const sidebar = document.querySelector('.flow-sidebar');
    if (!sidebar) return;
    
    const style = document.createElement('style');
    style.textContent = `
      .flow-sidebar.collapsed {
        transition: width 0.2s ease;
      }
      .flow-sidebar.collapsed:hover {
        width: 240px;
      }
      .flow-sidebar.collapsed .channel-item span {
        display: none;
      }
      .flow-sidebar:hover .channel-item span {
        display: inline;
      }
    `;
    document.head.appendChild(style);
  }
};

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => sidebarManager.init());
} else {
  sidebarManager.init();
}

window.__zellous.sidebarManager = sidebarManager;
