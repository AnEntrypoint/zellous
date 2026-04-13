const emojiReactions = {
  topEmojis: ['👍', '❤️', '😂', '🔥', '🎉', '😮', '😢', '🤔', '👏', '✨'],
  userReactions: new Map(),
  
  toggleReaction(messageId, emoji) {
    const key = messageId + ':' + emoji;
    if (this.userReactions.has(key)) {
      this.userReactions.delete(key);
      if (window.nostrNet?.publish) {
        const event = {kind: 7, tags: [['e', messageId]], content: emoji};
        window.nostrNet.publish(event);
      }
    } else {
      this.userReactions.set(key, true);
      if (window.nostrNet?.publish) {
        const event = {kind: 7, tags: [['e', messageId]], content: emoji};
        window.nostrNet.publish(event);
      }
    }
  },
  
  render(reactions) {
    if (!reactions || reactions.length === 0) return '';
    
    const top3 = reactions.slice(0, 3);
    const more = reactions.length > 3 ? `+${reactions.length - 3}` : '';
    
    return '<div class="reactions-row">' +
      top3.map(r => `
        <button class="reaction-btn ${r.userReacted ? 'reacted' : ''}" data-emoji="${r.emoji}" title="${r.count}">
          <span>${r.emoji}</span> <span>${r.count}</span>
        </button>
      `).join('') +
      (reactions.length > 0 ? '<button class="reaction-add-btn" title="Add reaction">+</button>' : '') +
      more +
      '</div>';
  }
};

window.__zellous.emojiReactions = emojiReactions;
