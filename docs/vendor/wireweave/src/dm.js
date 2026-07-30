const GIFT_WRAP_KIND = 1059;

export class DM extends EventTarget {
    constructor({ relayPool, auth, nostrTools }) {
        super();
        if (!relayPool || !auth || !nostrTools) throw new Error('DM: deps required');
        if (!nostrTools.nip44) throw new Error('nostr-tools nip44 missing');
        if (!nostrTools.nip59) throw new Error('nostr-tools nip59 missing');
        this.pool = relayPool;
        this.auth = auth;
        this.NT = nostrTools;
        this.subId = null;
    }

    // NIP-17: send is a real kind:14 rumor, gift-wrapped (NIP-59) once per
    // recipient and once more for ourselves (self-copy), each wrap signed by
    // a fresh single-use random key so no relay observer can attribute the
    // wrap's outer envelope to either the sender or the recipient — only the
    // holder of the recipient's (or our own) private key can even see it's a
    // DM at all, let alone read it or learn who sent it.
    async send(peerPubkey, plaintext) {
        if (!this.auth.privkey) throw new Error('DM: privkey required (extension signing not supported for nip17)');
        const rumor = {
            kind: 14,
            created_at: Math.floor(Date.now() / 1000),
            tags: [['p', peerPubkey]],
            content: plaintext
        };
        const wrapForPeer = this.NT.nip59.wrapEvent(rumor, this.auth.privkey, peerPubkey);
        const wrapForSelf = this.NT.nip59.wrapEvent(rumor, this.auth.privkey, this.auth.pubkey);
        this.pool.publish(wrapForPeer);
        this.pool.publish(wrapForSelf);
        return wrapForPeer;
    }

    // Unwrap a gift-wrap (kind 1059) down to its rumor and return the
    // plaintext. Requires our own privkey — only the wrap's addressed
    // recipient (the 'p' tag on the outer event) can unwrap it.
    decrypt(wrap) {
        if (!this.auth.privkey) throw new Error('DM: privkey required (extension signing not supported for nip17)');
        const rumor = this.NT.nip59.unwrapEvent(wrap, this.auth.privkey);
        return rumor.content;
    }

    // Same as decrypt() but returns the full unwrapped rumor (sender pubkey,
    // created_at, tags) alongside the plaintext, for callers that need the
    // real (rumor-level) sender identity rather than the wrap's throwaway key.
    unwrap(wrap) {
        if (!this.auth.privkey) throw new Error('DM: privkey required (extension signing not supported for nip17)');
        return this.NT.nip59.unwrapEvent(wrap, this.auth.privkey);
    }

    subscribe(onMessage) {
        if (!this.auth.pubkey) throw new Error('DM: not authenticated');
        const subId = 'dm-' + this.auth.pubkey.slice(0, 16);
        this.subId = subId;
        this.pool.subscribe(subId, [
            { kinds: [GIFT_WRAP_KIND], '#p': [this.auth.pubkey] }
        ], (event) => {
            try {
                const rumor = this.unwrap(event);
                const peer = rumor.pubkey === this.auth.pubkey
                    ? (rumor.tags.find(t => t[0] === 'p')?.[1] || '')
                    : rumor.pubkey;
                onMessage({ event, rumor, plaintext: rumor.content, peer });
            } catch (e) {
                this._emit('error', { event, error: e.message });
            }
        });
        return subId;
    }

    unsubscribe() {
        if (this.subId) { this.pool.unsubscribe(this.subId); this.subId = null; }
    }

    _emit(type, detail) { this.dispatchEvent(new CustomEvent(type, { detail })); }
}

export const createDM = (opts) => new DM(opts);
