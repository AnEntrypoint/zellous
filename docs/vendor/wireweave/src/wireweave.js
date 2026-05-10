import { createRelayPool } from './relay-pool.js';
import { createAuth } from './auth.js';
import { createFSM } from './fsm.js';
import { createVoiceSession } from './voice.js';
import { createChat } from './chat.js';
import { createChannels } from './channels.js';
import { createServers } from './servers.js';
import { createMessageBus } from './message.js';
import { createBans } from './bans.js';
import { createRoles } from './roles.js';
import { createSettings } from './settings.js';
import { createMedia } from './media.js';
import { createPages } from './pages.js';
import { register } from './debug.js';

export const createWireweave = ({
  nostrTools,
  xstate,
  storage = (typeof localStorage !== 'undefined' ? localStorage : null),
  extension = (typeof window !== 'undefined' ? window.nostr : null),
  relays = ['wss://relay.damus.io', 'wss://relay.primal.net', 'wss://nos.lol', 'wss://relay.snort.social', 'wss://relay.nostr.band', 'wss://nostr.wine', 'wss://offchain.pub'],
  mediaDevices = (typeof navigator !== 'undefined' ? navigator.mediaDevices : null),
  WebSocketImpl = (typeof WebSocket !== 'undefined' ? WebSocket : null)
} = {}) => {
  if (!nostrTools) throw new Error('wireweave: nostrTools required');
  if (!xstate) throw new Error('wireweave: xstate required');
  if (!storage) throw new Error('wireweave: storage required (no localStorage in this env — pass a {getItem,setItem,removeItem} adapter)');

  const fsm = createFSM(xstate);
  const pool = createRelayPool({ relays, verifyEvent: nostrTools.verifyEvent, WebSocketImpl });
  const auth = createAuth({ nostrTools, storage, extension });
  const message = createMessageBus();
  const roles = createRoles({ relayPool: pool, auth });
  const bans = createBans({ relayPool: pool, auth, roles });
  const settings = createSettings({ relayPool: pool, auth, roles });
  const pages = createPages({ relayPool: pool, auth, roles });
  const media = createMedia({ relayPool: pool, auth });
  const channels = createChannels({ relayPool: pool, auth });

  let currentChannelId = null;
  const chat = createChat({
    relayPool: pool, auth,
    getChannelContext: () => ({ channelId: currentChannelId, serverId: servers.currentServerId || '' }),
    isAdmin: (sid) => roles.isAdmin(sid)
  });

  const servers = createServers({
    relayPool: pool, auth, storage,
    onSwitch: async (serverId) => {
      roles.subscribe(serverId);
      settings.subscribe(serverId);
      bans.subscribe(serverId);
      pages.subscribe(serverId);
      if (serverId) {
        await new Promise((resolve) => {
          let done = false;
          const finish = () => { if (done) return; done = true; resolve(); };
          channels.load(serverId, finish);
          setTimeout(finish, 3000);
        });
      }
      const firstText = channels.channels.find(c => c.type === 'text');
      if (firstText) {
        currentChannelId = firstText.id;
        chat.loadHistory(firstText.id);
      }
    }
  });

  let voice = null;
  const ensureVoice = ({ serverId, displayName, onAudioTrack, onVideoTrack }) => {
    if (!voice) voice = createVoiceSession({ fsm, xstate, relayPool: pool, auth, mediaDevices, bans, serverId, onAudioTrack, onVideoTrack });
    else voice.serverId = serverId;
    return voice;
  };

  const setCurrentChannel = (id) => { currentChannelId = id; if (id) chat.loadHistory(id); };

  const api = {
    pool, auth, fsm, message, bans, roles, settings, pages, media, channels, servers, chat,
    get voice() { return voice; },
    ensureVoice,
    setCurrentChannel,
    get currentChannelId() { return currentChannelId; },
    get currentServerId() { return servers.currentServerId; }
  };

  register('wireweave', api);
  return api;
};
