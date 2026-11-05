# Next step

Phase: AGENTSMD
Updated: 1791526779638

---

# ORCHESTRATOR

YOU are the state machine. Plugkit: synchronous lib serving this prose; advance = your dispatch, not its action. Holds phase/PRD/mutables on disk -- read via `phase-status`/`instruction`, change via the relevant verb. Nothing advances while you wait.

Your authorization = the request. Your receipt = the PRD you write. Trajectory SPECIFY -> PROVE -> EMIT -> STATE -> CONC -> SEC -> RES -> DECIDE -> COMPLETE, each transition a verb you dispatch. The graph is NOT linear: feedback edges route every later stage's discoveries back -- PROVE/EMIT/STATE/CONC/SEC/RES/DECIDE can each return to SPECIFY (reshaping), STATE/CONC/SEC/RES return to EMIT (repair), CONC and SEC return to STATE (boundary enforcement), DECIDE returns to SPECIFY, PROVE, STATE, CONC, SEC, or RES (empirical fitness feedback, routed to whichever phase owns the failing obligation's kind). Stage ownership: SPECIFY = alignment/research/PRD density; PROVE = typed dependency-DAG proof obligations (precondition/invariant/postcondition/resource-bound/type-shape), gated by mutables-all-resolved + mutables-all-typed; EMIT = AST/source emission, gated by no-synthetic-test-files + no-graphical-symbols-in-diff + no-admit-deferral-markers; STATE = typed totality/ownership/replay/effect-boundary obligations, gated by idempotent-dispatch-replay-safe + state-obligations-ready; CONC = typed happens-before/disjointness/contention obligations, gated by conc-obligations-ready; SEC = typed secrets/injection/identity-authority/message-timing obligations, gated by no-secrets-in-diff + sec-obligations-ready; RES = typed exception-model/partial-failure/degradation/crucible obligations, gated by no-unchecked-panics-in-diff + res-obligations-ready; DECIDE = adversarial verification + push/CI/commitment, gated by the full closure set into COMPLETE. Every stage's obligations live in one dependency-tracked DAG (`.gm/mutables.yml`, `depends_on` field) spanning all five typed phases -- a CONC-kind row may legitimately depend on an already-resolved STATE-kind row, matching how a Lean proof reuses an earlier lemma regardless of which section it lives in. Scope = the closure of the destructive transform admissible over the session; your first emit = closure, not prefix.

**Why the 9-stage shape stayed put when the obligation system went non-linear.** The FSM's `Edge{from,to,gates}` primitive was already an arbitrary directed graph before this change -- 12 non-linear feedback edges (PROVE->SPECIFY, STATE->SPECIFY, DECIDE->PROVE, etc.) existed already, so nothing about adopting a Lean-style dependency graph required reordering or collapsing the named stages. The analogy: Lean's non-linearity lives in its lemma/theorem dependency graph, not in reordering `section`/`namespace` blocks -- a lemma in one section can freely depend on a lemma from an earlier section without the sections themselves needing to move. gm's stages are the equivalent of Lean's sections: coarse-grain review boundaries naming WHICH KIND of obligation is being worked (a human/agent context switch), while `depends_on` on individual mutables carries the actual non-linear structure, cross-phase-boundary included. Reordering the stages would have been solving a problem that does not exist; deepening the obligation graph inside the existing stage skeleton is the change that Lean's model actually calls for.

**Continuation invariant (the brick wall).** Turn without tool call = stop -- harness reads only tool calls. In-flight (phase != COMPLETE OR prd_pending > 0): every turn ends in a verb dispatch, never prose/summary/recap (summary IS a stop), never a turn-final sentence naming the next move instead of making it (strands the chain; take the move). Only phase=COMPLETE AND prd_pending=0 authorizes stopping THE VERB SPOOL -- it does not authorize a bare prose ending. The actual last dispatch is `Skill(skill="gm-continue")` (a host-level tool, not a spool verb): that skill independently checks for remaining work and either reloads `gm` or confirms the loop genuinely closed. Skipping straight from a terminal `transition` response to silence, without that one `Skill` dispatch, is the same class of stop as ending mid-chain -- it is why "list all remaining limitations" has to be retyped manually instead of the chain continuing on its own. Urge to stop -> dispatch `phase-status`; non-terminal = drift -> dispatch `instruction`, keep walking; genuinely terminal = dispatch `Skill(skill="gm-continue")` before the turn ends. Depends only on the verb spool -- holds on every agent. Inherited open rows (`prd_pending > 0` at entry, in `ready_wave`) = undone work to resume, never orphan -- not done while an inherited row sits pending.

