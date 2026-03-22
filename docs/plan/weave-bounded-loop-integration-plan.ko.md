---
title: Weave Bounded Loop Integration Plan
status: draft
owner: maskweaver
last_updated: 2026-03-22
---

# Weave Bounded Loop Integration Plan
## 1) Goal

목표는 `weave`에 change 단위의 bounded loop를 도입해서, 구현 에이전트와 검증 에이전트가 분리된 상태로 반복 실행되도록 만드는 것이다.

이 루프는 다음 문제를 해결해야 한다.

- phase를 사람이 수동으로 계속 이어붙여야 하는 운영 마찰
- verifier와 implementer의 역할이 섞일 때 생기는 자기합리화
- 같은 실패를 반복하는 near-stateless retry
- "좋아 보이는 수정"과 "완료 조건 충족"이 섞이는 문제

핵심 요약:

> `weave`의 loop는 무한 자율 실행이 아니라, change artifact를 중심으로 한 bounded autonomy여야 한다.

## 2) Design Inputs

이 설계는 두 축에서 영감을 받는다.

- 현재 `weave` 구조:
  - `.opencode/weave/plans/*.yaml`
  - `.opencode/weave/changes/<change-id>/`
  - `prepare -> craft -> verify -> approve-plan -> archive`
- 기존 분석 문서:
  - `/E:/works/research/autoresearch_skills_analysis.md`

`autoresearch`에서 가져올 핵심 원칙은 다음이다.

- 수정 가능한 표면을 좁힌다.
- 평가 하네스를 닫아둔다.
- iteration 결과를 구조화해서 기록한다.
- 실패한 시도를 다음 입력으로 압축한다.
- keep/discard 기준을 사람이 아니라 protocol이 결정하게 한다.

## 3) Source of Truth

- 실행 상태 truth:
  - `.opencode/weave/state.yaml`
  - `.opencode/weave/plans/*.yaml`
- 변경 산출물 truth:
  - `.opencode/weave/changes/<change-id>/`
- 코드 구조 truth:
  - `.gdc/**`
- loop 상태 truth:
  - `.opencode/weave/loops/<loop-id>/run.yaml`
  - `.opencode/weave/loops/<loop-id>/events.jsonl`
  - `.opencode/weave/changes/<change-id>/loops/<loop-id>.md`
  - `.opencode/weave/changes/<change-id>/attempts/<loop-id>/**`

loop 도입 후에도 phase 완료 truth와 change 완료 truth는 분리한다.

## 4) Operating Model

권장 역할 분리는 4개다.

### Loop Controller

- active change, active phase, latest verify result, retry budget를 읽는다.
- 다음 iteration goal을 만든다.
- verifier 결과에 따라 `continue`, `retry`, `blocked`, `verified`를 결정한다.

### Worker

- 허용된 파일 범위 안에서만 수정한다.
- task/change 목표를 만족하는 코드 변경만 수행한다.
- 결과와 남은 리스크를 attempt 기록으로 남긴다.

### Verifier

- `doneWhen`
- task `verify`
- project verify commands
- GDC gate
- change metadata/state

이 다섯 축만 기준으로 pass/fail을 판정한다.

### Retrospector

- 실패 이유를 짧고 구조화된 형태로 남긴다.
- 다음 worker prompt에 "무엇을 다시 하지 말아야 하는가"를 넣는다.

## 5) Why Verifier Must Not Reassign Directly

`verifier -> 새 worker 직접 재할당` 구조는 직관적이지만, 실제로는 불안정하다.

- acceptance authority와 retry planner가 섞인다.
- verifier가 스스로 기준을 완화할 유인이 생긴다.
- 같은 failure mode가 반복돼도 분리된 memory가 쌓이지 않는다.

따라서 권장 흐름은:

1. worker 실행
2. verifier 판정
3. loop controller가 다음 action 결정
4. 필요하면 새 worker에 재할당

## 6) Proposed Lifecycle

change metadata 상태에 다음 값을 추가한다.

```ts
type WeaveChangeStatus =
  | 'active'
  | 'implementing'
  | 'verifying'
  | 'needs_retry'
  | 'verified'
  | 'archived'
  | 'blocked';
```

권장 전이는 다음과 같다.

```text
active
  -> implementing
  -> verifying
  -> verified
  -> archived

verifying
  -> needs_retry
  -> blocked

needs_retry
  -> implementing
```

## 6.5) Loop ID Model

`loopId`는 opaque UUID보다 사람이 읽을 수 있는 규칙형 문자열이 더 적합하다.

권장 형식:

```text
<change-id>-<phase-id>-<goal-slug>-r<nn>
```

예시:

- `docs-p1-login-fix-r1`
- `docs-p1-login-fix-r2`
- `auth-p2-session-hardening-r1`

원칙:

- 사용자가 읽고 직접 입력할 수 있어야 한다.
- 파일명으로 안전한 slug 형식이어야 한다.
- 중복 시 자동으로 `-r2`, `-r3`처럼 증가해야 한다.
- `changeId`와 `loopId`는 분리한다.

즉, 같은 change에 서로 다른 전략의 loop run이 여러 개 남을 수 있어야 한다.

## 7) Artifact Layout

```text
.opencode/weave/
  loops/
    <loop-id>/
      run.yaml
      stop.json
      events.jsonl

.opencode/weave/changes/<change-id>/
  metadata.yaml
  proposal.md
  design.md
  tasks.md
  verify.md
  archive.md
  loops/
    <loop-id>.md
  attempts/
    <loop-id>/
      attempt-001/
        summary.md
        verify.md
        patch.md
        metrics.yaml
      attempt-002/
        ...
  context/
    ...
```

