const apiRequest = async (method, url, body) => {
  const headers = { 'Content-Type': 'application/json' };
  const token = window.auth?.getToken?.();
  if (token) headers['Authorization'] = 'Bearer ' + token;
  const opts = { method, headers };
  if (body !== undefined) opts.body = JSON.stringify(body);
  const res = await fetch(url, opts);
  if (!res.ok) { const e = await res.json(); throw new Error(e.error); }
  return res.json();
};

window.apiRequest = apiRequest;
