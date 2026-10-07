// Runs inside the live page. Measures what a user actually experiences.
const OPTS = globalThis.OPTS || { minContrast: 4.5, minTarget: 40 };

const sel = (el) => {
  if (!el || el.nodeType !== 1) return '';
  const cls = String(el.className || '').trim().split(/\s+/).slice(0, 2).join('.');
  return el.tagName.toLowerCase() + (el.id ? '#' + el.id : '') + (cls ? '.' + cls : '');
};
const visible = (el) => {
  const cs = getComputedStyle(el);
  if (cs.display === 'none' || cs.visibility === 'hidden' || cs.opacity === '0') return false;
  const r = el.getBoundingClientRect();
  return r.width > 0 && r.height > 0 && r.bottom > 0 && r.top < innerHeight && r.right > 0 && r.left < innerWidth;
};
const parseColor = (c) => {
  const m = String(c).match(/rgba?\(([\d.]+),\s*([\d.]+),\s*([\d.]+)(?:,\s*([\d.]+))?\)/);
  if (!m) return null;
  return { r: +m[1], g: +m[2], b: +m[3], a: m[4] === undefined ? 1 : +m[4] };
};
const lum = ({ r, g, b }) => {
  const f = (v) => {
    v /= 255;
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
};
const over = (fg, bg) => ({
  r: fg.r * fg.a + bg.r * (1 - fg.a),
  g: fg.g * fg.a + bg.g * (1 - fg.a),
  b: fg.b * fg.a + bg.b * (1 - fg.a),
  a: 1,
});
function effectiveBg(el) {
  let node = el;
  let acc = null;
  while (node && node !== document.documentElement.parentNode) {
    const c = parseColor(getComputedStyle(node).backgroundColor);
    if (c && c.a > 0) {
      acc = acc ? over(acc, c) : c;
      if (c.a >= 0.999) return acc;
    }
    node = node.parentElement;
  }
  const base = parseColor(getComputedStyle(document.documentElement).backgroundColor) || { r: 0, g: 0, b: 0, a: 1 };
  return acc ? over(acc, base) : base;
}
const contrast = (a, b) => {
  const l1 = lum(a), l2 = lum(b);
  return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
};

const items = {
  contrast: [],
  smallTarget: [],
  occluded: [],
  behindOpen: [],
  clipped: [],
  tinyText: [],
  unnamed: [],
  strayScroll: [],
  dupIds: [],
  overflowX: [],
  lowTappableGap: [],
  mouseOnly: [],
  longMeasure: [],
};

// ---- contrast + tiny text over every rendered text node owner
const textEls = [...document.querySelectorAll('body *')].filter((el) => {
  if (!visible(el)) return false;
  if (el.closest('.sr-only, [class*=sr-only]')) return false;
  const own = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim().length > 1);
  return own;
});
for (const el of textEls) {
  const cs = getComputedStyle(el);
  const fg = parseColor(cs.color);
  const bg = effectiveBg(el);
  if (!fg) continue;
  const text = el.textContent.trim().slice(0, 40);
  const size = parseFloat(cs.fontSize);
  const weight = parseInt(cs.fontWeight, 10) || 400;
  const large = size >= 24 || (size >= 18.66 && weight >= 700);
  const need = large ? 3 : OPTS.minContrast;
  const ratio = contrast(over(fg, bg), bg);
  if (ratio < need) {
    items.contrast.push({ el: sel(el), text, ratio: +ratio.toFixed(2), need, size, weight, color: cs.color });
  }
  if (size < 11.5) items.tinyText.push({ el: sel(el), text, size, ratio: +ratio.toFixed(2) });
}

// ---- interactive elements: size, occlusion, accessible name
// A 1x1 clipped file input behind a styled button is the canonical upload
// affordance, not a target a user can miss.
const isHiddenInput = (el) =>
  el.tagName === 'INPUT' && (el.classList.contains('hidden-input') || (el.getBoundingClientRect().width <= 2 && el.getBoundingClientRect().height <= 2));

