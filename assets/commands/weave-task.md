---
description: Phase 내 Task 상태 업데이트 + (옵션)검증/커밋
---

# /weave-task - Task 루프

## 개요

Weave phase의 task 상태를 업데이트합니다.

- task를 시작/실패/재시도/통과 처리
- 통과 처리 시 옵션으로 **빠른 검증(quick verify)** 과 **원자 커밋**을 함께 수행할 수 있습니다

이 커맨드는 `weave craft`가 만든 실행 계획을 "실제로 굴리는" 루프용입니다.

---

## 기본 사용 패턴

### 1) Task 목록

```txt
weave command=task phaseId="P1" taskAction=list
```

### 2) 다음 Task

```txt
weave command=task phaseId="P1" taskAction=next
```

### 3) 시작

```txt
weave command=task phaseId="P1" taskAction=start taskId="P1-T1"
```

### 4) 실패 기록(힌트 포함)

```txt
weave command=task phaseId="P1" taskAction=fail taskId="P1-T1" taskError="<error message>" projectType="go"
```

### 5) 재시도

```txt
weave command=task phaseId="P1" taskAction=retry taskId="P1-T1"
```

### 6) 통과 처리(권장: quick verify)

```txt
weave command=task phaseId="P1" taskAction=pass taskId="P1-T1" verify=true verifyMode="quick"
```

원자 커밋까지 한 번에(옵션):

```txt
weave command=task phaseId="P1" taskAction=pass taskId="P1-T1" verify=true verifyMode="quick" commit=true
```

스테이징이 안 돼 있으면 커밋은 거부됩니다. 전체를 자동 stage 하려면:

```txt
weave command=task phaseId="P1" taskAction=pass taskId="P1-T1" verify=true verifyMode="quick" commit=true stageAll=true
```

> 커밋 전에는 secret scan이 실행됩니다(High severity 발견 시 차단).
