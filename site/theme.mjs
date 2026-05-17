// AnEntrypoint design-system theme for flatspace.
// Renders SDK chrome around home (landing) AND legacy docs/* pages
// (each rendered as an iframe of the original, preserving scripts/styles).

import { readFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const escapeHtml = (s) => String(s ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

const escapeJson = (obj) => JSON.stringify(obj)
  .replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/&/g, '\\u0026')
  .replace(new RegExp('\\u2028', 'g'), '\\u2028').replace(new RegExp('\\u2029', 'g'), '\\u2029');

const SDK_URL = 'https://unpkg.com/anentrypoint-design@latest/dist/247420.js';
const THIS_DIR = dirname(fileURLToPath(import.meta.url));

const landingClient = `
import { h, applyDiff, installStyles, components as C } from 'anentrypoint-design';
installStyles();
document.documentElement.classList.add('ds-247420');
// Theme: restore from localStorage or default to ink
(function(){
  var KEY='zellous-theme';
  var stored=null;
  try{stored=localStorage.getItem(KEY);}catch(e){}
  var t=stored||'ink';
  if(t==='light')document.documentElement.setAttribute('data-theme','light');
  else document.documentElement.setAttribute('data-theme','ink');
})();
const data = JSON.parse(document.getElementById('__site__').textContent);
const { site, nav, page } = data;

function Hero() {
  if (!page || !page.hero) return null;
  return C.Panel({
    style: 'margin:8px',
    children: h('div', { style: 'padding:24px 22px' },
      C.Heading({ level: 1, style: 'margin:0 0 8px 0', children: page.hero.heading || site.title }),
      page.hero.subheading ? C.Lede({ children: page.hero.subheading }) : null,
      page.hero.body ? h('p', { style: 'margin:8px 0 16px 0;color:var(--panel-text-2);max-width:64ch' }, page.hero.body) : null,
      (page.hero.badges && page.hero.badges.length) ? h('div', { style: 'display:flex;gap:6px;flex-wrap:wrap;margin:0 0 12px 0' },
        ...page.hero.badges.map((b, i) => C.Chip({ key: 'b' + i, children: b.label }))
      ) : null,
      (page.hero.ctas && page.hero.ctas.length) ? h('div', { style: 'display:flex;gap:8px;flex-wrap:wrap;align-items:center' },
        ...page.hero.ctas.map((c, i) => C.Btn({ key: 'c' + i, href: c.href, primary: c.primary, children: c.label })),
        h('button', { id: 'themeToggle', style: 'background:var(--panel-2);border:1px solid var(--panel-3);color:var(--fg);padding:6px 12px;border-radius:4px;cursor:pointer;font-size:inherit;font-family:inherit' }, 'ink')
      ) : null
    )
  });
}

function Rooms() {
  if (!page || !page.rooms || !page.rooms.items || !page.rooms.items.length) return null;
  const cards = page.rooms.items.map((it, i) => h('a', {
    key: 'r' + i,
    class: 'z-card',
    href: it.href || '#'
  },
    h('span', { class: 'z-card-code' }, it.code || String(i + 1).padStart(3, '0')),
    h('span', { class: 'z-card-title' }, it.title || ''),
    h('span', { class: 'z-card-meta' }, it.meta || '')
  ));
  return C.Panel({
    title: page.rooms.heading || 'drop-in rooms',
    style: 'margin:8px',
    children: h('div', { class: 'z-cards' }, ...cards)
  });
}

function Features() {
  if (!page || !page.features || !page.features.items || !page.features.items.length) return null;
  const cards = page.features.items.map((it, i) => h('div', {
    key: 'f' + i,
    class: 'z-card'
  },
    h('span', { class: 'z-card-code' }, it.meta || String(i + 1).padStart(2, '0')),
    h('span', { class: 'z-card-title' }, it.name || ''),
    h('span', { class: 'z-card-meta' }, it.desc || '')
  ));
  return C.Panel({
    title: page.features.heading || 'features',
    style: 'margin:8px',
    children: h('div', { class: 'z-cards' }, ...cards)
  });
}

function Stack() {
  if (!page || !page.stack || !page.stack.items || !page.stack.items.length) return null;
  const rows = page.stack.items.map((it, i) => [
    h('div', { key: 'sk' + i, class: 'z-tech-k' }, it.k || ''),
    h('div', { key: 'sv' + i, class: 'z-tech-v' }, it.v || '')
  ]).flat();
  return C.Panel({
    title: page.stack.heading || 'stack',
    style: 'margin:8px',
    children: h('div', { class: 'z-tech' }, ...rows)
  });
}

function Manifesto() {
  if (!page || !page.manifesto || !page.manifesto.items || !page.manifesto.items.length) return null;
  const paras = page.manifesto.items.map((txt, i) => h('p', { key: 'm' + i, class: 'z-manifesto-p' }, txt));
  return C.Panel({
    title: page.manifesto.heading || 'manifesto',
    style: 'margin:8px',
    children: h('div', { class: 'z-manifesto' }, ...paras)
  });
}

function Quickstart() {
  if (!page || !page.quickstart || !page.quickstart.lines || !page.quickstart.lines.length) return null;
  const lineNodes = page.quickstart.lines.map((l, i) => {
    const isComment = l.kind === 'cmt';
    return h('div', { key: 'q' + i, class: 'cli' },
      h('span', { class: 'prompt' }, isComment ? '#' : '$'),
      h('span', { class: 'cmd' }, l.text)
    );
  });
  return C.Panel({
    title: page.quickstart.heading || 'quick start',
    style: 'margin:8px',
    children: h('div', { style: 'padding:16px 22px' }, ...lineNodes)
  });
}

function Footer() {
  return h('footer', { class: 'app-status' },
    h('span', { class: 'item' }, 'styled with '),
    h('a', { class: 'item', href: 'https://anentrypoint.github.io/design/' }, 'anentrypoint-design'),
    h('span', { class: 'item' }, '·'),
    h('a', { class: 'item', href: 'https://247420.xyz' }, '247420.xyz'),
    h('span', { class: 'spread' }),
    site.repo ? h('a', { class: 'item', href: site.repo }, 'source ↗') : null
  );
}

const navItems = (nav && nav.links ? nav.links : []).map(l => [String(l.label || ''), l.href]);

const App = C.AppShell({
  topbar: C.Topbar({ brand: '247420', leaf: site.title || '', items: navItems }),
  crumb: C.Crumb({ trail: ['247420'], leaf: site.title || '' }),
  main: h('div', {}, Hero(), Rooms(), Features(), Stack(), Manifesto(), Quickstart()),
  status: Footer()
});
applyDiff(document.getElementById('app'), [App]);
// Wire theme toggle after render
setTimeout(()=>{
  var KEY='zellous-theme';
  var btn=document.getElementById('themeToggle');
  if(!btn)return;
  function updateBtn(){
    var cur=document.documentElement.getAttribute('data-theme');
    btn.textContent=cur==='light'?'light':'ink';
  }
  updateBtn();
  btn.addEventListener('click',()=>{
    var cur=document.documentElement.getAttribute('data-theme');
    var next=cur==='light'?'ink':'light';
    document.documentElement.setAttribute('data-theme',next);
    try{localStorage.setItem(KEY,next);}catch(e){}
    updateBtn();
  });
},0);
`;



const renderHtml = ({ site, nav, page, clientScript, extraStyle }) => `<!DOCTYPE html>
<html lang="en" data-theme="ink" class="ds-247420">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${escapeHtml(page.title || site.title)}${site.tagline ? ' — ' + escapeHtml(site.tagline) : ''}</title>
  <meta name="description" content="${escapeHtml(page.description || site.description || site.tagline || site.title)}" />
  <script type="importmap">{"imports":{"anentrypoint-design":"${SDK_URL}"}}</script>
  <style>html,body{margin:0;padding:0}body{background:var(--app-bg,#FBF6EB);color:var(--ink,#1F1B16);font-family:var(--ff-ui,'Nunito','Noto Sans',sans-serif)}.z-cards{display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:0}.z-card{display:flex;flex-direction:column;gap:6px;padding:16px 18px;background:var(--panel-1);color:var(--panel-text);text-decoration:none;transition:background 80ms}.z-card:nth-child(even){background:var(--panel-2)}.z-card:hover{background:var(--panel-text);color:var(--panel-0)}.z-card-code{font-family:var(--ff-mono,monospace);font-size:10px;text-transform:uppercase;letter-spacing:.1em;color:var(--panel-accent)}.z-card:hover .z-card-code{color:var(--panel-0);opacity:.75}.z-card-title{font-family:var(--ff-display,'Archivo Black',sans-serif);font-size:20px;letter-spacing:-.01em;line-height:1.1}.z-card-meta{font-size:11px;color:var(--panel-text-3);line-height:1.5}.z-card:hover .z-card-meta{color:var(--panel-0);opacity:.75}.z-tech{display:grid;grid-template-columns:180px 1fr;font-family:var(--ff-mono,monospace);font-size:13px}.z-tech-k{padding:10px 16px;color:var(--panel-text-3)}.z-tech-v{padding:10px 16px;color:var(--panel-text)}.z-tech-k:nth-child(4n+1),.z-tech-v:nth-child(4n+2){background:var(--panel-2)}.z-manifesto{padding:16px 22px;display:grid;gap:14px}.z-manifesto-p{font-family:var(--ff-prose,'Nunito',sans-serif);font-size:17px;font-style:italic;line-height:1.5;max-width:60ch;margin:0;color:var(--panel-text)}${extraStyle || ''}</style>
  <script>
  // Theme init — runs before paint. Shares 'zellous-theme' localStorage with nostr-chat.
  (function(){
    var KEY='zellous-theme';
    var stored=null;
    try{stored=localStorage.getItem(KEY);}catch(e){}
    var t=stored||'ink';
    if(t==='light')document.documentElement.setAttribute('data-theme','light');
    else document.documentElement.setAttribute('data-theme','ink');
  })();
  </script>
</head>
<body>
  <div id="app"></div>
  <script type="application/json" id="__site__">${escapeJson({ site, nav, page })}</script>
  <script type="module">${clientScript}</script>
  <script>
  // Theme toggle wiring — bound after client script loads.
  (function(){
    var KEY='zellous-theme';
    var btn=document.getElementById('themeToggle');
    if(!btn)return;
    function updateBtn(){
      var cur=document.documentElement.getAttribute('data-theme');
      btn.textContent=cur==='light'?'light':'ink';
    }
    updateBtn();
    btn.addEventListener('click',function(){
      var cur=document.documentElement.getAttribute('data-theme');
      var next=cur==='light'?'ink':'light';
      document.documentElement.setAttribute('data-theme',next);
      try{localStorage.setItem(KEY,next);}catch(e){}
      updateBtn();
    });
  })();
  </script>
</body>
</html>
`;

export default {
  // Copy original docs/* into dist/ so the app and its assets are served directly.
  assets: {
    '../docs/nostr-chat': 'nostr-chat',
    '../docs/sdk': 'sdk',
    '../docs/vendor': 'vendor',
    '../docs/css': 'css',
    '../docs/js': 'js',
    '../docs/msgpackr.min.js': 'msgpackr.min.js',
  },
  render: async (ctx) => {
    const site = ctx.readGlobal('site') || {};
    const nav = ctx.readGlobal('navigation') || { links: [] };
    const docs = ctx.read('pages').docs;
    const homeDoc = docs.find(p => p.id === 'home');
    if (!homeDoc) throw new Error('site/content/pages/home.yaml missing or has no id: home');

    return [{
      path: 'index.html',
      html: renderHtml({ site, nav, page: homeDoc, clientScript: landingClient })
    }];
  }
};

