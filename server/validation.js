const validators = {
  username(value) {
    if (!value || typeof value !== 'string') {
      return { valid: false, error: 'Username required' };
    }
    if (value.length < 3 || value.length > 32) {
      return { valid: false, error: 'Username must be 3-32 characters' };
    }
    if (!/^[a-zA-Z0-9_]+$/.test(value)) {
      return { valid: false, error: 'Username can only contain letters, numbers, and underscores' };
    }
    return { valid: true };
  },

  password(value, minLength = 6) {
    if (!value || typeof value !== 'string') {
      return { valid: false, error: `Password required` };
    }
    if (value.length < minLength) {
      return { valid: false, error: `Password must be at least ${minLength} characters` };
    }
    return { valid: true };
  },

  displayName(value) {
    if (!value || typeof value !== 'string') {
      return { valid: false, error: 'Display name required' };
    }
    if (value.length < 1 || value.length > 64) {
      return { valid: false, error: 'Display name must be 1-64 characters' };
    }
    return { valid: true };
  },

  token(value) {
    if (!value || typeof value !== 'string') {
      return { valid: false, error: 'Token required' };
    }
    return { valid: true };
  },

  apiKey(value) {
    if (!value || typeof value !== 'string') {
      return { valid: false, error: 'API key required' };
    }
    if (!value.startsWith('zb_')) {
      return { valid: false, error: 'Invalid API key format' };
    }
    return { valid: true };
  },

  roomId(value) {
    if (!value || typeof value !== 'string') {
      return { valid: false, error: 'Room ID required' };
    }
    return { valid: true };
  },

  botName(value) {
    if (!value || typeof value !== 'string') {
      return { valid: false, error: 'Bot name required' };
    }
    return { valid: true };
  },

  required(value, fieldName = 'Field') {
    if (value === undefined || value === null || value === '') {
      return { valid: false, error: `${fieldName} required` };
    }
    return { valid: true };
  },

  length(value, min, max, fieldName = 'Field') {
    if (!value) {
      return { valid: false, error: `${fieldName} required` };
    }
    const len = String(value).length;
    if (len < min || len > max) {
      return { valid: false, error: `${fieldName} must be ${min}-${max} characters` };
    }
    return { valid: true };
  },

  regex(value, pattern, fieldName = 'Field', errorMsg = null) {
    if (!value) {
      return { valid: false, error: `${fieldName} required` };
    }
    if (!pattern.test(String(value))) {
      return { valid: false, error: errorMsg || `${fieldName} format invalid` };
    }
    return { valid: true };
  }
};

export { validators };