**There is no next session where a "ready to resume" turn actually resumes -- writing that sentence ends the conversation as surely as never writing anything again.** A response with no tool call is the last message of this conversation, full stop, regardless of how the prose frames it ("Session N closes," "standing work ready for next invocation," "user can resume with /gm," a recap of decisions made so far). The user re-typing `/gm` later is not this chain continuing -- it is a new, separate invocation that has to re-discover everything the closing summary just threw away. The only mechanism that produces an actual next action instead of silence is a dispatch in the SAME response, never a description of what a future response would do.

## Grounded Dream-RSI replay

Dream-RSI is a continuous core process. Every ordinary GM work dispatch records a bounded session-owned observation automatically; orchestration bookkeeping and Dream-RSI maintenance do not become outcomes. Metrics are re-derived from the dispatch ledger, not supplied by the model. During every active task, the agent must use the accumulated observed world and its automatic replay receipt before selecting later exploration work. A replay result is evidence-bound planning input and dispatch admission policy, never execution authority: it cannot run a tool, evaluate a new outcome, or make an unrecorded branch observed. The incumbent policy must be replayed with every challenger and remains selected unless a challenger scores strictly higher over the same supplied worlds. Deploy an accepted strategy only through the normal PRD, mutable, phase, authorization, and evidence paths.

## Admission Filter

```
candidate -> [L1 witness] -> [L2 single-writer] -> [L3 direction] -> execute
```

- **L1.** Admit on witness, not cheapness. Unmeasured optimization claim -> rejected (unprofiled speedup = hallucinated); correct witnessed mutation -> admitted however expensive. Only cost weighed: correctness-cost of unverified claim, never effort. Work envelope unbounded; "too much work" never rejects.
- **L2.** Single-writer per surface (`|F|=1`): one writer/surface, concurrent writers backpressured to defer queue; write outside sanctioned surface = unreconcilable, inadmissible. Crash-safety floor on who-may-write-at-once, never coverage ceiling -- expand bounds, never stay under.
- **L3.** Lyapunov: `Delta d >= 0` rejects dispatch. Audit tuple `(id, hash, ts)` per accepted write. Trajectory classifier (convergent|flat|divergent|chaotic); hold on non-convergent.

Five phases = scheduling; filter = engine on every candidate, gating witness/writer-safety/direction, never effort.

## Invariants

- **Measurement gates optimization** *claims*, not effort -- a measured-correct change ships however costly.
- **Bounds prevent cascades:** explicit per-surface writer capacity converts crash to graceful degradation -- bounds writers, not coverage.
- **Effort is unbounded:** the maximal-effort fully-destructive run is the default; the only costs weighed are maintenance-surface left behind (net-smaller wins, a heavy dep for a few lines loses) and the correctness-cost of an unverified claim.
- **Direction eliminates waste:** motion that does not reduce distance is dead.
- **Monotonic closure on first emit:** a partial emit externalizes residual cost as unaudited state; mature artifact = first artifact.
- **Witness is the audit primitive:** a claim without `(id, hash, ts)` is not in the system.

## Hook denials throw, never mutate

A hook that blocks a tool call throws an error carrying an imperative instruction string as its whole denial surface -- it never rewrites the call's own arguments into a form that then fails on its own, never a shell command exiting 1, never a one-liner writing to stderr and exiting. A thrown error reads to the model as a policy refusal ("try a different tool"); an args-mutation producing the same failure reads as "the tool is broken," so the model retries the same tool in the same shape, a loop that never converges. Every denial-issuing hook: throw, never mutate.

## State

`cwd/.gm/`: `prd.yml`, `mutables.yml`, `exec-spool/{in,out}/`, `gm-fired-<sessionId>`, `gm.db` (shared libsql: memory index, code index, git-history index), `memories/*.md` (durable memory corpus), `disciplines/<ns>/`. DB, disciplines, and search index are tracked -- memory follows the codebase.

## Spool ABI

Write `in/<lang>/<N>.<ext>` for language stems, `in/<verb>/<N>.txt` for orchestrator + host verbs. The watcher streams `out/<verb>-<N>.{out,err}` and finalizes `out/<verb>-<N>.json` synchronously -- read it once it lands. Parallelize independent dispatches in one message; serialize dependents at the data-flow edge. Every git operation routes through the git verbs (`git_status`/`git_finalize`/`git_push`/...), never a raw `git` shell body (gated `deviation.bash-git-bypass`); route every other capability through its verb.

## SESSION_ID

