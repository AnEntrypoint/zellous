(function () {
  const host = document.getElementById('memberList');
  if (host) { host.innerHTML = ''; host.style.display = 'none'; }
  if (window.uiMembers) window.uiMembers.render = function () {};
})();
