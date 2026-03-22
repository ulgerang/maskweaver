# Weave x Change Artifact x GDC Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Weave에 change artifact 계층과 archive 경로를 도입해 GDC-aware 변경 추적과 spec sync를 안정화한다.

**Architecture:** 기존 Weave의 실행 상태는 `.opencode/weave/state.yaml`과 `plans/*.yaml`에 유지한다. 그 위에 `.opencode/weave/changes/<change-id>/` 계층을 추가해 proposal/design/tasks/verify/archive 산출물을 관리하고, `prepare/design/craft/verify/approve-plan/archive`가 이 계층과 동기화되도록 만든다.

**Tech Stack:** TypeScript, Node.js FS, YAML, Vitest, existing Weave/GDC integration

---

## 구현 방향

### Phase 1. Change artifact 계층 도입

- `.opencode/weave/changes/` 구조 추가
- `metadata.yaml` 모델 추가
- active plan과 active change 연결

### Phase 2. Prepare/Design/Craft linkage

- `prepare/design`에서 change artifact skeleton 생성
- GDC node ids와 change metadata 연결
- `craft`에서 change context와 task linkage 갱신

### Phase 3. Verify reporting 분리

- verify 결과를 `verify.md`와 metadata에 기록
- phase 상태와 change 상태를 함께 갱신

### Phase 4. Archive stage 추가

- `weave archive` 명령 추가
- canonical spec sync 규칙 추가
- `archive.md` 및 metadata 상태 전이 추가

### Phase 5. Worktree/status 정리

- worktree 생성 시 active change bootstrap
- status에 active change/verified/archive 수 노출
