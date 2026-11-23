# SharedTree history compaction: internal implementation

This guide is the source of truth for the internal history compaction implementation and its tests on this branch.
Update it with related implementation or test changes.
There is no app-facing compaction API or configuration on this branch.
The existing public history and retention APIs are unchanged.

## Scope and boundaries

Included:

- Composition of adjacent retained main-trunk commits in `EditManager`.
- Internal manual invocation and opt-in summary-time integration in `SharedTreeCore`.
- Stable atom identities, repair-data cleanup ownership, inverse-cache invalidation, stale-history callback checks, and peer-branch rebasing.
- Per-pair engine-failure isolation and validation with the existing summary change codec.
- Regression tests, summary pass results, and local/summarizer savings measurements.

Excluded:

- `ITreeAlpha.historyCompaction`, `CanCompactCommit`, and other public compaction types.
- Compaction options on `SharedTreeOptions` or `configuredSharedTree`.
- Revision preservation (pins), pin events, pin ops, and pin-specific summary formats.
- Verbose history tracing, fork lifecycle telemetry, and codec/checkout trace correlation.
- Application guides, app-facing E2E tests, and public API report changes.

Summary compaction is disabled unless internal code explicitly configures a policy.
The policy is local, is not persisted, and sends no op.
There is no default application behavior change.
This branch does not claim that every reported application failure is reproduced or fixed.

**NOTE: Revision preservation belongs in a separate branch.**
Future pin support must constrain both trimming and the compaction pair selection in `EditManager`.
Its ownership, operations, and summary representation need separate implementation and tests.
No pin state, preservation API, or preservation protocol is added here.
Keeping internal atom IDs stable is a compaction correctness requirement, not a promise to retain the original revision as a navigable history point.

**NOTE: Detailed diagnostics belong in a follow-up.**
This branch has no history trace sinks, tracing configuration, fork trace IDs or ages, or diagnostic-only parameters threaded through change families, codecs, and checkouts.
The summary hook's aggregate pass result and the engine statistics used by tests and benchmarks remain part of summary integration.

Internal compaction requires `minVersionForCollab` of at least `"3.14.0"`.
That configuration writes SharedTree summary version 3, which requires compaction-aware readers.
A released 3.13.0 reader rejects that summary during loading instead of loading history that it cannot restore.
A current reader configured to write older-compatible summaries also rejects version 3, preventing an accidental downgrade.
Older configurations still write version 2; their manual and summary-policy compaction entry points reject the request before mutation, without breaking the tree.
This version gate assumes these changes first ship in 3.14.0; update the gate and compatibility tests if the release changes.

## Part I: Concepts

### History, retention, and eligibility

The **trunk** is the sequence of commits ordered by the service.
Each client has its own in-memory trunk.
The **minimum sequence number (MSN)** identifies how far all clients have progressed.
The collaboration window contains newer commits that are still needed to rebase incoming edits.
An open local fork can also require keeping its base and all later trunk commits unchanged.

The existing `retainHistory` option keeps additional commits after collaboration no longer needs them.
Trimming drops old commits from the beginning of history.
Compaction instead combines adjacent eligible commits and keeps their total effect.
Only main-trunk commits at or below both the collaboration bound and the bound immediately before the oldest local fork base are eligible.
Unsequenced edits, fork-authored changes, other shared branches, and the trunk base are not compacted.

### Composition keeps a state, not the original step

`H1` names a commit and `R1` its revision.
`H2*` denotes a survivor after composition; the star is explanatory, not stored.

```text
Before: H0 -- H1 (delete a) -- H2 (delete b)
After:  H0 ----------------- H2* (delete a, then delete b)
```

H2 keeps its object identity, revision R2, and sequence ID.
Its change now describes the complete step from H0 to H2's state.
H1 stops being a retained point, but H0 and H2 must still be readable and restorable.
Current content must not change.
That alone is insufficient: later undo, restore, peer edits, summary encoding, and reload must also work.

### Repair identity and cleanup ownership

Deleted nodes can remain in the forest as detached **repair data**.
The detached-field index finds those roots by lookup IDs.
An internal atom ID is a pair `(revision, localId)`; `(R1, 0)` and `(R2, 0)` are different IDs.
Atom IDs also identify operations such as moves, not just detached roots.

