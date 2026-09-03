// MTU-aware binary framing for unreliable/unordered WebRTC data channels.
//
// A real RTCDataChannel message has a practical ~16KB limit before browsers
// start doing their own internal SCTP fragmentation with inconsistent
// cross-browser behavior at larger sizes — see MTU_DEFAULT below. Large
// binary payloads (game snapshots, file chunks) are split here into
// framed fragments that each fit under a configurable MTU, sent
// independently over an unordered/unreliable channel, and reassembled by
// (peer, messageId) on the receiving side.
//
// Wire format per fragment (fixed 11-byte header, little-endian):
//   byte 0      : version/magic (0xF7)
//   bytes 1-2   : messageId   (uint16)
//   bytes 3-4   : fragmentIndex (uint16, 0-based)
//   bytes 5-6   : fragmentCount (uint16, total fragments for this message)
//   bytes 7-10  : totalPayloadLength (uint32, full reassembled byte length)
//   bytes 11+   : fragment payload bytes
//
// fragmentCount is a uint16, so a message can have at most 65535 fragments —
// maxPayloadBytes() below enforces that bound at fragmentation time rather
// than silently overflowing the header field.

const MAGIC = 0xf7;
const HEADER_BYTES = 11;

// ~16KB is the safe practical default across current browsers before
// RTCDataChannel's own internal fragmentation gets inconsistent
// cross-browser (Chrome and Firefox both technically allow larger single
// messages, but behavior at the edges has historically differed). Leave
// headroom under 16384 for the frame header itself and any SCTP/DTLS
// overhead the transport adds on top.
export const MTU_DEFAULT = 16000;

// fragmentCount is a uint16 field — this is a hard wire-format ceiling, not
// a tunable. A caller handing over a payload requiring more fragments than
// this at the configured MTU gets a clear error instead of a silently
// wrapped/truncated header field.
export const MAX_FRAGMENTS = 0xffff;

export const maxPayloadBytes = (mtu = MTU_DEFAULT) => {
  const perFragment = mtu - HEADER_BYTES;
  return perFragment * MAX_FRAGMENTS;
};

const toUint8 = (payload) => {
  if (payload instanceof Uint8Array) return payload;
  if (payload instanceof ArrayBuffer) return new Uint8Array(payload);
  if (ArrayBuffer.isView(payload)) return new Uint8Array(payload.buffer, payload.byteOffset, payload.byteLength);
  throw new Error('frame: payload must be an ArrayBuffer or a TypedArray');
};

export const encodeHeader = ({ messageId, fragmentIndex, fragmentCount, totalPayloadLength }) => {
  const buf = new ArrayBuffer(HEADER_BYTES);
  const dv = new DataView(buf);
  dv.setUint8(0, MAGIC);
  dv.setUint16(1, messageId, true);
  dv.setUint16(3, fragmentIndex, true);
  dv.setUint16(5, fragmentCount, true);
  dv.setUint32(7, totalPayloadLength, true);
  return buf;
};

// Returns null (not a throw) on a header that doesn't parse as this frame
// format — the caller decides whether that's a protocol violation or just
// stray traffic on the same channel to ignore.
export const decodeHeader = (bytes) => {
  const u8 = toUint8(bytes);
  if (u8.byteLength < HEADER_BYTES) return null;
  const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
  if (dv.getUint8(0) !== MAGIC) return null;
  return {
    messageId: dv.getUint16(1, true),
    fragmentIndex: dv.getUint16(3, true),
    fragmentCount: dv.getUint16(5, true),
    totalPayloadLength: dv.getUint32(7, true)
  };
};

// Splits `payload` into an array of ArrayBuffers, each a complete wire
// fragment (header + slice), ready to hand to dc.send() one at a time.
// A zero-length payload still produces exactly one (header-only) fragment,
// so fragmentCount is always >= 1 and the reassembler never waits forever
// on a message that legitimately has zero fragments.
export const fragment = (payload, { messageId, mtu = MTU_DEFAULT }) => {
  if (mtu <= HEADER_BYTES) throw new Error('frame: mtu must be greater than the ' + HEADER_BYTES + '-byte header');
  const u8 = toUint8(payload);
  const totalPayloadLength = u8.byteLength;
  const perFragment = mtu - HEADER_BYTES;
  const fragmentCount = Math.max(1, Math.ceil(totalPayloadLength / perFragment));
  if (fragmentCount > MAX_FRAGMENTS) {
    throw new Error('frame: payload of ' + totalPayloadLength + ' bytes needs ' + fragmentCount +
      ' fragments at mtu=' + mtu + ', exceeding the ' + MAX_FRAGMENTS + '-fragment wire-format ceiling ' +
      '(max ' + maxPayloadBytes(mtu) + ' bytes at this mtu)');
  }
  const out = new Array(fragmentCount);
  for (let i = 0; i < fragmentCount; i++) {
    const start = i * perFragment;
    const end = Math.min(start + perFragment, totalPayloadLength);
    const slice = u8.subarray(start, end);
    const frameBuf = new ArrayBuffer(HEADER_BYTES + slice.byteLength);
    new Uint8Array(frameBuf, 0, HEADER_BYTES).set(new Uint8Array(encodeHeader({
      messageId, fragmentIndex: i, fragmentCount, totalPayloadLength
    })));
    new Uint8Array(frameBuf, HEADER_BYTES).set(slice);
    out[i] = frameBuf;
  }
  return out;
};

