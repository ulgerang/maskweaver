---
description: Task 루프 자동 실행 (phase/task 인자 최소화)
---

# /weave-task-auto - Task 자동 루프

> 처음부터 한 번에 실행하려면 `/weave-flow [docs]`를 사용하세요.

## 사용법

```txt
/weave-task-auto $ARGUMENTS
```

`$ARGUMENTS`는 다음 중 하나:
- `P1` (phaseId)
- `P1-T1` (taskId, phase는 자동 추론)
- 비워도 됨 (현재 active phase 사용)

---

## 실행 규칙

1. 인자가 `P#-T#`면 phaseId를 자동 추론해서 auto 루프 시작
2. 인자가 `P#`면 해당 Phase에서 auto 루프 시작
3. 인자가 없으면 active phase에서 auto 루프 시작

항상 quick verify를 켠 상태로 실행:

```txt
weave command=task taskAction=auto verify=true verifyMode="quick"
```

동작 메모:
- pending/failed task는 `in_progress`로 전환하고 구현 대기 상태로 멈춥니다.
- 이미 `in_progress`인 task는 검증/통과를 시도합니다.

예시:

```txt
# Phase 기준
weave command=task phaseId="P1" taskAction=auto verify=true verifyMode="quick"

# Task ID 하나만 넘겨도 동작 (phase 자동 추론)
weave command=task taskId="P1-T1" taskAction=auto verify=true verifyMode="quick"
```
