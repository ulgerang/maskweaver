---
description: Phase 내 Task 상태 업데이트 + (옵션)검증/커밋
---

# /weave-task - Task 루프

## 개요

Weave phase의 task 상태를 업데이트합니다.

- task를 시작/실패/재시도/통과 처리
- 통과 처리 시 옵션으로 **빠른 검증(quick verify)** 과 **원자 커밋**을 함께 수행할 수 있습니다
- `taskAction=auto`로 반자동 루프를 돌릴 수 있습니다(시작 → 구현 대기 → 검증/통과)

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

### 2.5) 자동 루프 (추천)

```txt
weave command=task phaseId="P1" taskAction=auto verify=true verifyMode="quick"
```

- pending/failed task를 자동으로 시작(in_progress)합니다.
- 시작 직후에는 구현 대기 상태로 멈춥니다(코드 수정/에이전트 위임 후 재실행).
- in_progress task에서는 quick verify를 실행하고 통과 시 pass 처리합니다.
- 검증 실패/커밋 실패/변경 없음이면 해당 task에서 멈추고 다음 액션을 안내합니다.

### 3) 시작

```txt
weave command=task phaseId="P1" taskAction=start taskId="P1-T1"
```

> `start`는 상태만 `in_progress`로 바꿉니다. 실제 코드 수정은 구현 작업(유저/에이전트)에서 수행해야 합니다.

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
