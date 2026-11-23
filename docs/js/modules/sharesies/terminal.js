const CSS_URL = new URL('../../../vendor/xterm/xterm-6.0.0.css', import.meta.url).href;
const XTERM_URL = new URL('../../../vendor/xterm/xterm-6.0.0.mjs', import.meta.url).href;
const FIT_URL = new URL('../../../vendor/xterm/addon-fit-0.11.0.mjs', import.meta.url).href;

let loaded = null;

const load = () => {
  if (!loaded) loaded = Promise.all([import(XTERM_URL), import(FIT_URL), fetch(CSS_URL).then((r) => r.text())]).then(([x, f, css]) => ({ Terminal: x.Terminal, FitAddon: f.FitAddon, css }));
  return loaded;
};

export async function attachTerminal(host, session, buffer) {
  const { Terminal, FitAddon, css } = await load();
  const shadow = host.attachShadow({ mode: 'open' });
  const style = document.createElement('style');
  style.textContent = css + ':host{display:block;height:100%}.xterm{height:100%;padding:8px;box-sizing:border-box}';
  const mount = document.createElement('div');
  mount.style.height = '100%';
  shadow.append(style, mount);
  const term = new Terminal({ convertEol: false, cursorBlink: true, fontFamily: 'ui-monospace, Menlo, Consolas, monospace', fontSize: 14, theme: { background: '#111214', foreground: '#dbdee1' } });
  const fit = new FitAddon();
  term.loadAddon(fit);
  term.open(mount);
  for (const chunk of buffer) term.write(chunk);
  const onData = term.onData((d) => session.stdin(d));
  const refit = () => { try { fit.fit(); } catch {} };
  const onResize = term.onResize(({ cols, rows }) => session.resize(cols, rows));
  const watcher = new ResizeObserver(refit);
  watcher.observe(host);
  refit();
  const write = (e) => term.write(e.detail.data);
  session.addEventListener('stdout', write);
  session.addEventListener('stderr', write);
  return () => { session.removeEventListener('stdout', write); session.removeEventListener('stderr', write); onData.dispose(); onResize.dispose(); watcher.disconnect(); term.dispose(); shadow.replaceChildren(); };
}