Lookup identity answers "which node or operation?"
Cleanup ownership answers "which revision's later trimming lets this repair root be collected?"
After H1 is absorbed into H2*, a root can retain lookup identity `(R1, 0)` but have cleanup owner R2.
References to its original ID remain valid, while trimming R2 can eventually release it.
The graph commit is R2, but its change retains the ordered namespace metadata for R1 and R2.
This metadata orders internal cells; it does not make R1 navigable or prevent trimming.

### Inverses, aliases, and cached paths

An inverse reverses a change.
The inverse of edits `[1, 2, 3, 4]` is `[-4, -3, -2, -1]`.
Rebase and retained-state navigation use inverses.
Replacing a survivor's change invalidates any inverse cached on its object.

Inversion can allocate aliases, which are alternate internal IDs.
The allocator must reserve ranges for namespaces present in cross-field move keys, even when those namespaces are absent from authored revision metadata.

A captured `revertTo` callback holds a history path.
Compaction can change a path entry's change without replacing its object or the head object.
A stale callback must be rejected before applying anything; the caller can acquire a fresh callback.

### Namespace ordering across compaction groups

Stable IDs are not enough.
Suppose one compaction group contains moves that name empty cells under R1 and R2, and a later group edits those cells.
Restoring a state before both groups composes their changes.
If compaction replaced the namespace list with only each survivor's revision, the sequence composer could no longer order two original cells and would fail with `0x8a2`.

Compaction retains the composed change's original namespace ordering and atom IDs.
Summary encoding stores this ordering using the existing revision-list field.
Tagged ops still require a single revision; this exception is restricted to summaries.
Rollback reverses the whole compacted graph commit using its survivor as `rollbackOf`, while retaining the original namespaces as input to inversion.
No removed commit, preservation handle, pin, or retention boundary is added.

### Metadata depth, checkpoints, and history counts

Combining H1's metadata with H2's metadata must not add another nesting level each time a survivor absorbs an edit.
Otherwise, thousands of individually shallow metadata trees become one tree too deep for the summary encoder.
Compaction reuses a shallow list of authored subtrees by flattening only its own synthetic wrappers.
Authored transaction nesting remains intact.
An in-memory weak set identifies synthetic wrappers; loaded metadata is treated as authored because the existing format does not identify synthetic wrappers.
The complete proposed metadata is encoded and JSON-serialized before graph mutation, so an unencodable replacement or overly deep loaded tree cannot poison the survivor.

A transaction checkpoints the detached-root index, but it does not checkpoint the shared history.
If H1 is compacted into H2 during that transaction, abort must restore the index and then replay the H1-to-H2 cleanup ownership transfer.
Each open transaction records these transfers in order and removes its listener when it closes.
This also applies to nested transactions and transactions on local forks.

`History.length` uses shared removal-count bookkeeping.
Compaction updates that count before notifying listeners, just as trimming does.
Both previously cached lengths and lengths first read during a notification must agree with the remaining graph.

### Summary codecs and peer branches

A codec encodes and decodes persisted changes.
The encoded `maxId` must cover any newly allocated local IDs so decoder temporary IDs do not collide with existing IDs.
Proposed composed changes are round-tripped through the actual summary change codec before the trunk is mutated.

The receiving engine also tracks an internal branch for each remote peer.
This is not an application-created fork.
An idle peer's tracked branch can still reference its last authored commit, even after the peer receives newer edits.
Before composition removes old commits, peer branches must be rebased onto the newest eligible survivor.
The MSN bound makes that rebase safe, but does not update references automatically.

## Internal integration

`EditManager.compactHistory` accepts a decision callback over two `GraphCommit` objects:

| Result | Effect |
| --- | --- |
| `false` | Keep both commits. |
| `true` | Compose the older into the newer and retain both metadata trees as children. |
| A `CustomMetadataTree` | Compose and replace the pair's metadata with that tree. |