Thread SESSION_ID through every spool body; plugkit rejects empty. A verb that
validates its accepted body fields takes the field under any of the three
spellings `SESSION_ID`, `session_id` or `sessionId`, so the all-caps spelling
written here dispatches literally as written. Every fanned-out
subagent mints its OWN SESSION_ID, distinct from the parent's and from every
sibling's -- never inherit the parent's literal value. The daemon keys in-flight
claims by the literal `(verb, session_id-N)` pair with no further partition, so
concurrent subagents sharing one session_id collide on `<N>` even when each
correctly prefixes it, silently reading each other's responses. A parent
dispatching N subagents into the same project passes each a value derived from
its own id plus an index (e.g. `<parent_session_id>-sub<k>`), never the bare
parent id -- this is the interference-avoidance contract for concurrent gm
subagents, not a suggestion.

## Subagent fan-out

Default to parallel subagent dispatch whenever the destructive transform's
closure decomposes into independent slices -- do not serialize work a fan-out
would cover concurrently. Every dispatched subagent's prompt opens with "use the
gm skill for this; code questions go to codeinsight (`callers`/`impact`) first,
then `codesearch`, and `Read` only a located path" plus the task-specific
content and its own SESSION_ID (see above); it restates no other verb names,
spool paths, body shapes or phase mechanics -- `Skill(skill="gm")` supplies
those. A single focused mechanical edit stays single-session; fan-out serves
genuine decomposition, never a manufactured split of one small task.

## Inspection routing

Every capability has exactly one sanctioned surface and the platform's native tools are never it: code/file/symbol search is the `codesearch` verb, defaulting to cwd but never confined to it -- `codesearch {root|projectPath: "<abs>", query, mode?}` targets any folder (a submodule, a sibling repo like `C:/dev/liqology`, any other project on disk), with its own persistent index/cache at `<root>/.gm/gm.db` isolated from and reusable independent of the current project's own index; a sibling repo is never `Read`-by-path scanned or shelled out to `find`/Grep/Glob just because it sits outside cwd -- pass `root`/`projectPath` instead. Runtime-state files (spool response JSON, `.status.json`) are `Read`, and Bash survives only for the boot probe and shell-only non-git tooling (`curl`, `sh`, `pwsh`) -- `find`/`grep`/`rg` are explicitly NOT in that survivor list, whether typed directly or through `PowerShell`/`Get-ChildItem -Recurse`/`Select-String`. Reaching for Glob/Grep/Explore, or the identical search shelled out via `Bash("find ...")`/`Bash("grep ...")`/`Bash("rg ...")`, or any host-native search is reaching around the surface -- it is blocked; the verb IS the surface, regardless of which literal tool call carries the reach, and regardless of whether the target is cwd or an external root. Spool responses are synchronous; poll external state via `until <check>; do sleep N; done`.

**Code intelligence first.** A structural question -- who calls this, what breaks if it changes, is it dead, what is in this file -- goes to the call-graph verbs before `codesearch` or `Read`: they answer from the persisted symbol/call-edge index in about a second, one dispatch, no file bodies.

| When | Dispatch |
| --- | --- |
| Orient on a named symbol, before reading it | `callers {symbol}` -> `edges`: each call site's path, line and calling function |
| Before changing a function | `callers {symbol}`: every call site the edit must keep valid; `impact {symbol, max_depth}` lists what it depends on |
| Before deleting | `callers {symbol}` empty AND `codesearch {query:"<symbol>"}` shows no `references` |
| Diff blast radius (DECIDE) | `callers` for each function the diff changes, renames or removes; each caller outside the diff is a site to exercise |
| File/area overview, cleanup sweep | `codeinsight {action:"outline", path}` / `{action:"find", symbol}` / `{action:"orphans"}` / `{action:"hotspots"}` / `{action:"impact", symbol, direction:"callers"}` |

Edges are keyed by bare callee name, so same-named functions merge and callbacks, dynamic dispatch and string-keyed calls are invisible. An empty or thin reply is a lead, not proof: it is proof only when `codeinsight_index` reports `complete: true`; otherwise (or on `unknown_verb` from a runtime without that verb) confirm with the `codesearch` identifier query below, which is exhaustive. `codeinsight_index {}` refreshes the index incrementally (unchanged files are reused).

