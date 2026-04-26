const registry = new Map();

export const register = (key, obj) => {
  registry.set(key, obj);
  if (typeof window !== 'undefined') {
    window.__magicwand = window.__magicwand || {};
    window.__magicwand[key] = obj;
  }
};

export const deregister = (key) => {
  registry.delete(key);
  if (typeof window !== 'undefined' && window.__magicwand) {
    delete window.__magicwand[key];
  }
};

export const get = (key) => registry.get(key);

export const all = () => Object.fromEntries(registry);
