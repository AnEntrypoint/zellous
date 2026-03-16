class ZellousError extends Error {
  constructor(message, statusCode = 500, code = 'INTERNAL_ERROR') {
    super(message);
    this.name = this.constructor.name;
    this.statusCode = statusCode;
    this.code = code;
  }
  toJSON() { return { error: this.message, code: this.code }; }
}

class AuthError extends ZellousError {
  constructor(message = 'Authentication required', code = 'AUTH_REQUIRED') {
    super(message, 401, code);
  }
}

class NotFoundError extends ZellousError {
  constructor(message = 'Not found', code = 'NOT_FOUND') {
    super(message, 404, code);
  }
}

class ValidationError extends ZellousError {
  constructor(message = 'Validation failed', code = 'VALIDATION_ERROR') {
    super(message, 400, code);
  }
}

class StorageError extends ZellousError {
  constructor(message = 'Storage error', code = 'STORAGE_ERROR') {
    super(message, 500, code);
  }
}

class PermissionError extends ZellousError {
  constructor(message = 'Access denied', code = 'PERMISSION_DENIED') {
    super(message, 403, code);
  }
}

const errorMiddleware = (err, req, res, next) => {
  if (err instanceof ZellousError) {
    return res.status(err.statusCode).json(err.toJSON());
  }
  if (err?.status || err?.statusCode) {
    return res.status(err.status || err.statusCode).json({ error: err.message || 'Error' });
  }
  res.status(500).json({ error: 'Internal server error' });
};

export { ZellousError, AuthError, NotFoundError, ValidationError, StorageError, PermissionError, errorMiddleware };
