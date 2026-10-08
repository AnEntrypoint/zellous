# NIP-07 signer as an alternative to the plaintext nsec in localStorage

Status: feasibility note. No code was changed. wireweave was described, not edited.

## Verdict

NIP-07 is feasible with no protocol change. Nostr events, relays, kinds, NIP-44 and NIP-59 are already the wire protocol; NIP-07 only changes where the secret key lives and who produces the Schnorr signature. Nothing on the wire changes.

Most of the signer plumbing already exists. The app has an extension login path today, and wireweave's `sign()` already falls through to an injected extension when no private key is held. The remaining work is:

1. make the extension path the default and stop writing the raw key to localStorage,
2. make NIP-17 direct messages work without a private key (they currently throw for extension users),
3. fix a few correctness gaps in the extension login path (late-injected extension, silent key deletion on switch, no signature/pubkey check).

Mobile browsers have no NIP-07 extension. Removing the nsec path therefore locks those users out unless a remote signer (NIP-46) or the local-key mode is kept. That is a product decision, not a technical blocker.

## Evidence from the code

Paths: wireweave is `/config/workspace/wireweave/src`; zellous is `/config/workspace/zellous/docs`.

| Concern | Location | What it does today |
|---|---|---|
| Constructor accepts an injected signer | `wireweave/src/auth.js:11,16` | `constructor({ nostrTools, storage, extension })`, stored as `this.extension`. |
| Extension login | `wireweave/src/auth.js:58-68` | `loginWithExtension()` calls `extension.getPublicKey()`, sets `privkey = null`, deletes `zn_sk` and `zn_pk` from storage, emits `login`. The returned pubkey is not format-checked. |
| Sign with key or extension | `wireweave/src/auth.js:70-74` | `sign()` uses `finalizeEvent` if `privkey` is set, else `extension.signEvent(template)`. |
| Raw key persistence | `wireweave/src/auth.js:24-25,102-112` | `zn_sk` is the secret as hex, stored in plaintext in localStorage (`safeSetItem`). |
| Extension is captured once at boot | `wireweave/src/wireweave.js:27,38` | `extension = window.nostr` default, passed to `createAuth`. |
| Zellous passes it at boot | `zellous/docs/js/wireweave-bridge.js:26` | `extension: window.nostr`, read once when the module runs. |
| Login button | `zellous/docs/nostr-chat/index.html:153` | "Use Extension (NIP-07)" button, `#connectExtensionBtn`. |
| Login handler (legacy) | `zellous/docs/js/wireweave-bridge.js:175` | Checks `window.nostr` live, then calls `window.auth.loginWithExtension()`. |
| Login handler (SDK adapter) | `zellous/docs/js/nostr-adapter.js:479-492` | `authExtension` checks `window.nostr` live, then calls `loginWithExtension()`. |
| Extension state in zellous | `zellous/docs/js/wireweave-bridge.js:119` | `loginWithExtension` sets `state.nostrPrivkey = null`. Other code writes `nostrPrivkey` (lines 108, 117, 118, 132) but nothing reads it. |
| Key export | `wireweave/src/auth.js:97-100`, `zellous/docs/js/nostr-channels-ui.js:465-490` | `nsecEncode()` returns null for extension users, so the "Back up key (nsec)" menu (`nostr-adapter.js:183-184`) and the backup modal are gated correctly. |
| NIP-17 DMs need the raw key | `wireweave/src/dm.js:16,23-24,31-32,37-38` | `send`, `decrypt` and `unwrap` throw `DM: privkey required (extension signing not supported for nip17)` when `privkey` is null. Wrapping calls `nostrTools.nip59.wrapEvent(rumor, privkey, ...)` synchronously. |
| Other signing call sites | `grep '.sign('` over `wireweave/src` | About 25 call sites (`chat`, `bans`, `roles`, `servers`, `pages`, `settings`, `voice`, `media` NIP-98, `forum`, `reactions`, `profile`, `mutes`, `feedback`) all call `auth.sign(...)`. These already work with an extension. |
| No NIP-44 or NIP-04 use outside DM | grep over `wireweave/src` | `nip44` appears only in `dm.js:7`. No NIP-04 use. |

Not witnessed live. Every row above comes from reading the code and grep output. No browser run was done for this note, and no NIP-07 extension was present in any browser profile.

## Does auth accept an injected signer today?

