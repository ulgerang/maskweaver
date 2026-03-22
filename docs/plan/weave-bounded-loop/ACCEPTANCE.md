# Acceptance

## Automated Checks

- `test/weave-loop.test.ts` covers:
  - string `loopId` generation and collision bumping
  - `loop-run` returning a readable `loopId`
  - loop-start artifact creation
  - loop-step attempt logging
  - stop-request handling for `loop-stop loopId=...`
  - retry budget exhaustion
  - no-progress handling
  - loop-status reporting
  - loop-list reporting
- `test/weave-flow.test.ts` still passes after loop commands are added.
- `test/weave-archive.test.ts` still passes with loop-aware archive gating.
- `test/weave-worktree-changes.test.ts` still passes with loop artifacts present.

## Manual Verification

- Start from `weave prepare docs/`.
- Approve the plan and create a change artifact.
- Run `weave loop-run` and note the returned `loopId`.
- Run `weave loop-status loopId=<loopId>`.
- Run `weave loop-step loopId=<loopId>` only if staged debugging is needed, and confirm:
  - `run.yaml` exists
  - `attempts/<loopId>/attempt-001/` is created
  - `events.jsonl` contains one structured event
- Force a failed verification and confirm loop state moves to `needs_retry` or `blocked`.
- From another session, run `weave loop-stop loopId=<loopId>` and confirm the runner exits through a recorded stop request instead of a blind interrupt.
- Run a successful verification path and confirm loop state can move to `verified`.
- Archive the verified change and confirm archive still works.

## Done Conditions

- A change can enter loop mode without breaking manual mode.
- Each loop run has a stable, human-readable `loopId`.
- Loop retries are bounded by explicit policy.
- Every loop step leaves human-readable attempt artifacts.
- Verifier output is reused, not reinvented.
- The verifier does not directly schedule the next worker action.

## Regression Watchpoints

- `approve-plan phaseId=...` must keep working for manual finalize.
- `weave verify` must remain usable outside loop mode.
- `weave archive` must not allow unverified changes to archive.
- Worktree bootstrap must not drop loop artifacts.
- `loop-stop` must be a semantic stop request, not just a transport interrupt.