// A visible modal's scrim is *supposed* to block what is behind it; only count
// occlusion when the blocker is not the scrim of a surface the target sits outside.
const openSurface = [...document.querySelectorAll('[role=dialog], [role=alertdialog], [aria-modal=true]')].find(visible);
const isScrim = (el) => /backdrop|scrim|overlay|ov-modal|vx-modal/.test(String(el.className || ''));
const isToast = (el) => /toast/.test(String(el.className || ''));
const isChrome = (el) => {
  const cs = getComputedStyle(el);
  return cs.position === 'fixed' || cs.position === 'sticky' || el.closest('.app-topbar, .cm-mobile-header, .cm-user-panel') != null;
};
const inScroller = (el) => {
  for (let n = el.parentElement; n; n = n.parentElement) {
    const o = getComputedStyle(n).overflowY;
    if (o === 'auto' || o === 'scroll') return true;
  }
  return false;
};
// A control inside a scroller that has been scrolled past its own scrollport is
// out of view, not covered: elementFromPoint there returns whatever sits at that
// screen coordinate (the composer, the topbar), which reads as occlusion.
const scrolledOutOfView = (el, cx, cy) => {
  for (let n = el.parentElement; n; n = n.parentElement) {
    const o = getComputedStyle(n).overflowY;
    if (o !== 'auto' && o !== 'scroll') continue;
    const b = n.getBoundingClientRect();
    if (cx < b.left - 1 || cx > b.right + 1 || cy < b.top - 1 || cy > b.bottom + 1) return true;
    break;
  }
  return false;
};
// Hover/focus-revealed chrome (opacity 0 until the row is hovered) is not yet
// shown to anyone, so what sits over it now says nothing about reachability.
const hiddenUntilHover = (el) => {
  for (let n = el; n && n !== document.body; n = n.parentElement) {
    const cs = getComputedStyle(n);
    if (parseFloat(cs.opacity) === 0 || cs.pointerEvents === 'none') return true;
  }
  return false;
};
// An open drawer or popover covering the page behind it is what opening it
// means, so those go in their own bucket rather than counting as occlusion.
const openAncestorOf = (el) => el.closest('.open, [aria-expanded=true]');

const INTERACTIVE = 'button, a[href], input, select, textarea, [role=button], [role=tab], [role=menuitem], [tabindex]:not([tabindex="-1"])';
const interactive = [...document.querySelectorAll(INTERACTIVE)].filter((el) => visible(el) && !isHiddenInput(el));
// Text-entry fields are not tap targets in the sense 2.5.8 is about.
const isTextEntry = (el) =>
  (el.tagName === 'INPUT' && !['checkbox', 'radio', 'range', 'color', 'file', 'button', 'submit'].includes((el.type || 'text').toLowerCase())) ||
  el.tagName === 'TEXTAREA';
for (const el of interactive) {
  const r = el.getBoundingClientRect();
  const cs = getComputedStyle(el);
  const label = (el.getAttribute('aria-label') || el.textContent || '').trim();
  const labelledBy = el.getAttribute('aria-labelledby');
  const title = el.getAttribute('title');
  const isIconOnly = !label && el.querySelector('svg, img');
  const forLabel = el.id ? document.querySelector(`label[for="${CSS.escape(el.id)}"]`) : null;
  const wrapped = el.closest('label');
  if (!label && !labelledBy && !title && !forLabel && !wrapped && !el.getAttribute('aria-hidden')) {
    items.unnamed.push({ el: sel(el), reason: isIconOnly ? 'icon-only, no name' : 'no accessible name', rect: [Math.round(r.width), Math.round(r.height)] });
  }
  const box = el.closest('label') || (el.id ? document.querySelector(`label[for="${CSS.escape(el.id)}"]`) : null) || el;
  const br = box.getBoundingClientRect();
  const tapRow = el.closest('.ov-set-row, .ov-set-row-tap');
  if (!isTextEntry(el) && (br.width < OPTS.minTarget || br.height < OPTS.minTarget)) {
    const row = tapRow && tapRow.contains(el) ? tapRow.getBoundingClientRect() : null;
    items.smallTarget.push({
      el: sel(el), label: label.slice(0, 24),
      size: [Math.round(br.width), Math.round(br.height)], min: OPTS.minTarget,
      rowTap: row ? [Math.round(row.width), Math.round(row.height)] : null,
    });
  }
  const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
  if (cx > 0 && cy > 0 && cx < innerWidth && cy < innerHeight && !scrolledOutOfView(el, cx, cy) && !hiddenUntilHover(el)) {
    const hit = document.elementFromPoint(cx, cy);
    if (hit && !isHiddenInput(hit) && !el.contains(hit) && !hit.contains(el) && hit !== el) {
      const hcs = getComputedStyle(hit);
      const behindScrim = (isScrim(hit) || isToast(hit)) && !openSurface?.contains(el);
      const behindSurface = openSurface && !openSurface.contains(el) && (hit === openSurface || openSurface.contains(hit));
      const scrolledUnderChrome = isChrome(hit) && inScroller(el);
      const openHit = openAncestorOf(hit);
      const behindOpen = openHit && !openHit.contains(el);
      if (hcs.pointerEvents !== 'none' && !behindScrim && !behindSurface && !scrolledUnderChrome) {
        if (behindOpen) items.behindOpen.push({ el: sel(el), label: label.slice(0, 24), blockedBy: sel(hit) });
        else items.occluded.push({ el: sel(el), label: label.slice(0, 24), blockedBy: sel(hit), at: [Math.round(cx), Math.round(cy)] });
      }
    }
  }
}