Pairs are considered oldest first.
A survivor can absorb the next commit in the same pass.
Use `flattenCustomMetadata` if the callback needs flattened values: after a default merge, metadata can be held in children rather than the root.
The returned count is the number of removed commits.
Optional stats describe eligibility bounds, registered forks, peer rebasing, and isolated failures.

`SharedTreeCore.compactHistory` delegates to this engine with failure isolation enabled and the summary codec validator installed.
It is an internal class method, not part of the tree's public view.
Decision callback errors propagate from direct invocation.

`SharedTreeCore.setSummaryCompactionPolicy` configures only that core instance.
Passing `undefined` disables it.
The hook runs at the beginning of `summarizeInternal`, before component snapshots are generated.
It also runs when internal callers invoke the inherited summarization path rather than `summarizeCore` directly.
Summary compaction therefore targets the history of the client writing that summary, not another interactive client's history.
Existing clients are not rewritten when another client writes a summary.
The normal incremental summary rules still apply when the runtime reuses a summary without calling the DDS.
However, `getGCData()` also invokes the inherited summarization path, so a GC-only traversal can run the policy.
The hook is not restricted to uploaded snapshots.

Summary decision errors are caught inside the callback, before they can escape a breaker-wrapped method.
Completed pairs remain combined; later callbacks in that pass are suppressed.
Application errors are not attached to telemetry because they can contain application data.
The summary still proceeds.

For engine errors, composition and validation occur before the first trunk mutation.
A failed pair remains unchanged and is skipped for the lifetime of that manager.
The pass can still combine later pairs.
A peer-rebase failure ends the pass before any composition.
Failure memory is not summarized: a new client or summarizer session retries.
These guarantees do not cover arbitrary exceptions after trunk mutation or unrelated summary failures.

## Implementation map

| File | Responsibility |
| --- | --- |
| `src/shared-tree-core/editManager.ts` | Eligibility, pair walking, shallow synthetic metadata grouping, metadata validation, failure isolation, peer rebasing, and shared removal-count bookkeeping. |
| `src/shared-tree-core/sharedTreeCore.ts`, `summaryTypes.ts` | Version-gated internal entry points, guarded summaries and loading, summary-time hook, actual summary-codec validator, and summary pass telemetry. |
| `src/shared-tree-core/branch.ts` | Propagates `ancestryCompacted(removedRevision, survivingRevision)` through branch trimmers. |
| `src/core/rebase/utils.ts` | `replaceChangeInPlace` replaces a survivor's change and clears its cached rollback. |
| `src/feature-libraries/modular-schema/invert.ts` | Reserves move namespaces before inverse alias allocation and rolls back a compacted commit under its survivor revision. |
| `src/feature-libraries/modular-schema/modularChangeFamily.ts` | Tracks the maximum local ID allocated by revision replacement, including range endpoints. |
| `src/core/tree/detachedFieldIndex.ts` | Transfers repair cleanup ownership without changing lookup identities. |
| `src/shared-tree/treeCheckout.ts` | Transfers ownership in subscribed checkouts, replays ownership transfers after transaction abort, and rejects captured callbacks with changed path entries. |
| `src/feature-libraries/modular-schema/modularChangeCodecV1.ts` | Persists compacted namespace ordering in tagged summaries, while keeping tagged ops restricted to a single revision. |

The source paths above are relative to `packages/dds/tree`.
Compaction retains the composed change's original atom IDs and ordered namespace metadata without revision replacement.
It does not rewrite the detached-field index's lookup keys or emit trimming notifications for composed-away revisions.
After mutation, `ancestryCompacted` transfers cleanup ownership; normal later trimming releases the roots.
Existing op formats remain unchanged.
The summary envelope uses version 3 for configurations at or above 3.14.0; component formats reuse their existing revision-list representation.

## Bug-to-regression index

These are separate defects, even when they share an assertion.
The small examples explain why each fix is needed; they are not claims to reproduce every application's original edit sequence.

