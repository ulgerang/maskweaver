# Tasks

## Phase 1: Loop State Model

- [ ] Extend `src/weave/types.ts` with loop run fields and explicit `loopId` support.
- [ ] Add a failing test in `test/weave-loop.test.ts` for rule-based string `loopId` generation.
- [ ] Add a failing test in `test/weave-loop.test.ts` for creating `run.yaml`, `stop.json`, `events.jsonl`, and `attempts/<loopId>/`.
- [ ] Add helpers in `src/weave/change-artifacts.ts` for reading/writing loop artifacts.
- [ ] Add `src/weave/loop-policy.ts` for bounded retry config and progress evaluation.

## Phase 2: Core Loop Commands

- [ ] Add a failing test in `test/weave-loop.test.ts` for `weave loop-run` creating and returning a `loopId`.
- [ ] Add a failing test in `test/weave-loop.test.ts` for `weave loop-start` with an explicit `loopId` override.
- [ ] Add a failing test in `test/weave-loop.test.ts` for `weave loop-step`.
- [ ] Add `src/weave/stages/loop.ts` with controller logic for one bounded iteration.
- [ ] Wire `loop-run`, `loop-start`, and `loop-step` into `src/plugin/tools/weave.ts`.

## Phase 3: Retry Budgeting

- [ ] Add a failing test in `test/weave-loop.test.ts` for no-progress retry detection.
- [ ] Add a failing test in `test/weave-loop.test.ts` for max iteration exhaustion.
- [ ] Add a failing test in `test/weave-loop.test.ts` for `weave loop-stop loopId=...` stop-request handling.
- [ ] Update `src/weave/loop-policy.ts` to compute `continue`, `retry`, `blocked`, and `verified`.
- [ ] Persist retry outcomes into `.opencode/weave/loops/<loopId>/events.jsonl`.

## Phase 4: Loop Run and Status

- [ ] Add a failing test in `test/weave-loop.test.ts` for `weave loop-run` bounded completion.
- [ ] Add a failing test in `test/weave-loop.test.ts` for `weave loop-status loopId=...`.
- [ ] Add a failing test in `test/weave-loop.test.ts` for `weave loop-list`.
- [ ] Update `src/plugin/tools/weave.ts` to expose loop commands and status output.
- [ ] Update `tasks/todo.md` and status summaries to surface `loopId`, retry budget, and last attempt result.

## Phase 5: Archive and Worktree Integration

- [ ] Add a failing test in `test/weave-archive.test.ts` for archive after verified loop completion.
- [ ] Add a failing test in `test/weave-worktree-changes.test.ts` for copying per-loop artifacts.
- [ ] Update `src/weave/stages/archive.ts` to validate loop-complete verified changes.
- [ ] Update `src/weave/worktree.ts` to ensure loop artifacts bootstrap cleanly.
