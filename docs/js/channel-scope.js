export const channelTag = async (channelId, serverId) => {
  if (!serverId || !channelId) throw new Error('channelTag: serverId and channelId required');
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(serverId + ':' + channelId));
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, '0')).join('');
};
