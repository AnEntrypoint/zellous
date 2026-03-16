const _handlers = new Map();

export function registerHandler(type, fn) {
  _handlers.set(type, fn);
}

export function getHandler(type) {
  return _handlers.get(type);
}

export function getHandlers() {
  return _handlers;
}
