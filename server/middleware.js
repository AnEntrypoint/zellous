/**
 * @typedef {function(Object, Object, function): Promise<void>} Middleware
 * A function that processes a WebSocket message before it reaches the handler.
 * Call next() to pass control to the next middleware or handler.
 * Return without calling next() to short-circuit the pipeline.
 */

const _middlewares = [];

/**
 * Register a global WebSocket message middleware.
 * @param {Middleware} fn - Middleware function (client, msg, next) => void
 */
const useMiddleware = (fn) => { _middlewares.push(fn); };

/**
 * Create a composed pipeline from an array of middleware functions.
 * @param {Middleware[]} [extra=[]] - Additional middleware to append
 * @returns {function(Object, Object, function): Promise<void>}
 */
const createPipeline = (extra = []) => {
  const all = [..._middlewares, ...extra];
  return async (client, msg, finalHandler) => {
    let i = 0;
    const next = async () => {
      if (i < all.length) {
        const fn = all[i++];
        try { await fn(client, msg, next); } catch (e) { throw e; }
      } else {
        if (finalHandler) await finalHandler(client, msg);
      }
    };
    await next();
  };
};

/**
 * Get current list of registered middlewares (read-only copy).
 * @returns {Middleware[]}
 */
const getMiddlewares = () => [..._middlewares];

export { useMiddleware, createPipeline, getMiddlewares };
