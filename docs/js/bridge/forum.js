export function installForum(ww) {
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
