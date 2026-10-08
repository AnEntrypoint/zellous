export const toastErr = (label, e) => window.ui && window.ui.showToast && window.ui.showToast(label + ' failed: ' + ((e && e.message) || 'unknown'), 3000, 'error');

export const call = (fn, label) => {
  try {
    const r = fn && fn();
    if (r && typeof r.catch === 'function') return r.catch((e) => { toastErr(label || 'Action failed', e); });
    return r;
  } catch (e) { toastErr(label || 'Action failed', e); }
};
