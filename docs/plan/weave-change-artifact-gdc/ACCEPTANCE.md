# Acceptance

## 자동 검증

- `npx vitest run test/weave-flow.test.ts`
- `npx vitest run test/weave-verification-commands.test.ts`
- `npx vitest run test/weave-archive.test.ts`
- `npx vitest run test/weave-worktree-changes.test.ts`

## 완료 기준

- `weave prepare` 또는 `weave design` 후 `.opencode/weave/changes/<change-id>/`가 생성된다.
- `weave verify` 후 `verify.md`가 갱신되고 change 상태가 `verified`가 된다.
- `weave archive`는 verified change만 처리하고 `archive.md`를 남긴다.
- worktree bootstrap 시 active change artifact가 함께 복제된다.
- 기존 Weave UX와 상태 모델은 유지된다.
