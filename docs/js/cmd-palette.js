const commandPalette = {
  isOpen: false,
  recentMax: 10,
  
  _fuzzyMatch(query, text) {
    let qIdx = 0;
    for (let i = 0; i < text.length && qIdx < query.length; i++) {
      if (text[i].toLowerCase() === query[qIdx].toLowerCase()) qIdx++;
    }
    return qIdx === query.length;
  },
  
  _loadRecent() {
    try {
      const stored = localStorage.getItem('zn_cmdRecent');
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  },
  
  _saveRecent(items) {
    try {
      localStorage.setItem('zn_cmdRecent', JSON.stringify(items.slice(0, this.recentMax)));
    } catch {}
  },
  
  _addToRecent(cmd) {
    const recent = this._loadRecent();
    const filtered = recent.filter(c => c !== cmd);
    this._saveRecent([cmd, ...filtered]);
  },
  
  search(query) {
    if (!query) return this._loadRecent().map(cmd => ({type: 'recent', text: cmd, cmd}));
    
    const results = [];
    
    if (window.channelManager?.channels) {
      window.channelManager.channels.forEach(ch => {
        if (this._fuzzyMatch(query, ch.name)) {
          results.push({type: 'channel', text: '#' + ch.name, cmd: '#' + ch.name, obj: ch});
        }
      });
    }
    
    if (window.state?.users) {
      window.state.users.forEach(u => {
        if (this._fuzzyMatch(query, u.username)) {
          results.push({type: 'user', text: '@' + u.username, cmd: '@' + u.username, obj: u});
        }
      });
    }
    
    if (window.serverManager?.servers) {
      window.serverManager.servers.forEach(s => {
        if (this._fuzzyMatch(query, s.name)) {
          results.push({type: 'server', text: s.name, cmd: s.name, obj: s});
        }
      });
    }
    
    const commands = [
      {name: 'mute', desc: 'Mute channel'},
      {name: 'unmute', desc: 'Unmute channel'},
      {name: 'leave', desc: 'Leave server'},
      {name: 'clear', desc: 'Clear cache'}
    ];
    
    commands.forEach(cmd => {
      if (this._fuzzyMatch(query, cmd.name)) {
        results.push({type: 'command', text: ':' + cmd.name, desc: cmd.desc, cmd: ':' + cmd.name});
      }
    });
    
    return results;
  },
  
  execute(result) {
    this._addToRecent(result.cmd);
    
    if (result.type === 'channel') {
      if (window.ui?.actions?.switchChannel) {
        window.ui.actions.switchChannel(result.obj.id);
      }
    } else if (result.type === 'user') {
      if (window.ui?.actions?.openDM) {
        window.ui.actions.openDM(result.obj.id);
      }
    } else if (result.type === 'server') {
      if (window.serverManager?.switchTo) {
        window.serverManager.switchTo(result.obj.id);
      }
    } else if (result.type === 'command') {
      const cmd = result.cmd.slice(1);
      if (cmd === 'mute') {
        if (window.state?.currentChannelId && window.ui?.actions?.muteChannel) {
          window.ui.actions.muteChannel(window.state.currentChannelId);
        }
      } else if (cmd === 'clear') {
        Object.keys(localStorage).forEach(key => {
          if (key.startsWith('zn_') || key.startsWith('nostr_') || key.startsWith('zellous_')) {
            localStorage.removeItem(key);
          }
        });
      }
    }
    
    this.close();
  },
  
  open() {
    const modal = document.getElementById('cmdPaletteModal');
    if (!modal) return;
    modal.style.display = 'flex';
    this.isOpen = true;
    const input = document.getElementById('cmdPaletteInput');
    if (input) {
      input.value = '';
      input.focus();
    }
  },
  
  close() {
    const modal = document.getElementById('cmdPaletteModal');
    if (modal) modal.style.display = 'none';
    this.isOpen = false;
  }
};

window.__zellous.commandPalette = commandPalette;
