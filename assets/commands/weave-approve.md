---
description: Phase 승인(완료 처리) + 검증(기본) + 선택적 커밋
---

# /weave-approve - Phase 승인

## 개요

Phase를 "완료"로 처리합니다.

vNext에서 `/weave-approve`는 기본적으로 **검증(verify)** 을 먼저 실행하고,
검증이 통과해야 Phase를 완료 처리합니다.

또한 필요 시, **선택적으로 git commit**까지 한 번에 수행할 수 있습니다.

---

## 사용법

```txt
/weave-approve P1
```

내부적으로 weave tool을 호출합니다:

```txt
weave command=approve phaseId="P1"
```

---

## 옵션

### 1) 검증 우회(권장하지 않음)

```txt
weave command=approve phaseId="P1" skipVerify=true
```

빠르게(typecheck+tests만) 승인 전 검증을 돌리려면:

```txt
weave command=approve phaseId="P1" verifyMode="quick"
```

### 2) 승인 시 커밋까지(옵션)

기본은 "staged changes"만 커밋합니다(안전).

```txt
weave command=approve phaseId="P1" commit=true
```

모든 변경을 자동 stage 후 커밋하려면:

```txt
weave command=approve phaseId="P1" commit=true stageAll=true
```

커밋 메시지를 직접 지정하려면:

```txt
weave command=approve phaseId="P1" commit=true stageAll=true commitMessage="P1: login flow"
```

> 커밋 전에는 secret scan이 실행됩니다. 의심되는 키/토큰이 발견되면 커밋/승인이 차단됩니다.

secret scan 예외/허용 규칙을 추가하려면:

- `.opencode/weave/secret-scan.yaml`
