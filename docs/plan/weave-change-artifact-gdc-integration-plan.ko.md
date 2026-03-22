---
title: Weave x Change Artifact x GDC 통합 설계안
status: draft
owner: maskweaver
last_updated: 2026-03-22
---

# Weave x Change Artifact x GDC 통합 설계안

## 1) 목표

목표는 Weave에 변경 단위 산출물 계층을 도입하고, 이를 GDC 그래프와 결합해 다음을 동시에 만족시키는 것이다.

- 변경 의도와 실행 상태를 분리한다.
- 문서 산출물과 실제 영향 코드 사이의 드리프트를 줄인다.
- 기존 Phase/Task 기반 실행 경험은 유지한다.

한 줄 요약:

> Change artifact는 무엇을 바꿀지 정리하고, GDC는 어디를 바꿔야 하는지 연결하며, Weave는 어떻게 실행하고 검증할지 관리한다.

## 2) 핵심 원칙

- 요구사항/변경 truth: `.opencode/weave/changes/<change-id>/`
- 코드 구조 truth: `.gdc/**`
- 실행 상태 truth: `.opencode/weave/state.yaml`, `.opencode/weave/plans/*.yaml`

세 truth를 하나의 파일에 섞지 않는다.

## 3) 제안하는 구조

```text
.opencode/weave/
  state.yaml
  plans/
    <plan>.yaml
  specs/
    <spec>.yaml
  changes/
    <change-id>/
      README.md
      proposal.md
      design.md
      tasks.md
      verify.md
      archive.md
      metadata.yaml
      context/
        gdc-*.md
```

`change-id`는 `<date>-<slug>` 또는 `<plan>-<seq>` 형식을 권장한다.

## 4) 명령 흐름

### `weave prepare`

- active change를 만들거나 선택한다.
- `proposal.md`, `design.md`, `tasks.md` skeleton을 만든다.
- 관련 spec/plan/node를 `metadata.yaml`에 기록한다.

### `weave design`

- phase/task 계획을 갱신한다.
- 각 phase/task에 `changeRefs`, `nodeIds`, `acceptanceRefs`를 연결한다.

### `weave craft`

- active phase의 실행 컨텍스트를 만든다.
- `gdc extract` 결과를 `tasks/context/`와 change `context/` 양쪽에 기록한다.
- 어떤 task가 어떤 change 항목을 만족시키는지 보여준다.

### `weave verify`

- build/test/GDC gate를 실행한다.
- 결과를 `verify.md`와 metadata에 기록한다.
- 통과 시 change 상태를 `verified`로 올린다.

### `weave approve-plan`

- plan approval gate 또는 phase finalize를 담당한다.
- finalize 시 linked change가 요구한 검증 조건을 확인한다.

### 신규 `weave archive`

- `verified` 상태 change만 archive한다.
- canonical spec sync 여부를 확인한다.
- `archive.md`를 남기고 change 상태를 `archived`로 바꾼다.

## 5) 데이터 모델 제안

```ts
interface WeaveTask {
  changeRefs?: string[];
}

interface WeavePlan {
  activeChangeId?: string;
  changeIds?: string[];
}

interface WeaveChangeMetadata {
  id: string;
  title: string;
  status: 'draft' | 'planned' | 'in_progress' | 'verified' | 'archived';
  planName?: string;
  specName?: string;
  phaseIds: string[];
  nodeIds: string[];
  createdAt: string;
  updatedAt: string;
}
```

## 6) 단계별 도입

### M1. Change artifact 계층

- `.opencode/weave/changes/` 추가
- `metadata.yaml` 모델 추가
- `prepare`에서 active change 생성

### M2. GDC linkage

- `prepare/design`에서 node ids를 metadata에 기록
- `craft`에서 change context 생성

### M3. Verify reporting

- `verify.md` 작성
- verify 결과와 상태 전이 기록

### M4. Archive stage

- `weave archive` 명령 추가
- canonical spec sync 규칙 추가

### M5. Worktree/status 정리

- worktree bootstrap 시 active change 포함
- `weave status`에 active/verified/archived changes 노출

## 7) 완료 기준

- `.opencode/weave/changes/` 계층이 도입된다.
- change metadata와 Weave plan/state의 역할이 분리된다.
- phase/task뿐 아니라 change 수준에서도 GDC node link가 추적된다.
- verify와 archive가 분리된 단계로 존재한다.
- 기존 `prepare -> craft -> verify -> approve-plan` UX는 유지된다.