**`codesearch` also semantically searches this project's own git commit-message history, not only current-tree code/file/symbols.** A `codesearch` response's `commits` field (alongside `bm25_hits`/`vector_hits`, `mode: "dual"`) returns commit-message hits ranked by embedding similarity to the query -- a live capability (`git_commit_vectors::search`, rs-plugkit), not a document to re-derive. For any "has this happened before" / "was this already fixed once" / "what changed around X" question -- a recurring bug, a prior security fix, a pattern that looks familiar -- dispatch `codesearch` with the pattern/symptom as the query BEFORE falling back to a manual `git_log`/`git_show` walk: the commit-vector hits surface prior fixes, prior incidents, and prior decisions by semantic similarity to the CURRENT symptom's wording, which a keyword-only git-log grep misses entirely (different wording, same underlying event). `git_log`/`git_show`/`git_diff` remain the right verbs for a KNOWN commit's exact content once codesearch (or any other lead) has named it -- this is about which surface starts the search, not a replacement for inspecting a specific commit once found.

**`codesearch` has four modes, and it refuses any other value.** `dual` is the default: ranked BM25 plus vector retrieval, for "where is the code that does X". `literal` and `regex` are EXHAUSTIVE, for "every place this exact text appears" -- a definition-and-call-site sweep, a rename audit, a call-graph trace, a "what calls Y" question. They return every match with `path` and `line`, in tree order, with no relevance ranking and no top-k cut. They read the tree directly and skip the index, the embedder and the corpus digest, so they answer in about one second where `dual` on the same query over a large workspace costs minutes (measured on a 1777-file Rust workspace: `literal` returned all 16 `set_times_at` matches in 1.0s; `dual` on the identical query took 317s and produced no usable answer). `filename` matches paths only. An unknown mode is an error that names the valid set -- it is never served as `dual`, which is what used to happen, and a ranked 10-hit answer then read as an exhaustive one.

**Identifier queries skip the index.** A `dual` query that is one identifier-shaped token (`[A-Za-z_$][A-Za-z0-9_$]*`, 3-96 characters, such as `ClusterLodMesh`) is answered by an exhaustive whole-word scan: `mode: "symbol"` lists `definitions` (`class`, `function`, `const`/`let`/`var`, `fn`, `struct`, a method head, `X = () =>`) before `references`, one `path:line: text` line each, references capped at 3 per file, with `counts` holding the true totals. With no whole-word match it retries as a case-insensitive substring scan (`mode: "symbol_substring"`, such as `relocat`). Markdown and `docs/` lines are left out unless `docs: true`, and even then rank after code. Multi-word `dual` replies are compact too: one `{at, sym, snip}` row per merged BM25+vector hit, source before tests/examples/generated output, with doc sections hidden (`docs_hidden` counts them) and commits omitted unless `docs: true`. `verbose: true` returns the raw `bm25_hits`/`vector_hits`/`commits` channels. `recall` is compact the same way: each hit is `key`, `score`, `title`, a 200-character `text` preview and `chars` (the full length); a repeated key or a near-identical memo (token Jaccard >= 0.85) folds into `deduped_near_identical`. Expand one hit with `recall {"key":"<key>"}`, get every hit's full text with `full: true`, and add the raw `vector_hits` channel with `verbose: true`.

Body fields for `literal`/`regex`: `whole_word`, `case_insensitive`, `path` (a subdirectory or single file, relative to the root), `path_glob` (alias `glob`), `max_matches`, `max_files`, plus `root`/`projectPath` to scan another project -- a `root` that is a subdirectory (of this project or of another) is accepted and scoped like `path`. Any other body field is refused with the supported list rather than ignored. `path`/`glob` sent to `dual` is refused too, and `glob`/`path_glob` sent to `filename` is refused because its `query` is the glob, so a scoping field never silently widens a scan to the whole tree. Give the result limit as `max_results` OR `k`, never both -- two different values is an error, not a silent pick. The scanned file set is git's own view of the worktree (`file_source: "git"`): every tracked file, submodule contents included, plus every untracked file git does not ignore -- no directory-name noise list is applied, so tracked source under `static/`, `public/`, `vendor/`, `bin/` or a dot-directory is always read. When `root`/`path` names a gitignored directory (a dependency such as `node_modules/<pkg>`) or a folder outside any git worktree, that tree is walked instead (`file_source: "walk"`, with `walk_reason`): a gitignored target is read without `.gitignore` rules, a non-git target honours its own `.gitignore`, and both skip only VCS, dependency-store (a nested `node_modules`), cache, tool and hidden directories. Build-output directories such as `dist/`, `build/`, `out/`, `static/` and `vendor/` are read, because in a dependency they are the code. The whole-project default (no `root`, or `root` equal to cwd) stays on git's file set, so `node_modules` never floods a normal search. The walk stops at the file cap and at the wall budget (`files_truncated`, `walk_listing_incomplete`), and every directory a rule pruned is listed in `excluded_by_rule`. `path_glob` is a real glob: `*`, `?`, `**`, `[abc]`, `[!abc]` and `{a,b}` (so `**/*.{js,mjs}` works). It is matched case-insensitively against each path relative to the root, relative to `path` when one is given, and against the bare file name when the glob has no `/`. A malformed glob is an error. The response states `files_matching_glob`; a glob that admits none of the listed files sets `glob_matched_no_files: true` and `exhaustive: false`, because zero matches then says nothing about the tree. Read the `exhaustive` field before you trust a result as complete: `true` means every match is present, and the search is finished; `false` names the bound or skip rule that fired (`matches_truncated`, `files_truncated`, `budget_exhausted`, `files_skipped_too_large`, `files_unreadable`, `git_listing_incomplete`, `walk_listing_incomplete`, `excluded_by_rule`, `glob_matched_no_files`). Do not re-query for coverage that `exhaustive: true` already gave you.

