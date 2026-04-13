if (window.commandPalette) {
  const input = document.getElementById('cmdPaletteInput');
  const results = document.getElementById('cmdPaletteResults');
  if (!input || !results) {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => setupCmdPaletteUI());
    } else {
      setupCmdPaletteUI();
    }
  } else {
    setupCmdPaletteUI();
  }
}

function setupCmdPaletteUI() {
  const input = document.getElementById('cmdPaletteInput');
  const results = document.getElementById('cmdPaletteResults');
  const modal = document.getElementById('cmdPaletteModal');
  const cp = window.__zellous.commandPalette;
  if (!input || !results || !cp) return;
  
  input.addEventListener('input', (e) => {
    const query = e.target.value.trim();
    const items = cp.search(query);
    results.innerHTML = items.map((item, idx) => `
      <div class="cmd-result" data-idx="${idx}" role="option">
        <span class="cmd-icon">${item.type === 'channel' ? '#' : item.type === 'user' ? '@' : item.type === 'command' ? ':' : '⏱'}</span>
        <span class="cmd-text">${item.text}</span>
        ${item.desc ? `<span class="cmd-desc">${item.desc}</span>` : ''}
      </div>
    `).join('');
    
    const resultDivs = results.querySelectorAll('.cmd-result');
    resultDivs.forEach(div => {
      div.addEventListener('click', () => {
        const item = items[parseInt(div.dataset.idx)];
        if (item) cp.execute(item);
      });
    });
  });
  
  input.addEventListener('keydown', (e) => {
    const resultDivs = results.querySelectorAll('.cmd-result');
    const selected = results.querySelector('.cmd-result.selected');
    let idx = selected ? Array.from(resultDivs).indexOf(selected) : -1;
    
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      idx = Math.min(idx + 1, resultDivs.length - 1);
      if (idx >= 0) {
        resultDivs[idx]?.classList.add('selected');
        selected?.classList.remove('selected');
      }
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      idx = Math.max(idx - 1, 0);
      if (idx >= 0 && resultDivs[idx]) {
        resultDivs[idx]?.classList.add('selected');
        selected?.classList.remove('selected');
      }
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (selected) {
        const item = items[Array.from(resultDivs).indexOf(selected)];
        if (item) cp.execute(item);
      }
    } else if (e.key === 'Escape') {
      cp.close();
    }
  });
  
  document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
      e.preventDefault();
      cp.open();
    }
  });
  
  if (modal) {
    modal.addEventListener('click', (e) => {
      if (e.target === modal) cp.close();
    });
  }
}