const DEFAULT_STALE_MS = 10000;
const DEFAULT_MAX_IN_FLIGHT = 256;

// Reassembles fragments arriving in ANY order (unordered/unreliable channel)
// keyed by messageId. Call feed() per incoming fragment; it returns the
// reassembled Uint8Array once every fragment for that messageId has
// arrived, or null while still incomplete. Incomplete sets older than
// staleMs are evicted so a permanently-dropped fragment (real risk on an
// unreliable channel) never leaks memory forever. A hard cap on concurrent
// in-flight messageIds (evict-oldest) bounds memory even against a
// misbehaving/adversarial sender that never completes a message.
export class Reassembler {
  constructor({ staleMs = DEFAULT_STALE_MS, maxInFlight = DEFAULT_MAX_IN_FLIGHT } = {}) {
    this.staleMs = staleMs;
    this.maxInFlight = maxInFlight;
    this.sets = new Map(); // messageId -> { fragmentCount, totalPayloadLength, parts: Map<index, Uint8Array>, received, lastSeen }
  }

  // Sweeps stale incomplete sets. Called lazily on every feed() so no timer
  // is required, but can also be called on an interval by a host that wants
  // eviction to happen even when no new traffic arrives.
  sweep(now = Date.now()) {
    let evicted = 0;
    for (const [id, set] of this.sets) {
      if (now - set.lastSeen > this.staleMs) { this.sets.delete(id); evicted++; }
    }
    return evicted;
  }

  _evictOldestIfOverCap() {
    if (this.sets.size <= this.maxInFlight) return;
    let oldestId = null, oldestTs = Infinity;
    for (const [id, set] of this.sets) {
      if (set.lastSeen < oldestTs) { oldestTs = set.lastSeen; oldestId = id; }
    }
    if (oldestId !== null) this.sets.delete(oldestId);
  }

  // Returns the reassembled Uint8Array once complete, else null. Duplicate
  // fragment delivery (real risk on an unreliable channel that retransmits,
  // or an app-level resend) is idempotent — re-feeding an already-seen
  // (messageId, fragmentIndex) pair does not double-count toward
  // completion. Malformed/out-of-range headers are dropped, not thrown.
  feed(rawFragment) {
    const now = Date.now();
    this.sweep(now);
    const u8 = toUint8(rawFragment);
    const header = decodeHeader(u8);
    if (!header) return null;
    const { messageId, fragmentIndex, fragmentCount, totalPayloadLength } = header;
    if (fragmentCount < 1 || fragmentIndex >= fragmentCount) return null;

    let set = this.sets.get(messageId);
    if (!set) {
      set = { fragmentCount, totalPayloadLength, parts: new Map(), received: 0, lastSeen: now };
      this.sets.set(messageId, set);
      this._evictOldestIfOverCap();
    } else if (set.fragmentCount !== fragmentCount || set.totalPayloadLength !== totalPayloadLength) {
      // Header disagrees with the in-flight set for this messageId (e.g. a
      // wrapped-around id reused before the old set went stale) — start
      // fresh rather than corrupt the old set's reassembly.
      set = { fragmentCount, totalPayloadLength, parts: new Map(), received: 0, lastSeen: now };
      this.sets.set(messageId, set);
    }

    set.lastSeen = now;
    if (!set.parts.has(fragmentIndex)) {
      set.parts.set(fragmentIndex, u8.subarray(HEADER_BYTES));
      set.received++;
    }

    if (set.received < set.fragmentCount) return null;

    const out = new Uint8Array(set.totalPayloadLength);
    let offset = 0;
    for (let i = 0; i < set.fragmentCount; i++) {
      const part = set.parts.get(i);
      out.set(part, offset);
      offset += part.byteLength;
    }
    this.sets.delete(messageId);
    return out;
  }

  // Introspection for debugging/verification — number of messageIds
  // currently buffered incomplete, never permanently growing on a healthy
  // sweep cadence.
  pendingCount() { return this.sets.size; }
  has(messageId) { return this.sets.has(messageId); }
}

export const createReassembler = (opts) => new Reassembler(opts);
export { HEADER_BYTES };
