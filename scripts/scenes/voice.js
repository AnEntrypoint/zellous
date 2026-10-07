const v = (window.state.channels||[]).find(c=>c.type==='voice'); if (v) window.ui.actions.switchChannel(v);