| Bug | Example without the fix | Fix and regression |
| --- | --- | --- |
| Stale maximum after remapping (`0xdbd`) | `(R1, 0)` and `(R2, 0)` become `(R3, 0)` and `(R3, 1)`, but `maxId` remains 0. The decoder can reuse local ID 1. | Raise the maximum through the last ID in each replacement range. Modular-family test: `raises maxId when collapsing revisions allocates new local IDs`. Current compaction preserves IDs and does not itself exercise remapping. |
| Changed repair lookup IDs (`0x928`, `0x92a`) | H1 deletes `a` under `(R1, 0)`; H2 deletes `b`. After composition, restoring H0 needs both nodes. Renaming H1's internal IDs makes the inverse look for `a` under an ID that the forest does not have, even though `a` is still stored. | Preserve original IDs. History tests: manual/summary `preserves rewind, restore and existing Undo ...`, plus 42/49 mixed-edit round-trips. |
| Missing inverse namespaces (`0xd40`) | A change tagged R2 contains a move from R1. Its inverse asks for an R1 alias after reserving only R2. | Reserve namespaces represented in `crossFieldKeys`. Compaction also retains namespace ordering. The mixed-edit restore cases include moves and restore on source and reloaded clients. |
| Repair roots never collected | H1's root still has cleanup owner R1 after H1 is removed. Later trimming reports R2, never R1, so that root remains indefinitely. | Transfer ownership to R2, not identity. History test: `releases repair roots from composed-away revisions when the surviving history is trimmed`. Detached-index test: `transfers cleanup ownership for all roots without changing their identities`. |
| Stale cached inverse | H4 caches `[-4]`, then absorbs edits 1–3. Rewind uses `[-4]` instead of `[-4, -3, -2, -1]`. | Clear the cached rollback when replacing the change. EditManager test: `invalidates cached rollback data when the surviving commit absorbs older changes`. |
| Captured callback accepts a changed path (`0x7ce`) | Capture H0's restore callback, then combine H1 into the same H2 object. A head-identity check passes, but the callback's path is stale. | Snapshot path changes and reject changed entries with `UsageError`, leaving content unchanged. History tests cover stale rejection, an unchanged callback, fresh restore, and subsequent replicated edits. |
| Idle peer's edit applies twice | B's tracked branch still points to removed H1 after H1–H4 compose into H4*. Processing B's next edit can reapply B's edit from H1 while reconciling with H4*. | Rebase peers onto H4 before mutation. EditManager tests cover both sequential and concurrent earlier peer edits, including summary load and later sequencing. |
| Engine failure prevents summaries | Composition or validation throws during summarization, breaks the tree, and makes later summarizers fail again on the same pair. | Validate before mutation and isolate engine failures. History tests inject compose/validation errors for manual and summary passes, check no retry, reload the summary, and continue replicated edits. |
| Metadata nesting prevents summaries | Combining 4,000 flat metadata trees adds 3,999 nested wrappers. The change codec passes, but recursive metadata encoding overflows. | Flatten synthetic wrappers only and validate metadata before mutation. `EditManagerSummarizer` round-trips 4,000 authored transaction subtrees, then compacts again after reload. The engine also rejects an unencodable replacement without changing the graph or cached count. |
| Abort restores obsolete cleanup ownership | H1's roots transfer to H2, then an overlapping transaction abort restores a checkpoint whose owner is still H1. Trimming H2 never collects those roots. | Replay transfers after restoring the checkpoint. History tests cover chained transfers, commit/abort/nested-abort, actual transaction edits, main/manual compaction, and fork/summary compaction. |
| Cached history length counts removed commits | A warmed count stays 4 after three commits are removed; trimming the last commit then reports 3 instead of 0. | Update the shared removal count before notifications. Engine tests cover warm/cold main and fork counts, full/selective compaction, listener observations, later forks, and trimming to zero. |
| Older reader accepts unusable history | A released reader accepts a compacted snapshot, then fails during restore because it does not understand its inverse requirements. | Require configuration >= 3.14.0 and summary version 3. Tests load an uncompacted control with the actual previous package, verify restoration, reject guarded summaries, and reject current-reader downgrade attempts. |
| Compatibility rejection breaks a usable tree | A guard throws through the class-wide breaker even though no state changed, so later edits fail. | Keep compatibility checks outside the mutation breaker with `throwIfBroken`; retain breaker protection around engine mutations. The older-configuration test edits and summarizes after rejection. |
| Repeated compaction loses cell ordering (`0x8a2`) | After two groups of moves/deletes are compacted, restoring before both groups compares cells whose original revision ordering has been discarded. | Retain namespace ordering, serialize it in summaries, and roll back the survivor as one graph commit. Six seeded differential tests cover four edit/compact/reload/restore cycles each. Modular tests verify tagged summary round-trips, rejection in ops, and composed rollback. |

