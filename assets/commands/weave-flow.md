---
description: 원커맨드 실행 (prepare -> auto-approve -> craft -> verify -> finalize)
---

# /weave-flow - 원커맨드 실행

## 개요

`/weave-flow`는 Weave 기본 경로를 한 번에 실행합니다.

- `prepare` (필요 시): research + spec + plan 생성
- `refine-plan` (선택): `tasks/plan-notes.md` 지시문 반영
- `plan gate`: 실행 전 계획 품질 점검 (구현/테스트/검증 커버리지, 실패 시 경고 후 계속 진행)
- `auto-approve`: flow가 승인 단계를 자동 통과
- `craft`: 실행 대상 phase의 실행 컨텍스트를 준비
- `verify`: 기본 quick 검증 실행
- `finalize`: 검증 통과 시 phase 완료 처리

## 사용법

```txt
/weave-flow $ARGUMENTS
```

- 문서 경로를 넘기면 prepare부터 시작
- 비우면 기존 active plan 재사용

## 내부 호출

```txt
weave command=flow docsPath="$ARGUMENTS"
```

또는:

```txt
weave command=flow
```

## 산출물

- `tasks/todo.md`: 현재 plan/phase 체크리스트 + 최근 리뷰
- `tasks/lessons.md`: 실패 패턴과 재발 방지 규칙 기록

## 다음 단계

- 검증 실패 시 수정 후 `/weave-flow` 또는 `weave command=verify` 재실행
- 진행 상황 확인: `weave command=status`
