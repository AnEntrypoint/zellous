const responses = {
  badRequest(message = 'Bad request') {
    return { statusCode: 400, data: { error: message } };
  },

  unauthorized(message = 'Authentication required') {
    return { statusCode: 401, data: { error: message } };
  },

  forbidden(message = 'Access denied') {
    return { statusCode: 403, data: { error: message } };
  },

  notFound(message = 'Not found') {
    return { statusCode: 404, data: { error: message } };
  },

  success(data = { success: true }) {
    return { statusCode: 200, data };
  },

  error(message, statusCode = 400) {
    return { statusCode, data: { error: message } };
  },

  send(res, response) {
    return res.status(response.statusCode).json(response.data);
  }
};

const errorResponse = (message, statusCode = 400) => {
  return { error: message };
};

export { responses, errorResponse };
