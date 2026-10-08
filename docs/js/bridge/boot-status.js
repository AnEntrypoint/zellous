export async function loadProtocol() {
  try {
    return await import('wireweave');
  } catch (e) {
    console.error('wireweave load failed', e);
    window.__boot?.fail('Could not load the protocol layer (wireweave unreachable). Check your connection and reload.');
    throw e;
  }
}

export function announceReady() {
  document.dispatchEvent(new CustomEvent('wireweave:ready'));
}
