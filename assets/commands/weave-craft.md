---
description: Phase 실행 준비 (실행 컨텍스트 생성)
---

# /weave-craft - Phase 실행 준비

## 개요

`/weave-craft`는 활성 플랜의 Phase를 실행 가능한 상태로 준비합니다.

- 대상 phase 자동 선택(또는 직접 지정)
- phase 상태/실행 계획 로드
- 구현에 필요한 다음 액션 안내

> 이 명령은 과거 자동 루프를 돌리지 않습니다.

## 사용법

```txt
/weave-craft $ARGUMENTS
```

- `$ARGUMENTS` = 선택적 Phase ID (`P1`, `P2` 등)

예시:

```txt
/weave-craft
/weave-craft P1
```

## 내부 호출

```txt
weave command=craft phaseId="$ARGUMENTS"
```

## 권장 흐름

1. `weave command=craft`로 phase 실행 컨텍스트 준비
2. 코드 구현/위임 수행
3. `weave command=verify`로 검증
4. `weave command=approve-plan`으로 phase 확정
