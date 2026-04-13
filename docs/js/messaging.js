const markdownParser = {
  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  },
  
  parse(text) {
    if (!text) return '';
    
    text = this.escapeHtml(text);
    
    text = text.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    text = text.replace(/\*(.+?)\*/g, '<em>$1</em>');
    text = text.replace(/`([^`]+)`/g, '<code style="background: var(--bg-raised); padding: 2px 4px; border-radius: 3px; font-family: monospace;">$1</code>');
    
    text = text.replace(/```(\w+)?\n([\s\S]+?)```/g, (match, lang, code) => {
      const highlighted = window.__zellous.syntaxHighlight?.highlight(code, lang) || this.escapeHtml(code);
      return `<pre style="background: var(--bg-raised); padding: 8px; border-radius: 4px; overflow-x: auto;"><code>${highlighted}</code></pre>`;
    });
    
    return text;
  }
};

const syntaxHighlight = {
  keywords: {
    js: ['function', 'const', 'let', 'var', 'if', 'else', 'for', 'while', 'return', 'async', 'await', 'class', 'import', 'export'],
    py: ['def', 'class', 'if', 'else', 'for', 'while', 'return', 'import', 'from', 'async', 'await'],
    rust: ['fn', 'let', 'mut', 'impl', 'trait', 'struct', 'enum', 'match', 'if', 'else', 'for', 'while', 'return'],
    go: ['func', 'var', 'const', 'if', 'else', 'for', 'switch', 'case', 'return', 'package', 'import']
  },
  
  highlight(code, lang) {
    lang = (lang || 'js').toLowerCase();
    const keywords = this.keywords[lang] || [];
    
    if (keywords.length === 0) return this.escapeHtml(code);
    
    let highlighted = this.escapeHtml(code);
    keywords.forEach(kw => {
      const regex = new RegExp(`\\b${kw}\\b`, 'g');
      highlighted = highlighted.replace(regex, `<span style="color: var(--accent);">${kw}</span>`);
    });
    
    highlighted = highlighted.replace(/(".*?")/g, '<span style="color: #22c55e;">$1</span>');
    highlighted = highlighted.replace(/(//.*)/g, '<span style="color: #6b7280;">$1</span>');
    
    return highlighted;
  },
  
  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
};

const messageThreading = {
  renderThreadButton(messageId, replyCount) {
    if (!replyCount) return '';
    return `<button class="thread-btn" data-message="${messageId}" title="${replyCount} replies">💬 ${replyCount}</button>`;
  },
  
  groupMessages(messages) {
    if (!messages || messages.length === 0) return [];
    
    const groups = [];
    let currentGroup = null;
    const groupTimeout = 7 * 60 * 1000;
    
    messages.forEach(msg => {
      if (!currentGroup || 
          currentGroup.lastAuthor !== msg.author || 
          msg.timestamp - currentGroup.lastTime > groupTimeout) {
        currentGroup = {
          author: msg.author,
          lastAuthor: msg.author,
          avatar: msg.avatar,
          timestamp: msg.timestamp,
          lastTime: msg.timestamp,
          messages: [msg]
        };
        groups.push(currentGroup);
      } else {
        currentGroup.messages.push(msg);
        currentGroup.lastTime = msg.timestamp;
      }
    });
    
    return groups;
  }
};

window.__zellous.markdownParser = markdownParser;
window.__zellous.syntaxHighlight = syntaxHighlight;
window.__zellous.messageThreading = messageThreading;