Do not substitute immediate cleanup for ownership transfer: freeing R1's roots during composition would break restoration of H0.
Do not discard namespace ordering when removing graph commits: later composition can still require it.
Do not turn that ordering metadata into navigable history or retention ownership.
Do not disable codec validation to hide a rename collision.

## Summary pass results

The internal summary hook emits `HistoryCompaction` with `trigger: "summary"`.
Status is `success`, `partialFailure` for isolated engine errors, or `failure` for a decision error.
Events include the removal count, eligibility stats, failed/skipped pair counts, and the first isolated engine-failure stage.
No event is emitted when no summary policy is configured.
Engine errors are attached for diagnostics; decision errors are not.

Detailed tracing and fork lifecycle events are not implemented here.
A future diagnostics change must not alter operation results or mask failures, and must tag application-selected identifiers as user data.

## Test map and commands

| Suite | Coverage |
| --- | --- |
| `src/test/shared-tree-core/edit-manager/editManagerCorrectness.test.ts` | Empty/single history, idempotence and new eligibility, nested-fork disposal, oldest-first decisions, default/replacement metadata, survivor identity, collaboration/fork/batch bounds, cached inverses, peer branches, later sequencing, trimming, and in-memory summary reload. |
| `src/test/shared-tree/historyCompaction.spec.ts` | Basic edit pairs, compatibility guards and the previous reader, pending/offline concurrent edits, GC policy invocation, seeded differential histories, manual/summary integration, retained-state navigation, Undo/Redo, repair/transaction lifecycle, mixed edits, and failure isolation. |
| `src/test/core/tree/detachedFieldIndex.spec.ts` | Cleanup ownership across multiple roots, stable identities, unrelated roots, and eventual deletion. |
| `src/test/feature-libraries/modular-schema/modularChangeFamily.spec.ts` | Replacement ID maximum tracking, compacted rollback, and namespace ordering in tagged summaries but not ops. |
| `src/test/shared-tree-core/editManagerSummarizer.spec.ts` | Large metadata composition, preservation of authored transaction structure, summary encoding/loading, and further compaction after loading. |
| `src/test/shared-tree/historyCompaction.bench.ts` | Real local-service containers, local and dedicated-summarizer savings, uncompacted baselines, fresh-client summary loading, restoration, and subsequent collaboration. |

From `packages/dds/tree`:

```bash
pnpm exec tsc --build tsconfig.json src/test/tsconfig.json
pnpm exec mocha --no-config --node-option conditions=allow-ff-test-exports --require @fluid-internal/mocha-test-setup --require source-map-support/register --timeout 10000 --exit lib/test/mochaHooks.js lib/test/shared-tree/historyCompaction.spec.js
```

The mixed-edit tests enable strict rebase validation for compaction, encoding, reload, and retained-state navigation, after authoring the fixture.
They compare exact surviving revision lists and current content, then rewind to the initial retained revision and the survivor's state on source and loaded clients.
They also restore the initial retained state on both clients.
They include uncompacted controls.
Optional heap measurements, application walkthroughs, and app-facing API tests from the original feature branch are not part of this extraction.

### Coverage progression and setup

Read the suites from basic to advanced:

1. Empty/single history, one pair, rejected pairs, and repeated passes without new eligible edits.
2. Named insert/delete/move pairs, exact surviving revisions, counts, detached-root identities, and initial/survivor states after reload.
3. Multiple/nested fork boundaries, node status through repair cleanup, transaction commit/abort, inner abort, and inner commit followed by outer abort.
4. Pending local edits, offline resubmission, concurrent peer moves, acknowledgements, and continued collaboration against an uncompacted control.
5. Guarded summary loading, fresh compressor sessions, GC-only compaction, policy disabling, codec failures, and repeated namespace ordering.
6. Six deterministic seeds with two alternating authors, four cycles of eight edits, an independent array model, and uncompacted controls.
7. Real-container local/summarizer measurements across five workloads, reload, restoration, further edits, and another service-summary reload.

