import { Router } from 'express';
import { EVENT_TYPES } from '../server/event-bus.js';

export const name = 'example';

export const routes = () => {
  const router = Router();
  router.get('/ping', (req, res) => res.json({ pong: true, plugin: 'example' }));
  return { path: '/api/example', router };
};

export const handlers = {
  example_echo: async (client, msg) => {
    if (client.ws.readyState === 1) {
      const { pack } = await import('msgpackr');
      client.ws.send(pack({ type: 'example_echo', echo: msg.content }));
    }
  },
};

export const middleware = async (client, msg, next) => {
  await next();
};

export const onEvent = {
  [EVENT_TYPES.USER_JOINED_ROOM]: ({ userId, roomId }) => {
    // Example: log user room joins
  },
  [EVENT_TYPES.TEXT_MESSAGE]: ({ content, roomId }) => {
    // Example: log messages
  },
};
