# Tasks

## Phase 1: Change artifact 계층

- [ ] `src/weave/types.ts`에 `WeaveChangeMetadata`, `changeRefs`, `activeChangeId`, `changeIds`를 추가한다.
- [ ] `test/weave-flow.test.ts`에 prepare 시 active change folder와 metadata가 생성되는 실패 테스트를 추가한다.
- [ ] `src/weave/change-artifacts.ts`를 만들고 skeleton 생성과 metadata read/write를 분리한다.
- [ ] `src/plugin/tools/weave.ts`의 `prepare/design/status` 경로에서 change artifact 유틸을 호출하도록 연결한다.

## Phase 2: Prepare/Design/Craft linkage

- [ ] `test/weave-flow.test.ts`에 `nodeIds/changeRefs` linkage 실패 테스트를 추가한다.
- [ ] `src/weave/stages/plan.ts`에서 task 생성 시 change reference를 심는다.
- [ ] `src/weave/stages/execute.ts`에서 `gdc extract` 결과를 `changes/<id>/context/`에도 기록한다.
- [ ] `src/plugin/tools/weave.ts`의 `craft` 결과에 active change와 context 경로를 출력한다.

## Phase 3: Verify reporting

- [ ] `test/weave-flow.test.ts`와 `test/weave-verification-commands.test.ts`에 `verify.md`와 `change_status=verified` 테스트를 추가한다.
- [ ] `src/plugin/tools/weave.ts`와 `src/weave/stages/execute.ts`에서 verify 결과를 change artifact에 기록한다.
- [ ] verified 상태 전이를 metadata에 기록한다.

## Phase 4: Archive stage

- [ ] `test/weave-archive.test.ts`를 만들고 `weave archive` 실패 테스트를 먼저 쓴다.
- [ ] `src/weave/stages/archive.ts`를 만들고 archive 처리 로직을 구현한다.
- [ ] `src/plugin/tools/weave.ts`에 `archive` 명령과 help/status 반영을 추가한다.

## Phase 5: Worktree and status UX

- [ ] `test/weave-worktree-changes.test.ts`를 만들고 worktree bootstrap 시 active change 복제 테스트를 쓴다.
- [ ] `src/weave/worktree.ts`에 `.opencode/weave/changes/` bootstrap 정책을 추가한다.
- [ ] `src/plugin/tools/weave.ts`의 `status`에 active/verified/archived changes를 추가한다.