The basic cases show initial state, authored edits, collaboration-window advancement, compaction, and assertions separately.
The seeded cases synchronize each generated edit; they do not replace the separate concurrent/offline cases or a full DDS fuzz model.
Unit reload helpers deserialize a fresh compressor session instead of sharing the source compressor object.
The mixed stress cases are named by their seven-operation cycle rather than only their total edit count.

Remaining extensions include schema upgrades across compaction, cloned revertibles, stashed-op rehydration, injected partial peer-rebase failure, incremental summary reuse, and dedicated-summarizer replacement.
These scenarios are not established by passing the current suites.
No finite test suite proves the absence of further bugs.

### End-to-end savings measurements

`historyCompaction.bench.ts` follows the existing `benchmarkIt` / `CollectedData` pattern from `summary.bench.ts`.
It uses `TestTreeProvider`, not the mock-only `TestTreeProviderLite`.
Each of the twelve cases creates fresh containers.
Both compaction locations run 100 and 500 scalar overwrites, plus 100 inserts, deletions, moves, or metadata-heavy overwrites.
Each workload uses a metadata group so barrier edits remain separate.
An uncompacted service summary advances the summarizer's reference sequence number.
Barrier edits then move the workload outside the collaboration window before the measurements begin.

The two locations have different persistence effects:

- **Local:** compact only the interactive client's history. Its full DDS snapshot shrinks, but the dedicated summarizer and a client loaded from its service summary retain uncompacted history.
- **Summarizer:** configure only the dedicated summarizer's internal policy, then produce and acknowledge a service summary. A fresh client loads the compacted history; existing interactive clients remain uncompacted.

Each case compares its own full DDS snapshots before and after compaction.
It records retained commit counts, edit-manager bytes, total DDS blob bytes, absolute savings, history savings percentage, and service-summary duration.
Local cases also record the direct compaction duration.
The service-summary duration includes runtime, GC, upload, and acknowledgement work; it is not an isolated compaction CPU measurement.
Byte counts are UTF-8/binary blob payload sizes, excluding summary handles, JSON wrapper overhead, and container-wide metadata.
These measurements are not heap savings or a guarantee for other workloads.
The tests assert actual compaction for every workload and smaller payloads for scalar overwrites.
Other workloads report signed savings rather than assuming fewer commits must mean fewer bytes.
Namespace lists, authored metadata, and retained repair data still consume space.
Each case restores the initial scalar and array state on a loaded fork, verifies a new loaded-client edit reaches both original clients, and loads another service summary after that edit.

Example history-payload savings from these fixtures:

| Workload | Edits | Local | Summarizer |
| --- | --- | --- | --- |
| Scalar overwrites | 100 | 78.19% | 78.10% |
| Scalar overwrites | 500 | 82.52% | 82.50% |
| Inserts | 100 | 73.94% | 73.87% |
| Deletions | 100 | 71.43% | 71.34% |
| Moves | 100 | 61.71% | 61.64% |
| Metadata-heavy overwrites | 100 | 27.92% | 27.91% |

These are sample measurements, not regression thresholds.
They include the namespace-ordering metadata required for correctness.
Each 100-edit run reduced retained commits from 103 to 4; each 500-edit run reduced them from 503 to 4.

From `packages/dds/tree`, collect machine-readable results with the existing benchmark reporter:

```bash
FLUID_TEST_PERF_MODE=1 pnpm exec mocha --no-config --node-option conditions=allow-ff-test-exports --require @fluid-internal/mocha-test-setup --require source-map-support/register --timeout 60000 --exit lib/test/mochaHooks.js lib/test/shared-tree/historyCompaction.bench.js --reporter @fluid-tools/benchmark/dist/mocha/Reporter.js --reporterOptions reportFile=/tmp/history-compaction-savings.json
```

The same file runs correctness assertions without performance mode.
**NOTE:** A future preservation branch should add separate pinned-boundary measurement cases; these baselines deliberately have no pins.
