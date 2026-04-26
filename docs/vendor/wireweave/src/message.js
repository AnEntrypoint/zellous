export class MessageBus extends EventTarget {
  constructor({ maxMessages = 50 } = {}) {
    super();
    this.max = maxMessages;
    this.messages = [];
    this.handlers = {};
  }

  handle(m) { this.handlers[m.type]?.(m); }
  register(type, fn) { this.handlers[type] = fn; }

  add(text, { audioData = null, userId = null, username = null } = {}) {
    const msg = { id: Date.now() + Math.random(), text, time: Date.now(), userId, username, audioData };
    this.messages = [...this.messages, msg];
    if (this.messages.length > this.max) this.messages = this.messages.slice(-this.max);
    this.dispatchEvent(new CustomEvent('message', { detail: msg }));
    this.dispatchEvent(new CustomEvent('messages', { detail: { list: this.messages } }));
    return msg;
  }
}

export const createMessageBus = (opts) => new MessageBus(opts);
