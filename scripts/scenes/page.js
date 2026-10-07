const p = (window.state.channels||[]).find(c=>c.type==='page'); if (p) window.ui.actions.switchChannel(p);
