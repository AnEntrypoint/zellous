export function installForum(ww) {
  // Forum bridge (kind:11 posts + NIP-22 kind:1111 replies, scoped per
  // channel) -- forumVersion is a real reactive signal (unlike ui.render.all(),
  // which only re-renders the server list) so a newly published post appears
  // without leaving and re-entering the channel.
  const forum = ww.forum;
  forum.addEventListener('posts', () => { state.forumVersion = (state.forumVersion || 0) + 1; });
  forum.addEventListener('replies', () => { state.forumVersion = (state.forumVersion || 0) + 1; });
  window.nostrForum = {
    listFor: (channelId) => forum.listFor(channelId),
    repliesFor: (postId) => forum.repliesFor(postId),
    loadChannel: (channelId, serverId) => forum.loadChannel(channelId, serverId),
    loadReplies: (postId) => forum.loadReplies(postId),
    createPost: (channelId, serverId, title, content) => forum.createPost(channelId, serverId, title, content),
    reply: (postId, authorPubkey, content) => forum.reply(postId, authorPubkey, content)
  };
}
