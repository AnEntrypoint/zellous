(function () {
  const host = document.getElementById('channelSidebar');
  if (host) { host.innerHTML = ''; host.style.display = 'none'; }
  if (window.uiChannels) {
    window.uiChannels.render = function () {};
    window.uiChannels.renderHome = function () {};
  }
})();
