---
description: Weave 워크플로우 초기화 (프로젝트별 1회)
---

# /weave-init - Weave 워크플로우 초기화

## 개요

현재 프로젝트에서 Weave 워크플로우를 사용할 수 있도록 초기화합니다.
**프로젝트당 1회**만 실행하면 됩니다.

---

## 수행 작업

### 1. `.ignore` 파일 설정

프로젝트 루트에 `.ignore` 파일을 생성/수정하여 `.opencode/weave/` 경로를 AI 도구가 탐색할 수 있도록 합니다.

**왜 필요한가?**
- `.gitignore`에 `.opencode/`가 있으면 ripgrep 기반 도구(glob, grep, list)가 PLAN 파일을 찾지 못합니다
- `.ignore` 파일로 이 규칙을 덮어씌워 AI가 접근할 수 있게 합니다
- Git 추적 상태는 변하지 않습니다 (`.gitignore`는 그대로)

**생성할 내용**:
```
# Allow AI tools to access weave plans (overrides .gitignore)
!.opencode/weave/
```

만약 `.ignore` 파일이 이미 있다면, `!.opencode/weave/` 줄만 추가합니다 (중복 방지).

### 2. 디렉토리 구조 생성

```bash
mkdir -p .opencode/weave/plans
```

### 3. `state.yaml` 초기화

`.opencode/weave/state.yaml` 파일을 생성합니다:

```yaml
# Weave Multi-Plan State
# 이 파일은 활성 플랜을 추적합니다
active_plan: null
```

### 4. 기존 PLAN.yaml 마이그레이션 (해당 시)

만약 `.opencode/weave/PLAN.yaml` (구버전 단일 플랜)이 존재하면:
1. 기존 PLAN을 읽어 multi-plan 포맷으로 저장
2. `state.yaml`의 `active_plan`을 해당 플랜으로 설정
3. 기존 PLAN.yaml 삭제 (가능한 경우)

### 5. GDC 연동 점검 및 그래프 동기화

`weave init`은 GDC 연동 상태를 확인합니다.

- `.gdc` 워크스페이스 미감지 시:
  - 안내 메시지 출력 (`gdc init --language <lang>`)
- 감지 + 연동 활성화 시:
  - `gdc version --machine`
  - `gdc sync --machine`
  - `gdc check --machine`
  - `gdc stats --machine`

이 단계는 **정보 제공 및 부트스트랩 목적**이며, 실패해도 Weave 초기화 자체는 완료됩니다.

---

## 완료 메시지

```markdown
## ✅ Weave 초기화 완료!

### 생성된 파일
- `.ignore` — AI 도구 접근 허용 설정
- `.opencode/weave/state.yaml` — 플랜 상태 추적
- `.opencode/weave/plans/` — 플랜 저장 디렉토리

### 다음 단계
프로젝트 계획을 세우려면:
`weave command=prepare docsPath="docs/"`
```

---

## 이미 초기화된 경우

`.opencode/weave/state.yaml`이 이미 존재하면:

```markdown
ℹ️ 이미 Weave가 초기화되어 있습니다.

활성 플랜: {active_plan 또는 "없음"}
전체 플랜 수: {plans/ 내 yaml 파일 수}

상태 확인: `/weave-status`
```

---

## 주의사항

- `.ignore` 파일은 `.gitignore`와 **같은 레벨(프로젝트 루트)**에 생성합니다
- `.ignore`는 Git이 아니라 ripgrep만 참조하므로 Git 추적에 영향 없음
- `.ignore` 파일 자체는 `.gitignore`에 넣지 마세요 (AI가 읽어야 하므로)
