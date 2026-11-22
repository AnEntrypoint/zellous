const URL_RE = /https?:\/\/[^\s<>"'|]+/i;
const IMAGE_RE = /\.(?:png|jpe?g|gif|webp)(?:\?|$)/i;
const TIMEOUT_MS = 2500;

const meta = (doc, ...names) => {
  for (const n of names) {
    const el = doc.querySelector('meta[property="' + n + '"], meta[name="' + n + '"]');
    const v = el && el.getAttribute('content');
    if (v && v.trim()) return v.trim();
  }
  return '';
};

const withTimeout = (promise) => Promise.race([promise, new Promise((resolve) => setTimeout(() => resolve(null), TIMEOUT_MS))]);

async function fetchPage(url) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: ctl.signal, credentials: 'omit', referrerPolicy: 'no-referrer', redirect: 'follow' });
    if (!res.ok || !/text\/html/i.test(res.headers.get('content-type') || '')) return null;
    const html = (await res.text()).slice(0, 400000);
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const title = meta(doc, 'og:title', 'twitter:title') || (doc.title || '').trim();
    const description = meta(doc, 'og:description', 'twitter:description', 'description');
    let image = meta(doc, 'og:image', 'twitter:image');
    try { image = image ? new URL(image, res.url || url).href : ''; } catch (_) { image = ''; }
    if (!/^https:\/\//.test(image)) image = '';
    return title ? { url, title: title.slice(0, 120), description: description.slice(0, 240), image } : null;
  } catch (_) {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function fetchOembed(url) {
  const res = await fetch('https://www.youtube.com/oembed?format=json&url=' + encodeURIComponent(url)).catch(() => null);
  if (!res || !res.ok) return null;
  const j = await res.json().catch(() => null);
  return j && j.title ? { url, title: String(j.title).slice(0, 120), description: String(j.author_name || '').slice(0, 240), image: /^https:\/\//.test(j.thumbnail_url || '') ? j.thumbnail_url : '' } : null;
}

export async function unfurlText(text) {
  const hit = URL_RE.exec(String(text || ''));
  if (!hit || IMAGE_RE.test(hit[0])) return [];
  const url = hit[0];
  const youtube = /(?:youtube\.com\/(?:watch|shorts)|youtu\.be\/)/i.test(url);
  const card = await withTimeout(youtube ? fetchOembed(url) : fetchPage(url));
  return card ? [card] : [];
}
