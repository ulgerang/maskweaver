# Context

## 현재 동작

- 실행 상태: `.opencode/weave/state.yaml`, `.opencode/weave/plans/*.yaml`
- 스펙/보조 문서: `.opencode/weave/specs/`, `tasks/research.md`, `tasks/todo.md`
- GDC 연계: `prepare`, `craft`, `verify`, `status`, `worktree`

## 현재 문제

- change-level 산출물이 없어 변경 의도와 실행이 약하게 연결된다.
- verify 이후 canonical spec sync와 archive 단계가 분리되어 있지 않다.
- worktree는 병렬 실행 경계인데 문서 산출물은 아직 공용 파일 중심이다.

## 구현 제약

- 기존 Weave UX는 유지해야 한다.
- `.opencode/weave/plans/*.yaml`과 `state.yaml`은 계속 실행 상태의 truth여야 한다.
- GDC가 없는 프로젝트에서도 기존 Weave가 깨지면 안 된다.
