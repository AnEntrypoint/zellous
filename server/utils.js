const errorResponse = (message, statusCode = 400) => ({ error: message });

const responses = {
  badRequest: (msg = 'Bad request') => ({ statusCode: 400, data: { error: msg } }),
  unauthorized: (msg = 'Authentication required') => ({ statusCode: 401, data: { error: msg } }),
  forbidden: (msg = 'Access denied') => ({ statusCode: 403, data: { error: msg } }),
  notFound: (msg = 'Not found') => ({ statusCode: 404, data: { error: msg } }),
  success: (data = { success: true }) => ({ statusCode: 200, data }),
  error: (msg, code = 400) => ({ statusCode: code, data: { error: msg } }),
  send: (res, r) => res.status(r.statusCode).json(r.data),
};

const validators = {
  username: (v) => (!v || typeof v !== 'string') ? { valid: false, error: 'Username required' } : (v.length < 3 || v.length > 32) ? { valid: false, error: 'Username must be 3-32 characters' } : !/^[a-zA-Z0-9_]+$/.test(v) ? { valid: false, error: 'Username can only contain letters, numbers, and underscores' } : { valid: true },
  password: (v, min = 6) => (!v || typeof v !== 'string') ? { valid: false, error: 'Password required' } : v.length < min ? { valid: false, error: `Password must be at least ${min} characters` } : { valid: true },
  displayName: (v) => (!v || typeof v !== 'string') ? { valid: false, error: 'Display name required' } : (v.length < 1 || v.length > 64) ? { valid: false, error: 'Display name must be 1-64 characters' } : { valid: true },
  token: (v) => (!v || typeof v !== 'string') ? { valid: false, error: 'Token required' } : { valid: true },
  apiKey: (v) => (!v || typeof v !== 'string') ? { valid: false, error: 'API key required' } : !v.startsWith('zb_') ? { valid: false, error: 'Invalid API key format' } : { valid: true },
  botName: (v) => (!v || typeof v !== 'string') ? { valid: false, error: 'Bot name required' } : { valid: true },
  required: (v, name = 'Field') => (v === undefined || v === null || v === '') ? { valid: false, error: `${name} required` } : { valid: true },
};

export { responses, errorResponse, validators };
