const channelApi = {
  roomUrl: () => `/api/rooms/${state.roomId}`,

  async create(name, type, categoryId) {
    return (await apiRequest('POST', `${this.roomUrl()}/channels`, { name, type, categoryId })).channel;
  },
  async rename(channelId, name) {
    return (await apiRequest('PATCH', `${this.roomUrl()}/channels/${channelId}`, { name })).channel;
  },
  async moveChannel(channelId, categoryId, position) {
    return (await apiRequest('PATCH', `${this.roomUrl()}/channels/${channelId}`, { categoryId, position })).channel;
  },
  async remove(channelId) {
    await apiRequest('DELETE', `${this.roomUrl()}/channels/${channelId}`);
    return true;
  },
  async createCategory(name) {
    return (await apiRequest('POST', `${this.roomUrl()}/categories`, { name })).category;
  },
  async renameCategory(categoryId, name) {
    return (await apiRequest('PATCH', `${this.roomUrl()}/categories/${categoryId}`, { name })).category;
  },
  async deleteCategory(categoryId) {
    await apiRequest('DELETE', `${this.roomUrl()}/categories/${categoryId}`);
    return true;
  },
  async reorderChannels(categoryId, orderedIds) {
    return (await apiRequest('POST', `${this.roomUrl()}/channels/reorder`, { categoryId, orderedIds })).channels;
  },
  async reorderCategories(orderedIds) {
    return (await apiRequest('POST', `${this.roomUrl()}/categories/reorder`, { orderedIds })).categories;
  },
};

window.channelApi = channelApi;
