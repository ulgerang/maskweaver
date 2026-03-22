# Context

## Current Behavior

Current `weave` has:

- plan and phase orchestration
- task-level execution planning
- change artifacts under `.opencode/weave/changes/<change-id>/`
- manual `craft -> verify -> approve-plan -> archive` flow

The next loop layer should not assume one active run per worktree. OpenCode can run multiple sessions in parallel, so the loop model needs explicit, queryable `loopId` values.

Relevant code paths:

- `src/plugin/tools/weave.ts`
- `src/weave/stages/execute.ts`
- `src/weave/orchestrator.ts`
- `src/weave/change-artifacts.ts`
- `src/weave/stages/archive.ts`

## Current Gap

The repository no longer has an internal auto-loop.

Evidence in code:

- `weave.ts` explicitly says the legacy auto loop was removed.
- `runAIVerification()` verifies once and returns.
- `WeaveOrchestrator` plans task execution but does not drive iterative retries.

This means repeated fix/verify cycles are still mostly manual.

## Why a New Loop Is Worth Adding

The repository now has a stronger substrate than before:

- change-scoped artifacts
- verifier output files
- archive state transitions
- GDC context extraction

That is enough to build a safer loop than the previous implicit auto-loop.

## Design Input from Auto Research Analysis

`/E:/works/research/autoresearch_skills_analysis.md` is useful here for four reasons:

- autonomy works better inside clear boundaries
- evaluation should be protocol-driven, not conversational
- logs and append-only state make loops smarter over time
- scripts and artifacts should carry mechanics so the model can focus on judgment

## Key Constraints

- Do not expose external product branding in user-facing Maskweaver docs or commands.
- Do not let verifier and retry planning collapse into one role.
- Do not create an unbounded loop with weak stop conditions.
- Keep manual commands available even after loop mode is added.
- Do not rely on a single implicit active loop when multiple sessions may be running.
