import { bots } from './bot-store.js';
import { responses } from './response-formatter.js';

const parseBotApiKey = (req) => {
  const authHeader = req.headers.authorization;
  if (authHeader?.startsWith('Bot ')) {
    return authHeader.slice(4);
  }
  if (req.query?.api_key) {
    return req.query.api_key;
  }
  return null;
};

const requireBotAuth = async (req, res, next) => {
  const apiKey = parseBotApiKey(req);
  if (!apiKey) {
    return responses.send(res, responses.unauthorized('Bot API key required'));
  }

  const bot = await bots.findByApiKey(apiKey);
  if (!bot) {
    return responses.send(res, responses.unauthorized('Invalid API key'));
  }

  await bots.touch(bot.id);
  req.bot = bot;
  next();
};

const requireBotPermission = (permission) => async (req, res, next) => {
  if (!req.bot) {
    return responses.send(res, responses.unauthorized('Bot authentication required'));
  }
  if (!await bots.hasPermission(req.bot, permission)) {
    return responses.send(res, responses.forbidden(`Permission '${permission}' required`));
  }
  next();
};

const requireRoomAccess = async (req, res, next) => {
  const roomId = req.params.roomId || req.body?.roomId;
  if (!roomId) {
    return responses.send(res, responses.badRequest('Room ID required'));
  }
  if (!await bots.canAccessRoom(req.bot, roomId)) {
    return responses.send(res, responses.forbidden('Bot not allowed in this room'));
  }
  next();
};

export { parseBotApiKey, requireBotAuth, requireBotPermission, requireRoomAccess };
