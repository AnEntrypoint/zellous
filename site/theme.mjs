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

function Features() {
  if (!page || !page.features || !page.features.items || !page.features.items.length) return null;
  const rows = page.features.items.map((it, i) => C.RowLink({
    key: 'f' + i,
    code: String(i + 1).padStart(2, '0'),
    title: it.name,
    sub: it.desc || '',
    meta: it.meta || '',
    href: it.href || '#'
  }));
  return C.Panel({
    title: page.features.heading || 'features',
    style: 'margin:8px',
    children: rows
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
  main: h('div', {}, Hero(), Features(), Quickstart()),
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

const embedClient = `
import { h, applyDiff, installStyles, components as C } from 'anentrypoint-design';
installStyles();
document.documentElement.classList.add('ds-247420');
// Theme: restore from localStorage or default to ink (shared with landing)
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
const navItems = (nav && nav.links ? nav.links : []).map(l => [String(l.label || ''), l.href]);

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

const App = C.AppShell({
  topbar: C.Topbar({ brand: '247420', leaf: site.title || '', items: navItems }),
  crumb: C.Crumb({ trail: ['247420', site.title || ''], leaf: page.title || '' }),
  main: h('iframe', {
    src: page.embedSrc,
    style: 'width:100%;height:100%;border:0;background:var(--panel-1);display:block',
    title: page.title || ''
  }),
  status: Footer()
});
applyDiff(document.getElementById('app'), [App]);
window.appReady = true;
`;

const embedFullscreenCss = `
html,body{height:100%;overflow:hidden}
#app{height:100vh;display:flex;flex-direction:column}
.ds-247420 .app{height:100vh;min-height:0;display:flex;flex-direction:column}
.ds-247420 .app-body{flex:1 1 auto;min-height:0;overflow:hidden;display:flex !important;grid-template-columns:none !important}
.ds-247420 .app-body.no-side>.app-side-shell{display:none}
.ds-247420 .app-main{flex:1 1 auto;min-height:0;display:flex;padding:0 !important;margin:0 !important}
.ds-247420 .app-main>iframe{flex:1 1 auto;min-height:0}
`;

const renderHtml = ({ site, nav, page, clientScript, extraStyle }) => `<!DOCTYPE html>
<html lang="en" data-theme="ink" class="ds-247420">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${escapeHtml(page.title || site.title)}${site.tagline ? ' — ' + escapeHtml(site.tagline) : ''}</title>
  <meta name="description" content="${escapeHtml(page.description || site.description || site.tagline || site.title)}" />
  <script type="importmap">{"imports":{"anentrypoint-design":"${SDK_URL}"}}</script>
  <style>html,body{margin:0;padding:0}body{background:var(--app-bg,#FBF6EB);color:var(--ink,#1F1B16);font-family:var(--ff-ui,'Nunito',system-ui,sans-serif)}${extraStyle || ''}</style>
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
  // Copy original docs/* into dist/_legacy/* so iframes can load them.
  assets: {
    '../docs/nostr-chat': '_legacy/nostr-chat',
    '../docs/sdk': '_legacy/sdk',
    '../docs/vendor': '_legacy/vendor',
    '../docs/css': '_legacy/css',
    '../docs/js': '_legacy/js',
    '../docs/msgpackr.min.js': '_legacy/msgpackr.min.js',
  },
  render: async (ctx) => {
    const site = ctx.readGlobal('site') || {};
    const nav = ctx.readGlobal('navigation') || { links: [] };
    const docs = ctx.read('pages').docs;
    const homeDoc = docs.find(p => p.id === 'home');
    if (!homeDoc) throw new Error('site/content/pages/home.yaml missing or has no id: home');

    const outputs = [{
      path: 'index.html',
      html: renderHtml({ site, nav, page: homeDoc, clientScript: landingClient })
    }];

    // Wrapped legacy pages: SDK chrome + iframe of original.
    const embeds = [
      { path: 'nostr-chat/index.html', title: 'nostr-chat', embedSrc: '../_legacy/nostr-chat/index.html' },
    ];
    for (const e of embeds) {
      outputs.push({
        path: e.path,
        html: renderHtml({ site, nav, page: e, clientScript: embedClient, extraStyle: embedFullscreenCss })
      });
    }
    return outputs;
  }
};

