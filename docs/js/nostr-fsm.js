function makeFSM(transitions, initial, onTransition) {
  var states = {};
  Object.keys(transitions).forEach(function(s) {
    var on = {};
    var evts = transitions[s];
    if(evts) Object.keys(evts).forEach(function(ev) { on[ev] = evts[ev]; });
    states[s] = { on: on };
  });
  var machine = XState.createMachine({ initial: initial, states: states });
  var actor = XState.createActor(machine);
  var prev = initial;
  actor.subscribe(function(snap) {
    if(snap.value !== prev && onTransition) { onTransition(prev, null, snap.value); prev = snap.value; }
  });
  actor.start();
  return {
    get state() { return actor.getSnapshot().value; },
    send: function(event) { actor.send({ type: event }); },
    is: function(s) { return actor.getSnapshot().matches(s); },
    can: function(event) { return actor.getSnapshot().can({ type: event }); }
  };
}
window.makeFSM = makeFSM;
