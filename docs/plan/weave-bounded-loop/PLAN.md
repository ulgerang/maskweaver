# Implementation Plan

Goal: add a change-scoped bounded loop to `weave` that can iterate safely between implementation and verification.

## In Scope

- loop state files under `.opencode/weave/changes/<change-id>/`
- explicit human-readable `loopId` generation and lookup
- new `weave` commands for loop lifecycle
- controller/worker/verifier separation in the loop protocol
- attempt logging and bounded retry policy
- status output for loop progress

## Out of Scope

- full parallel worker swarm orchestration in v1
- automatic PR creation or branch merging
- arbitrary repo-wide autonomous editing without file budgets
- replacing manual `craft`, `verify`, or `archive`

## Expected Code Changes

Existing files:

- `src/plugin/tools/weave.ts`
- `src/weave/types.ts`
- `src/weave/change-artifacts.ts`
- `src/weave/stages/execute.ts`
- `src/weave/stages/archive.ts`
- `src/weave/worktree.ts`
- `src/shared-context/session.ts` (reference pattern only if needed)
- `test/weave-flow.test.ts`

Proposed new files:

- `src/weave/stages/loop.ts`
- `src/weave/loop-policy.ts`
- `test/weave-loop.test.ts`

## Delivery Sequence

### Phase 1. Loop State Model

- add rule-based string `loopId` generation
- add loop-related status fields to change metadata
- add helpers for `run.yaml`, `stop.json`, `events.jsonl`, and `attempts/<loopId>/`
- define a bounded loop policy object

### Phase 2. Core Loop Commands

- add `weave loop-run` as the primary entrypoint
- add `weave loop-start` and `weave loop-step` as debug/staged controls
- persist attempt summaries and verifier outcomes

### Phase 3. Retry Budgeting

- detect no-progress retries
- stop at `maxIterations` or `maxNoProgress`
- stop through explicit `loopId` stop-request semantics
- move loop state to `needs_retry`, `stopped`, or `blocked`

### Phase 4. Loop Run / Status UX

- add `weave loop-status loopId=...`
- add `weave loop-list`
- add `weave loop-stop loopId=...`
- surface retry budget and last verifier result in status

### Phase 5. Tight Integration

- reuse `verify` output inside the loop
- reuse `archive` gate after verified loop completion
- carry loop artifacts into worktree bootstrap
