import { users, sessions } from './storage.js';

const parseToken = (req) => {
  const authHeader = req.headers.authorization;
  if (authHeader?.startsWith('Bearer ')) {
    return authHeader.slice(7);
  }

  if (req.query?.token) {
    return req.query.token;
  }

  if (req.cookies?.session) {
    return req.cookies.session;
  }

  return null;
};

const optionalAuth = async (req, res, next) => {
  const token = parseToken(req);
  if (token) {
    const session = await sessions.validate(token);
    if (session) {
      const user = await users.findById(session.userId);
      if (user) {
        req.session = session;
        req.user = {
          id: user.id,
          username: user.username,
          displayName: user.displayName
        };
      }
    }
  }
  next();
};

const requireAuth = async (req, res, next) => {
  const token = parseToken(req);
  if (!token) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  const session = await sessions.validate(token);
  if (!session) {
    return res.status(401).json({ error: 'Invalid or expired session' });
  }

  const user = await users.findById(session.userId);
  if (!user) {
    return res.status(401).json({ error: 'User not found' });
  }

  req.session = session;
  req.user = {
    id: user.id,
    username: user.username,
    displayName: user.displayName,
    settings: user.settings
  };
  next();
};

const authenticateWebSocket = async (token) => {
  if (!token) return null;

  const session = await sessions.validate(token);
  if (!session) return null;

  const user = await users.findById(session.userId);
  if (!user) return null;

  await sessions.touch(session.id);

  return {
    session,
    user: {
      id: user.id,
      username: user.username,
      displayName: user.displayName
    }
  };
};

export { parseToken, optionalAuth, requireAuth, authenticateWebSocket };
