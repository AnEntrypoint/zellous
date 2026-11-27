export function collect(a) {
  const { side, rules, alias, ignore, tagKeyed, props, purpose } = a;
  const ign = new Set(ignore);
  const visible = (e) => {
    const r = e.getBoundingClientRect();
    if (r.width < 0.5 || r.height < 0.5) return false;
    const cs = getComputedStyle(e);
    if (cs.visibility === 'hidden' || cs.display === 'none') return false;
    const cx = r.x + r.width / 2, cy = r.y + r.height / 2;
    if (cx < 0 || cy < 0 || cx >= innerWidth || cy >= innerHeight) return true;
    const top = document.elementFromPoint(cx, cy);
    return !top || e.contains(top) || top.contains(e);
  };
  const norm = (t) => t.replace(/\s+/g, ' ').trim().toLowerCase().slice(0, 40);
  const ownText = (e) => {
    if (!e.children.length) return norm(e.textContent || '');
    return norm([...e.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent).join(' '));
  };
  const baseKey = (e) => {
    for (const [key, sel] of rules) { try { if (e.matches(sel)) return key; } catch {} }
    for (const c of e.classList) {
      const k = alias[c] !== undefined ? alias[c] : side === 'ref' ? c : c.startsWith('ds-g3-') ? c.slice(6) : null;
      if (k && !ign.has(k)) return k;
    }
    return null;
  };
  const purposeOf = (e) => {
    for (const p of purpose) {
      const sel = p[side];
      if (sel && (e.closest(sel))) return p.id;
    }
    return null;
  };
  const all = [...document.body.querySelectorAll('*')];
  const out = [];
  const keyEl = new Map();
  const keyed = (e) => keyEl.get(e);
  for (const e of all) {
    if (['script', 'style', 'path', 'option', 'circle', 'rect', 'br', 'g', 'defs', 'line', 'polyline', 'polygon', 'ellipse', 'use', 'title'].includes(e.tagName.toLowerCase()) && !(e.tagName.toLowerCase() === 'svg')) continue;
    if (e.closest('svg') && e.tagName.toLowerCase() !== 'svg') continue;
    if (!visible(e) || e.classList.contains('sr-only')) continue;
    let key = baseKey(e);
    const tag = e.tagName.toLowerCase();
    if (!key && tagKeyed.includes(tag)) {
      let p = e.parentElement; let pk = null;
      while (p && !(pk = keyEl.get(p))) p = p.parentElement;
      if (pk) key = tag + '<' + pk;
    }
    if (key === '_skip') continue;
    if (!key) continue;
    keyEl.set(e, key);
    const cs = getComputedStyle(e);
    const r = e.getBoundingClientRect();
    const st = {};
    for (const p of props) st[p] = cs[p];
    st.fontFamily = cs.fontFamily.split(',')[0].replace(/["']/g, '').trim();
    let p = e.parentElement; let pi = -1;
    while (p) { const k = keyEl.get(p); if (k !== undefined) { pi = out.findIndex((o) => o.el === p); break; } p = p.parentElement; }
    out.push({ el: e, key, tag, leaf: tag === 'svg' || !e.children.length, text: key === 'smi' ? norm(e.textContent || '').replace(/ /g, '') : ownText(e), x: r.x, y: r.y, w: r.width, h: r.height, st, parent: pi, purpose: purposeOf(e), sel: tag + (e.classList.length ? '.' + [...e.classList].join('.') : '') });
  }
  return out.map((o) => { const { el, ...rest } = o; return rest; });
}

export function maskAndRects(a) {
  const { selectors, rects } = a;
  const got = [];
  for (const sel of selectors) {
    for (const el of document.querySelectorAll(sel)) {
      const r = el.getBoundingClientRect();
      if (r.width < 0.5 || r.height < 0.5) continue;
      got.push({ x: r.x, y: r.y, w: r.width, h: r.height });
      for (const t of [el, ...el.querySelectorAll('*')]) if (!t.hasAttribute('data-parity-style')) t.setAttribute('data-parity-style', t.getAttribute('style') || '');
      el.style.setProperty('background', '#f0f', 'important');
      el.style.setProperty('color', 'transparent', 'important');
      el.style.setProperty('border-color', '#f0f', 'important');
      el.style.setProperty('box-shadow', 'none', 'important');
      for (const c of el.querySelectorAll('*')) c.style.setProperty('visibility', 'hidden', 'important');
      if (el.tagName === 'IMG') el.style.setProperty('visibility', 'hidden', 'important');
    }
  }
  for (const r of rects || []) {
    const d = document.createElement('div');
    d.setAttribute('data-parity-rect', '');
    d.style.cssText = `position:fixed;left:${r.x}px;top:${r.y}px;width:${r.w}px;height:${r.h}px;background:#0f0;z-index:2147483647;pointer-events:none`;
    document.body.appendChild(d);
  }
  return got;
}

export function quiet() {
  const s = document.createElement('style');
  s.textContent = '*,*::before,*::after{transition:none!important;animation:none!important;caret-color:transparent!important;scroll-behavior:auto!important}';
  document.head.appendChild(s);
  if (document.activeElement && document.activeElement !== document.body) document.activeElement.blur();
}

export function unmask() {
  for (const t of document.querySelectorAll('[data-parity-style]')) {
    const original = t.getAttribute('data-parity-style');
    if (original) t.setAttribute('style', original); else t.removeAttribute('style');
    t.removeAttribute('data-parity-style');
  }
  document.querySelectorAll('[data-parity-rect]').forEach((d) => d.remove());
}
