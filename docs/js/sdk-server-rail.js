(function () {
  const host = document.getElementById('serverList');
  if (host) { host.innerHTML = ''; host.style.display = 'none'; }
  if (window.serverManager) window.serverManager.renderList = function () {};
})();
