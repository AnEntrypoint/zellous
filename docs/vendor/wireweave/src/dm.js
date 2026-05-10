export class DM extends EventTarget {
    constructor({ relayPool, auth, nostrTools }) {
        super();
        if (!relayPool || !auth || !nostrTools) throw new Error('DM: deps required');
        if (!nostrTools.nip44) throw new Error('nostr-tools nip44 missing');
        this.pool = relayPool;
        this.auth = auth;
        this.NT = nostrTools;
        this.subId = null;
    }

    _convKey(peerPubkey) {
        if (!this.auth.privkey) throw new Error('DM: privkey required (extension signing not supported for nip44)');
        return this.NT.nip44.v2.utils.getConversationKey
            ? this.NT.nip44.v2.utils.getConversationKey(this.auth.privkey, peerPubkey)
            : this.NT.nip44.getConversationKey(this.auth.privkey, peerPubkey);
    }

    async send(peerPubkey, plaintext) {
        const key = this._convKey(peerPubkey);
        const ciphertext = this.NT.nip44.v2.encrypt(plaintext, key);
        const signed = await this.auth.sign({
            kind: 14,
            created_at: Math.floor(Date.now() / 1000),
            tags: [['p', peerPubkey]],
            content: ciphertext
        });
        this.pool.publish(signed);
        return signed;
    }

    decrypt(event) {
        const peer = event.pubkey === this.auth.pubkey
            ? (event.tags.find(t => t[0] === 'p')?.[1] || '')
            : event.pubkey;
        if (!peer) throw new Error('DM: cannot resolve peer');
        const key = this._convKey(peer);
        return this.NT.nip44.v2.decrypt(event.content, key);
    }

    subscribe(onMessage) {
        if (!this.auth.pubkey) throw new Error('DM: not authenticated');
        const subId = 'dm-' + this.auth.pubkey.slice(0, 16);
        this.subId = subId;
        this.pool.subscribe(subId, [
            { kinds: [14], '#p': [this.auth.pubkey] },
            { kinds: [14], authors: [this.auth.pubkey] }
        ], (event) => {
            try {
                const plaintext = this.decrypt(event);
                onMessage({ event, plaintext, peer: event.pubkey === this.auth.pubkey
                    ? (event.tags.find(t => t[0] === 'p')?.[1] || '')
                    : event.pubkey });
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
