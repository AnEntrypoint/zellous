function makeFSM(transitions, initial, onTransition) {
  var current = initial;
  var fsm = {
    get state() { return current; },
    send: function(event) {
      var t = transitions[current];
      if (!t || !t[event]) { console.warn('[fsm] invalid:', event, 'in', current); return false; }
      var next = typeof t[event] === 'function' ? t[event]() : t[event];
      if (!next) return false;
      var prev = current;
      current = next;
      if (onTransition) onTransition(prev, event, next);
      return true;
    },
    is: function(s) { return current === s; },
    can: function(event) { return !!(transitions[current] && transitions[current][event]); }
  };
  return fsm;
}
window.makeFSM = makeFSM;
