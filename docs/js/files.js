const fileTransfer = {
  async uploadFromClipboard(e) {
    const items = e.clipboardData?.items;
    if (!items) return false;

    for (const item of items) {
      if (item.kind === 'file') {
        const file = item.getAsFile();
        if (file) {
          await ui.actions.sendFiles([file]);
          return true;
        }
      }
    }
    return false;
  },

  handleDrop(e) {
    e.preventDefault();
    const files = e.dataTransfer?.files;
    if (!files?.length) return;

    ui.actions.sendFiles(files);
  }
};

window.__zellous.files = fileTransfer;
window.fileTransfer = fileTransfer;