Yes, for signing. `createWireweave({ extension })` injects a NIP-07-shaped object (`getPublicKey`, `signEvent`), and `sign()` uses it when no key is held. The zellous extension button already exercises this. The gaps are listed below.

Gaps in the current extension path, with evidence:

- Late injection. `wireweave.js:27` and `wireweave-bridge.js:26` capture `window.nostr` once at module load. The button handler checks `window.nostr` live (`nostr-adapter.js:483`, `wireweave-bridge.js:175`), so if an extension injects after boot the guard passes but `auth.extension` is still null and `loginWithExtension` throws `No extension provided` (`auth.js:59`). Not witnessed; a mismatch found by reading.
- Silent key deletion. `loginWithExtension` removes `zn_sk` (`auth.js:64`) with no backup prompt. A user who had only a local nsec and then clicks the extension button loses that key from storage. Evidence: `auth.js:64-65`.
- No persistence for extension users. Only `zn_pk` could be kept, but `loginWithExtension` removes it too (`auth.js:65`). Every reload is a logged-out state until the button is pressed again.
- No check on what the extension returns. `loginWithExtension` does not check that the pubkey is 64 hex characters (`auth.js:60-61`). `sign()` does not check that the returned event's `pubkey` equals `this.pubkey` or that the signature verifies (`auth.js:72`). A wrong or swapped extension would only be caught later by relays.
- DMs. `dm.js` throws for every extension user, so a NIP-07 login cannot send or read NIP-17 messages.
- Dead state. `state.nostrPrivkey` is written in four places in `wireweave-bridge.js` and never read. It is a second in-memory copy of the secret for local-key users.

## Required change in wireweave (describe only, do not edit)

Repo: `AnEntrypoint/wireweave`, consumed by zellous from jsdelivr `@main`. Changes ship by pushing to `main`; jsdelivr caching means roughly 12-24h unless purged.

1. `src/auth.js`
   - `loginWithExtension()`: validate the returned pubkey (`/^[0-9a-f]{64}$/`). Optionally persist only `zn_pk` plus a `zn_signer = 'nip07'` marker, so a reload can call `getPublicKey()` again without deleting data.
   - `sign()`: when using the extension, check `signed.pubkey === this.pubkey` and `nostrTools.verifyEvent(signed)`. Reject mismatches.
   - Add a signer abstraction, for example `this.signer = { kind: 'local' | 'nip07', ... }`, with `signEvent`, `nip44Encrypt(peer, text)`, `nip44Decrypt(peer, text)`. The local kind wraps `finalizeEvent` and `nip44.v2`. The nip07 kind delegates to `extension.signEvent`, `extension.nip44.encrypt` and `extension.nip44.decrypt`. NIP-07 marks `nip44` as optional, so check it exists and fail with a clear error if not.
   - Let `loginWithExtension` accept or re-resolve the extension at call time (for example `extension: () => window.nostr`, or an argument to `loginWithExtension(ext)`), so late injection works.
   - Do not delete `zn_sk` on extension login. Let the caller decide, and never discard a local key silently.
2. `src/dm.js`
   - Add an async NIP-17 path that works through the signer. The current `nostrTools.nip59` helpers are synchronous and need a raw key, so they cannot be reused as-is.
   - Send: build the unsigned kind 14 rumor; encrypt it with `nip44Encrypt(peer, JSON)` to get the content of kind 13 (seal); sign the seal with `signer.signEvent` (signed by the user key); wrap the seal in kind 1059 (gift wrap) signed with a fresh ephemeral key, `p`-tagged to the peer. Repeat for the self copy.
   - Decrypt: gift-wrap content is NIP-44 encrypted by the ephemeral key, so decrypt with the user's signer; then decrypt the seal with `nip44Decrypt(seal.pubkey, ...)`; verify the seal signature; check `rumor.pubkey === seal.pubkey`.
   - Keep the local-key path on the existing `nip59` helpers or on the same new code.
   - No protocol change: NIP-17/44/59 are unchanged; only who holds the key changes.
3. `src/wireweave.js`: pass a late-bound extension getter, not a snapshot.

## Required change in zellous (describe only)

