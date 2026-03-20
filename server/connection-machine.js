import { createMachine, createActor } from 'xstate';

const connectionMachine = createMachine({
  id: 'connection',
  initial: 'connecting',
  states: {
    connecting: { on: { AUTHENTICATE: 'connected', DISCONNECT: 'disconnected' } },
    connected:  { on: { DISCONNECT: 'disconnected', JOIN: 'connected', LEAVE: 'connected' } },
    disconnected: { type: 'final' }
  }
});

export function createConnectionActor() {
  const actor = createActor(connectionMachine);
  actor.start();
  return actor;
}
