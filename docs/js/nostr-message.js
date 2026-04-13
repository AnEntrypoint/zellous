var message = window.message || {
  handlers: {},
  handle: function(m) { var h = message.handlers[m.type]; if (h) h(m); },
  add: function(text, audioData, userId, username) {
    var id = Date.now() + Math.random();
    var msgs = (state.messages || []).concat([{ id: id, text: text, time: Date.now(), userId: userId, username: username }]);
    state.messages = msgs.length > 50 ? msgs.slice(-50) : msgs;
    if (window.ui) ui.render.messages();
  }
};
window.__zellous.message = message;
window.message = message;