1. `docs/js/wireweave-bridge.js:26` change `extension: window.nostr` to a late-bound getter. Line 119: `loginWithExtension` should set only the pubkey, and the `nostrPrivkey` write should go.
2. `docs/js/nostr-adapter.js:479-492` (`authExtension`): keep the live `window.nostr` check, but pass the signer to wireweave instead of relying on the boot-time capture.
3. `docs/js/wireweave-bridge.js` (around line 117-119, 132) and `state.js`: remove `state.nostrPrivkey` writes. Nothing reads them.
4. `docs/nostr-chat/index.html:150-160` (auth modal): make "Use Extension (NIP-07)" the primary action when `window.nostr` is present. Keep nsec generate and import as a clearly labelled local-key mode. Before switching from a local key to an extension, show a confirm that warns the local key will be removed unless backed up (replaces the silent delete).
5. `docs/js/wireweave-bridge.js:87-98` (`generateKeyWithConfirm`) and `docs/js/ui.js:110-131` (backup prompt): skip the backup prompt for extension users, since they have no key to back up.
6. DM surface: when the signer has no `nip44`, show a clear message instead of a raw `DM: privkey required` error.
7. Keep `nostr-channels-ui.js` key backup and the `nsecEncode()` gating. They already return nothing for extension users.

No `window.X` globals are needed outside `docs/js/wireweave-bridge.js`, which is the only permitted place. No test files, no mock signer, no fallback mode, and no edits under `docs/vendor`.

## Security trade-offs

Gains:

- The long-lived secret is no longer in localStorage. Today any script that runs in the origin (an XSS, a malicious browser extension with page access, a compromised CDN script) can read `zn_sk` in one call and keep the identity forever. With NIP-07 it cannot exfiltrate the key.
- The key is held by a dedicated extension with its own permission prompts and lock screen.

Costs and new risks:

- A signing oracle replaces key theft. Any script in the page can call `window.nostr.signEvent` and `nip44.decrypt`. Many extensions remember per-site, per-kind permissions, so an XSS can publish events as the user (deletions, role or ban events, page HTML) and decrypt incoming DMs without the user noticing. Mitigations: the app requests only the kinds it needs; keep XSS sinks escaped (already done: `escHtml`, DOMPurify, text nodes per the AGENTS.md audit); a CSP would reduce this, but the note in AGENTS.md says the inline boot scripts make a CSP expensive to add.
- Nothing is recoverable in-app for extension users. Losing the extension or its seed means losing the identity. Users must be told this at login.
- A malicious or buggy extension holds the key by design. The app cannot detect it, so signature and pubkey checks only catch inconsistency, not theft.
- Extension replacement. `window.nostr` is a global that any later extension can overwrite. Pinning the expected pubkey in `zn_pk` and checking it on every sign detects a swap.
- Mobile. Mobile browsers generally have no NIP-07 extension. Removing the nsec path makes them unable to sign in. Options: keep the local-key mode as a supported (not fallback) path, or add NIP-46 remote signing later. The repo already contains a `nostrConnectView` in `index.html`, which is a starting point for NIP-46.
- Silent key deletion on switch (`auth.js:64`) is an existing data-loss risk regardless of NIP-07. Fixing it is independent.

## Minimal ordered implementation plan

1. Fix the existing extension login correctness gaps first, with no new behaviour: late-bound extension getter (wireweave `wireweave.js:27`, zellous `wireweave-bridge.js:26`), pubkey format check, signature and pubkey check in `sign()`, and no silent deletion of `zn_sk` on switch (ask the user to confirm first).
2. Remove the dead `state.nostrPrivkey` writes in zellous.
3. Add the signer abstraction in wireweave `auth.js` (local and nip07 kinds), with `nip44` delegation for the nip07 kind.
4. Rewrite NIP-17 send/decrypt in wireweave `dm.js` as async and signer-based. Keep the local-key path working.
5. Persist only `zn_pk` plus a signer marker for extension users, so reloads resume without the button.
6. Update the zellous auth modal: extension first, local key as an explicit mode, confirm before switching, backup prompt only for local keys, clear message when DMs are unavailable.
7. Push wireweave to `main`. Use a commit SHA in the importmap during rollout if an immediate pin is needed (AGENTS.md documents this option). Purge the jsdelivr path if the fix must land fast.
8. Validate live with the repo's own scripts, `node scripts/drive.mjs` and `node scripts/witness.mjs`, against the CDN path. Live witnessing of the extension flow requires a real NIP-07 extension installed in the browser profile. The repo scripts cannot install one, so this step needs a profile that already has an extension. Without that, only the non-extension paths and the code-level checks are witnessed.

## Open questions for the user

- Keep the local-key mode for mobile users, or require an extension (or NIP-46) for sign-in?
- Accept the signing-oracle risk of an XSS, or add a stronger CSP as a prerequisite?