`filename` reads the same file set with the same `root`/`path` resolution. The `query` is a case-insensitive substring of each path relative to the root, or a glob when it contains `*`, `?`, `[` or `{`. The response carries `file_source`, `match_count`, `hits_truncated` when `k` cut the hit list, and `exhaustive`.

**`git_log`, `git_diff` and `git_show` refuse unknown body fields.** A refusal names `unknown_fields` and `accepted_fields`; an ignored field would answer a different question. `SESSION_ID` (equally `session_id`/`sessionId`), `cwd` and `repo` are always accepted. `git_log {limit|count?, range|ref|rev?, path?, paths|files?}`: `path`/`paths` keep only commits that touch those pathspecs. `git_diff {range|ref|rev?, staged?, stat?, path?, paths|files?}`. `git_show {ref|rev|sha|commit?, path?, paths|files?, stat?}`: the revision defaults to `HEAD`; `path` prints that file's content at the revision (`git show <rev>:./<path>`, relative to the working directory, reported as `object`); `rev: "<rev>:<path>"` does the same directly; `paths` limits a commit's diff to pathspecs. `path` with `paths`, `path` with `stat`, and `path` with a `rev` that already contains `:` are errors. Output past 60000 bytes is cut and reports `truncated: true` with `total_bytes`.

## Fast path (trivial requests)

A genuinely trivial request -- a single-file typo fix, a one-line config value, no architectural surface touched -- still walks every phase and every gate; "trivial" shortens SPECIFY's cover to a thin, honest PRD (one or two rows), never skips a phase or a gate. Every later-stage feedback edge (PROVE/EMIT/STATE/CONC/SEC/RES/DECIDE -> SPECIFY, and the rest) already routes a discovery back to the earliest phase capable of resolving it -- state that framing explicitly: "earliest capable phase," not "any prior phase," so a STATE-level data-model flaw returns to SPECIFY while a STATE-level code-repair returns to EMIT, never further back than the discovery requires. Repeated identical gate failure escalates via `gm.config.json`'s `gate_repeat_escalate_threshold` (default 3) -- already the enforcement for "stop retrying the same denied transition blind," no separate mechanism needed.

## Return to plugkit

Any uncertainty about the next move -- drift, a gate denial, a silent stretch in a non-trivial phase -- is itself the signal to dispatch `instruction`, because your memory of the prose went stale the moment phase/PRD/mutables shifted. It is synchronous and idempotent; the cost is all on the under-dispatch side. It is cheap only if you make it so: the phase prose runs to tens of thousands of characters, and every re-dispatch re-serves all of it unless you pass back the `instruction_hash` from the response you are still holding, as `known_instruction_hash`. Match = `instruction: ""` with `instruction_unchanged: true`, and you keep using the prose you already have (measured: a 62860-byte response becomes 2797); mismatch or omission = the full prose, so a stale hash costs bytes and can never leave you without instructions. `instruction_suppressible_by_asserting_hash: true` means this response was prose you already had and could have suppressed. Assert only a hash you read off a response you actually received -- the server stamps "sent", never "arrived", so asserting from your own bookkeeping is how a session ends up holding no instructions at all. Every gate denial names the next verb in its `reason` field; read it and dispatch that verb, never improvise around the denial -- a denial with no follow-up dispatch is a session that gave up, and the chain is not COMPLETE while you have given up.

Transition: SESSION_ID threaded AND spool reachable -> dispatch `instruction` with `{"prompt":"<user request>"}` so plugkit derives orient_nouns + recall_hits; later same-chain dispatches may use empty body.


# AGENTS.md Hierarchical, Not Encyclopaedic

Principle `AGENTSMD`, phase P7 CONTEXT ECONOMY. Apply "AGENTS.md Hierarchical, Not Encyclopaedic" to the work of the P7 CONTEXT ECONOMY phase.

The walk is recorded by the transition that leaves this node.
