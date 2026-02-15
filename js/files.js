// Files module - file transfer alongside voice/video

const fileTransfer = {
  uploads: new Map(), // uploadId -> upload state
  maxFileSize: 50 * 1024 * 1024, // 50MB max
  chunkSize: 64 * 1024, // 64KB chunks for large files

  // Upload file
  async upload(file, customPath = '', description = '') {
    if (!file || !state.ws) return null;

    if (file.size > this.maxFileSize) {
      throw new Error(`File too large. Maximum size is ${this.formatSize(this.maxFileSize)}`);
    }

    const uploadId = Date.now() + Math.random().toString(36).slice(2);

    // For small files, send directly
    if (file.size < 1024 * 1024) {
      return this.uploadSmall(file, customPath, description);
    }

    // For larger files, use chunked upload
    return this.uploadChunked(file, customPath, description, uploadId);
  },

  // Upload small file directly
  async uploadSmall(file, customPath, description) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const base64 = e.target.result.split(',')[1];
        network.send({
          type: 'file_upload_complete',
          filename: file.name,
          data: base64,
          path: customPath,
          description,
          channelId: state.currentChannel?.id || 'general'
        });
        resolve({ filename: file.name, size: file.size });
      };
      reader.onerror = () => reject(new Error('Failed to read file'));
      reader.readAsDataURL(file);
    });
  },

  // Upload large file in chunks
  async uploadChunked(file, customPath, description, uploadId) {
    const upload = {
      id: uploadId,
      file,
      path: customPath,
      description,
      totalChunks: Math.ceil(file.size / this.chunkSize),
      uploadedChunks: 0,
      status: 'uploading',
      progress: 0
    };
    this.uploads.set(uploadId, upload);

    // Notify start
    network.send({
      type: 'file_upload_start',
      uploadId,
      filename: file.name,
      size: file.size
    });

    // Read and send chunks
    const chunks = [];
    for (let i = 0; i < upload.totalChunks; i++) {
      const start = i * this.chunkSize;
      const end = Math.min(start + this.chunkSize, file.size);
      const chunk = file.slice(start, end);

      try {
        const base64 = await this.readChunk(chunk);
        chunks.push(base64);
        upload.uploadedChunks++;
        upload.progress = Math.round((upload.uploadedChunks / upload.totalChunks) * 100);
        ui.render.uploadProgress?.(upload);
      } catch (e) {
        upload.status = 'error';
        throw e;
      }
    }

    // Send complete message with all data
    const fullBase64 = await this.readFile(file);
    network.send({
      type: 'file_upload_complete',
      uploadId,
      filename: file.name,
      data: fullBase64,
      path: customPath,
      description,
      channelId: state.currentChannel?.id || 'general'
    });

    upload.status = 'complete';
    this.uploads.delete(uploadId);

    return { filename: file.name, size: file.size };
  },

  // Read file as base64
  readFile(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => resolve(e.target.result.split(',')[1]);
      reader.onerror = () => reject(new Error('Failed to read file'));
      reader.readAsDataURL(file);
    });
  },

  // Read chunk as base64
  readChunk(blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => resolve(e.target.result.split(',')[1]);
      reader.onerror = () => reject(new Error('Failed to read chunk'));
      reader.readAsDataURL(blob);
    });
  },

  // Upload image from clipboard
  async uploadFromClipboard(e) {
    const items = e.clipboardData?.items;
    if (!items) return false;

    for (const item of items) {
      if (item.type.startsWith('image/')) {
        const file = item.getAsFile();
        if (file) {
          await chat.sendImage(file);
          return true;
        }
      }
    }
    return false;
  },

  // Handle drag and drop
  handleDrop(e) {
    e.preventDefault();
    const files = e.dataTransfer?.files;
    if (!files?.length) return;

    for (const file of files) {
      if (file.type.startsWith('image/')) {
        chat.sendImage(file);
      } else {
        this.upload(file);
      }
    }
  },

  // List files in room
  async list(path = '') {
    try {
      const res = await fetch(`/api/rooms/${state.roomId}/files?path=${encodeURIComponent(path)}`);
      const data = await res.json();
      return data.files || [];
    } catch {
      return [];
    }
  },

  // Download file
  download(fileId, filename) {
    const url = `/api/rooms/${state.roomId}/files/${fileId}`;
    const a = document.createElement('a');
    a.href = url;
    a.download = filename || 'download';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  },

  // Format file size
  formatSize(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  },

  // Get current uploads
  getUploads() {
    return Array.from(this.uploads.values());
  }
};

window.fileTransfer = fileTransfer;
