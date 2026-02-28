---
description: 원커맨드 실행 (prepare -> approve-plan gate -> craft auto-loop + auto finalize)
---

# /weave-flow - 원커맨드 실행

## 개요

`/weave-flow`는 Weave의 기본 경로를 한 번에 실행합니다.

- `prepare` (필요 시): research + spec + plan 생성
- `refine-plan` (선택): `tasks/plan-notes.md` 지시문 반영
- `plan gate`: 실행 전 계획 품질 점검 (task 분해/테스트/검증 커버리지)
- `approval gate`: `approve-plan` 전에는 구현 단계로 내려가지 않음
- `craft`: 실행 대상 phase 준비 + 자동 task 루프 실행
- `craft auto-loop` 내 반복 실패 시 re-plan 서브태스크 자동 생성
- `craft` 마지막에 phase 목표 체크 + full verify + auto finalize

> 목표: 유저가 명령을 여러 번 기억하지 않고, 한 번의 호출로 실행 흐름에 진입하되,
> 구현 전 승인 게이트는 반드시 지키도록 합니다.

---

## 사용법

```txt
/weave-flow $ARGUMENTS
```

`$ARGUMENTS`는 선택 사항:
- 문서 경로 (예: `docs/`, `wiki/spec.md`)를 넘기면 prepare부터 시작
- 비우면 기존 active plan을 재사용

---

## 내부 호출

문서 경로가 있을 때:

```txt
weave command=flow docsPath="$ARGUMENTS"
```

문서 경로 없이 이어서 실행할 때:

```txt
weave command=flow
```

기본 검증 모드는 quick입니다(`verifyMode="quick"`).

> 참고: plan이 아직 승인되지 않았다면 flow는 approval gate에서 멈추고
> `weave command=approve-plan` 실행을 안내합니다.

## 산출물

- `tasks/todo.md`: 현재 plan/phase/task 체크리스트 + 최근 리뷰
- `tasks/lessons.md`: 실패 패턴과 재발 방지 규칙 기록

---

## 다음 단계

- 구현을 반영한 뒤 `/weave-flow`를 다시 실행하면 같은 phase/task에서 이어서 진행합니다.
- 모든 task가 끝나면 craft가 자동으로 finalize를 수행합니다.
