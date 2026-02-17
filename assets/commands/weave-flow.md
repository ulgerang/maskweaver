---
description: 원커맨드 실행 (prepare -> craft -> task auto)
---

# /weave-flow - 원커맨드 실행

## 개요

`/weave-flow`는 Weave의 기본 경로를 한 번에 실행합니다.

- `prepare` (필요 시): spec + plan 생성
- `craft`: 실행 대상 phase 준비
- `task auto`: 현재 task 자동 루프 진입

> 목표: 유저가 명령을 여러 번 기억하지 않고, 한 번의 호출로 바로 실행 흐름에 진입하도록 합니다.

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

---

## 다음 단계

- 구현을 반영한 뒤 `/weave-flow`를 다시 실행하면 같은 phase/task에서 이어서 진행합니다.
- 모든 task가 끝나면 `/weave-approve`로 완료 처리하세요.
