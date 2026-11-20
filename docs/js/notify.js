let pingCtx = null;

const escapeRe = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export const mentionsName = (text, name) => {
    if (!name) return false;
    return new RegExp('(^|\\s)@' + escapeRe(name) + '(?![\\w.-])', 'i').test(String(text || ''));
};

export const shouldPing = ({ text, fromSelf, soundOn, mentionsOnly, name }) => {
    if (fromSelf || !soundOn) return false;
    return !mentionsOnly || mentionsName(text, name);
};

export const playPing = () => {
    if (typeof AudioContext === 'undefined') return;
    pingCtx = pingCtx || new AudioContext();
    const t = pingCtx.currentTime;
    const osc = pingCtx.createOscillator();
    const gain = pingCtx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(880, t);
    osc.frequency.exponentialRampToValueAtTime(660, t + 0.12);
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(0.15, t + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.18);
    osc.connect(gain).connect(pingCtx.destination);
    osc.start(t);
    osc.stop(t + 0.2);
};
