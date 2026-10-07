const f = (window.state.channels||[]).find(c=>c.type==='forum'); if (f) window.ui.actions.switchChannel(f);
