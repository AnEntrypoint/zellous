(function () {
  let local = { open: false, src: '', label: '' };

  function init() {
    const sdk = window.__sdk;
    if (!sdk || !sdk.C || !sdk.C.VideoLightbox) {
      setTimeout(init, 30);
      return;
    }
    let host = document.getElementById('videoLightboxHost');
    if (!host) {
      host = document.createElement('div');
      host.id = 'videoLightboxHost';
      document.body.appendChild(host);
    }

    const { applyDiff, C } = sdk;

    function render() {
      if (!local.open) { host.innerHTML = ''; return; }
      applyDiff(host, C.VideoLightbox({
        src: local.src,
        label: local.label,
        open: true,
        onClose: () => api.close()
      }));
    }

    const api = {
      show(src, label) { local = { open: true, src: src || '', label: label || '' }; render(); },
      close() { local = { open: false, src: '', label: '' }; render(); }
    };

    window.__videoLightbox = api;
    window.addEventListener('zellous:video-show', (e) => {
      const d = e.detail || {};
      api.show(d.src, d.label);
    });
    window.addEventListener('zellous:video-close', () => api.close());
  }
  init();
})();