// ---- clickable-looking things that are not keyboard reachable
for (const el of document.querySelectorAll('body *')) {
  if (!visible(el) || isHiddenInput(el)) continue;
  const cs = getComputedStyle(el);
  if (cs.cursor !== 'pointer') continue;
  if (interactive.includes(el) || el.closest('button, a[href], [role=button], [role=tab], [role=menuitem]')) continue;
  const role = el.getAttribute('role');
  const ti = el.getAttribute('tabindex');
  const nativelyFocusable = /^(BUTTON|A|INPUT|SELECT|TEXTAREA|SUMMARY)$/.test(el.tagName);
  const keyboardReachable = nativelyFocusable || (ti !== null && +ti >= 0) || (role && ['button', 'link', 'tab', 'menuitem', 'option', 'checkbox', 'switch'].includes(role));
  if (!keyboardReachable) {
    items.mouseOnly.push({ el: sel(el), text: el.textContent.trim().slice(0, 30), role, tabindex: ti });
  }
}

// ---- line length: a measure past ~90 characters is hard to read
for (const el of textEls) {
  const t = el.textContent.trim();
  if (t.length < 90) continue;
  const r = el.getBoundingClientRect();
  if (r.width < 200) continue;
  const size = parseFloat(getComputedStyle(el).fontSize) || 16;
  const perChar = size * 0.5;
  const chars = r.width / perChar;
  if (chars > 95) items.longMeasure.push({ el: sel(el), approxChars: Math.round(chars), width: Math.round(r.width), size });
}

// ---- clipped text (overflow hidden with content wider/taller than the box)
for (const el of textEls) {
  const cs = getComputedStyle(el);
  if (cs.overflow === 'visible' && cs.overflowX === 'visible' && cs.overflowY === 'visible') continue;
  if (cs.textOverflow === 'ellipsis') continue;
  const clipped = el.scrollWidth > el.clientWidth + 1 || el.scrollHeight > el.clientHeight + 1;
  if (clipped && cs.overflowY !== 'auto' && cs.overflowY !== 'scroll') {
    items.clipped.push({ el: sel(el), text: el.textContent.trim().slice(0, 30), sw: el.scrollWidth, cw: el.clientWidth, sh: el.scrollHeight, ch: el.clientHeight });
  }
}

// ---- stray scroll containers: scrollable but no affordance and not the message list
for (const el of document.querySelectorAll('body *')) {
  if (!visible(el)) continue;
  const cs = getComputedStyle(el);
  const scrollsY = el.scrollHeight > el.clientHeight + 2 && /auto|scroll/.test(cs.overflowY);
  const scrollsX = el.scrollWidth > el.clientWidth + 2 && /auto|scroll/.test(cs.overflowX);
  if (scrollsX) items.strayScroll.push({ el: sel(el), axis: 'x', sw: el.scrollWidth, cw: el.clientWidth });
  else if (scrollsY && !el.closest('[class*=chat], [class*=thread], [class*=rail], [class*=list], [class*=panel], [class*=modal]')) {
    items.strayScroll.push({ el: sel(el), axis: 'y', sh: el.scrollHeight, ch: el.clientHeight });
  }
}

// ---- duplicate ids
const seen = new Map();
for (const el of document.querySelectorAll('[id]')) seen.set(el.id, (seen.get(el.id) || 0) + 1);
for (const [id, n] of seen) if (n > 1) items.dupIds.push({ id, count: n });

// ---- document-level overflow
if (document.documentElement.scrollWidth > innerWidth + 1) {
  items.overflowX.push({ scrollWidth: document.documentElement.scrollWidth, innerWidth });
}
if (document.body.scrollHeight > innerHeight + 1 && getComputedStyle(document.body).overflow === 'visible') {
  items.overflowX.push({ bodyScrollHeight: document.body.scrollHeight, innerHeight });
}

// ---- tappable neighbours closer than 8px apart vertically in the same row band
const taps = interactive.map((el) => ({ el, r: el.getBoundingClientRect() })).filter((t) => t.r.width > 8 && t.r.height > 8);
for (let i = 0; i < taps.length; i++) {
  for (let j = i + 1; j < taps.length; j++) {
    const a = taps[i].r, b = taps[j].r;
    if (taps[i].el.contains(taps[j].el) || taps[j].el.contains(taps[i].el)) continue;
    // Only where it bites: two targets that are both under the comfortable
    // 44px size and sit closer than 8px, so a mis-aim hits the wrong one.
    if (Math.max(a.width, a.height) >= 44 || Math.max(b.width, b.height) >= 44) continue;
    const overlapX = Math.min(a.right, b.right) - Math.max(a.left, b.left);
    const overlapY = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
    if (overlapX > 0 && overlapY > 0) continue;
    const gap = Math.max(Math.max(a.left, b.left) - Math.min(a.right, b.right), Math.max(a.top, b.top) - Math.min(a.bottom, b.bottom));
    if (gap > -0.5 && gap < 8) {
      items.lowTappableGap.push({ a: sel(taps[i].el), b: sel(taps[j].el), gap: +gap.toFixed(1) });
    }
  }
}

const counts = {};
for (const [k, v] of Object.entries(items)) counts[k] = v.length;
return { counts, items };