의미는 이렇다.

- `run.yaml`: loop 실행 상태의 단일 truth
- `stop.json`: semantic stop request 파일
- `events.jsonl`: append-only loop event log
- `loops/<loop-id>.md`: 해당 loop의 operating policy 요약
- `attempts/<loop-id>/`: 해당 loop의 시도별 작업/검증 증거

## 8) Loop Contract

각 loop run은 명시적인 loop contract를 가져야 한다.

`changes/<change-id>/loops/<loop-id>.md`는 최소한 다음을 포함해야 한다.

- target phase ids
- completion contract
- loopId
- allowed file globs
- forbidden paths
- required verification commands
- max iterations
- max consecutive no-progress attempts
- escalation rules

중요한 점은 loop의 목표가 "더 좋아지기"가 아니라 "완료 조건 충족"이라는 것이다.

## 9) Completion Contract

Loop verifier는 자유로운 해석 대신 닫힌 계약을 사용해야 한다.

권장 completion contract:

- phase `doneWhen` 충족
- task-level `verify` 항목 충족
- required project verify commands 통과
- GDC preflight/check 통과
- change metadata가 `verified`로 승격 가능

위 항목 중 하나라도 미충족이면 `verified`로 갈 수 없어야 한다.

## 10) Retry Policy

다음과 같은 bounded retry가 필요하다.

- `maxIterations`
- `maxNoProgress`
- `timeBudgetMinutes`
- `allowedFileBudget`
- `hardBlockOnRepeatedFailure`

progress 판단 기준 예시:

- verify failure category가 바뀌었는가
- failing checks 수가 줄었는가
- acceptance coverage가 늘었는가
- 새로운 GDC/node linkage가 추가됐는가

## 11) Command Surface

권장 명령은 다음과 같다.

### `weave loop-run`

- active change 기준 새 `loopId`를 생성하거나 사용자가 지정한 `loopId`를 사용한다.
- bounded while loop를 시작한다.
- `verified`, `blocked`, stop-request, budget exhaustion 중 하나에서 종료한다.

### `weave loop-start`

- loop contract만 생성한다.
- 초기 budget과 verifier contract를 고정한다.
- 디버깅 또는 staged start가 필요할 때만 사용한다.

### `weave loop-step`

- 특정 `loopId`에 대해 worker 1회만 실행한다.
- verifier 판정
- attempt artifact 기록
- 다음 상태 계산

### `weave loop-status`

- `loopId` 기준 조회가 기본이다.
- current iteration
- last verifier result
- progress summary
- retry budget

### `weave loop-list`

- running, blocked, stopped, verified 상태의 loop 목록을 보여준다.

### `weave loop-stop`

- `loopId`를 명시적으로 받아야 한다.
- 프로세스를 강제 종료하지 않고 stop request를 남긴다.
- loop runner는 iteration 경계에서 이를 감지하고 정상 종료한다.
- stop reason을 기록하고 상태를 `stopping -> stopped` 또는 `blocked`로 전이한다.

## 12) Integration with Existing Weave Flow

기존 명령과의 관계는 이렇게 두는 게 맞다.

- `prepare`:
  - loop skeleton 준비 가능
- `craft`:
  - loop input context 갱신
- `verify`:
  - loop verifier의 수동 실행 경로
- `approve-plan phaseId=...`:
  - phase finalize는 유지
- `archive`:
  - loop 종료 후 최종 아카이브

즉, bounded loop는 기존 flow를 대체하는 게 아니라, `craft/verify` 사이의 반복 실행 계층으로 들어가는 게 맞다.

## 13) Why This Is Better Than the Old Auto Loop

현재 코드에는 "legacy auto loop"가 제거됐다는 흔적이 남아 있다. 그 판단 자체는 맞았다.

이전 방식의 문제:

- verifier와 execution 경계가 약했다.
- 실패 기억이 약했다.
- iteration budget이 명시적이지 않았다.
- 사람이 이해할 수 있는 attempt artifact가 없었다.

새 bounded loop는 다음 차이가 있다.

- change-scoped memory
- explicit verifier contract
- structured attempt logging
- bounded retries
- controller/worker/verifier 분리

## 14) Proposed Delivery Phases

### M1. Loop State and Artifacts

- `loopId` 생성 규칙 도입
- `run.yaml`, `stop.json`, `events.jsonl` 도입
- change별 `loops/<loop-id>.md`, `attempts/<loop-id>/` 도입
- metadata 상태 확장

### M2. Manual Loop Step

- `weave loop-start`
- `weave loop-step`
- verifier result를 attempt artifact로 저장

### M3. Retry and Budgeting

- no-progress detection
- max iteration/time budget enforcement

### M4. Loop Run and Status UX

- `weave loop-run`
- `weave loop-status`
- `weave loop-list`
- `weave loop-stop loopId=...`
- status/todo/change summary 연동

### M5. Archive and Sync Tightening

- verified change만 archive
- canonical spec sync 연결
- blocked/manual-stop reasoning 정리

## 15) Acceptance Criteria

- 각 loop run이 명시적 `loopId`와 loop contract를 가질 수 있다.
- verifier가 worker를 직접 재할당하지 않는다.
- 모든 attempt가 change artifact 아래에 기록된다.
- bounded retry와 stop reason이 `loopId` 기준으로 남는다.
- `verified` 승격은 닫힌 completion contract로만 가능하다.
- 기존 `prepare/craft/verify/archive` 흐름과 공존한다.
