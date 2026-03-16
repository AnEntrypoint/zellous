const createConfig = (overrides = {}) => ({
  port: overrides.port ?? parseInt(process.env.PORT || '3000'),
  host: overrides.host ?? (process.env.HOST || '0.0.0.0'),
  dataDir: overrides.dataDir ?? (process.env.DATA_DIR || './data'),
  corsOrigins: overrides.corsOrigins ?? (process.env.CORS_ORIGINS || '*'),
  cleanupTimeout: overrides.cleanupTimeout ?? parseInt(process.env.CLEANUP_TIMEOUT || '600000'),
  pingInterval: overrides.pingInterval ?? parseInt(process.env.PING_INTERVAL || '30000'),
  maxBodySize: overrides.maxBodySize ?? (process.env.MAX_BODY_SIZE || '50mb'),
  sessionTtl: overrides.sessionTtl ?? parseInt(process.env.SESSION_TTL || String(7 * 24 * 60 * 60 * 1000)),
  busybaseUrl: overrides.busybaseUrl ?? (process.env.BUSYBASE_URL || null),
  busybaseKey: overrides.busybaseKey ?? (process.env.BUSYBASE_KEY || 'local'),
  livekit: {
    url: overrides.livekit?.url ?? (process.env.LIVEKIT_URL || null),
    apiKey: overrides.livekit?.apiKey ?? (process.env.LIVEKIT_API_KEY || null),
    apiSecret: overrides.livekit?.apiSecret ?? (process.env.LIVEKIT_API_SECRET || null),
    turnUrl: overrides.livekit?.turnUrl ?? (process.env.LIVEKIT_TURN_URL || null),
    turnUser: overrides.livekit?.turnUser ?? (process.env.LIVEKIT_TURN_USER || null),
    turnCredential: overrides.livekit?.turnCredential ?? (process.env.LIVEKIT_TURN_CREDENTIAL || null),
    httpPort: overrides.livekit?.httpPort ?? parseInt(process.env.LIVEKIT_HTTP_PORT || '7882'),
  },
  frameAncestors: overrides.frameAncestors ?? (process.env.FRAME_ANCESTORS || "'self' https://os.247420.xyz https://*.247420.xyz http://localhost:* http://127.0.0.1:*"),
  defaultChannels: overrides.defaultChannels ?? [
    { id: 'general', type: 'text', name: 'general', categoryId: 'text-channels', position: 0 },
    { id: 'voice', type: 'voice', name: 'Voice Chat', categoryId: 'voice-channels', position: 0 },
    { id: 'queue', type: 'threaded', name: 'Audio Queue', categoryId: 'voice-channels', position: 1 },
  ],
  defaultCategories: overrides.defaultCategories ?? [
    { id: 'text-channels', name: 'Text Channels', position: 0, collapsed: false },
    { id: 'voice-channels', name: 'Voice Channels', position: 1, collapsed: false },
  ],
  ...overrides,
});

export { createConfig };
