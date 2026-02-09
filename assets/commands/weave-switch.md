---
description: 활성 플랜 전환, 목록 조회, 아카이브
---

# /weave-switch - 플랜 전환

## 개요

멀티 플랜 환경에서 활성 플랜을 전환하거나, 플랜을 관리합니다.

**사용법**:
- `/weave-switch` — 전체 플랜 목록 표시 (선택 UI)
- `/weave-switch $ARGUMENTS`
  - `$ARGUMENTS` = 플랜 이름 → 해당 플랜으로 전환
  - `$ARGUMENTS` = `archive {plan-name}` → 플랜 아카이브
  - `$ARGUMENTS` = `unarchive {plan-name}` → 아카이브 해제

---

## 데이터 로드

```
1. .opencode/weave/state.yaml 읽기 → active_plan 확인
2. .opencode/weave/plans/ 내 모든 .yaml 파일 읽기
3. 각 플랜의 plan_name, project_name, status, phases 집계
```

---

## 플랜 목록 (`/weave-switch` 인자 없음)

```markdown
## 🔀 플랜 전환

### 활성 플랜
📌 `emotion-diary` — 감정 일기 앱 (P2 진행 중, 40%)

### 전환 가능한 플랜
| # | 플랜 | 프로젝트 | 상태 | 진행률 |
|---|------|---------|------|--------|
| 1 | `todo-app` | Todo 앱 | paused | 60% |
| 2 | `auth-module` | 인증 모듈 | completed | 100% |

### 아카이브된 플랜
| 플랜 | 프로젝트 | 완료일 |
|------|---------|--------|
| `old-prototype` | 프로토타입 v1 | 2026-01-15 |

전환하려면: `/weave-switch todo-app`
아카이브 해제: `/weave-switch unarchive old-prototype`
```

---

## 플랜 전환 (`/weave-switch {plan-name}`)

### 수행 작업

1. `.opencode/weave/plans/{plan-name}.yaml` 존재 여부 확인
2. 현재 활성 플랜의 상태를 `paused`로 변경 (active였던 경우)
3. 대상 플랜의 상태를 `active`로 변경
4. `state.yaml`의 `active_plan`을 업데이트

### 출력

```markdown
## ✅ 플랜이 전환되었습니다

📌 `emotion-diary` → `todo-app`

**이전 플랜**: `emotion-diary` (P2 진행 중) → paused
**현재 플랜**: `todo-app` (P4 대기 중) → active

### 현재 상태
[████████████░░░░░░░░] 3/5

다음 Phase: `/weave-craft P4`
돌아가려면: `/weave-switch emotion-diary`
```

### 에러 케이스

**존재하지 않는 플랜**:
```markdown
❌ 플랜 `xyz`를 찾을 수 없습니다.

사용 가능한 플랜:
- `emotion-diary` (active)
- `todo-app` (paused)

전체 목록: `/weave-switch`
```

**이미 활성 플랜인 경우**:
```markdown
ℹ️ `emotion-diary`는 이미 활성 플랜입니다.

상태 확인: `/weave-status`
```

---

## 플랜 아카이브 (`/weave-switch archive {plan-name}`)

### 수행 작업

1. 대상 플랜의 `status`를 `archived`로 변경
2. 활성 플랜이 아카이브되면 → `state.yaml`의 `active_plan`을 `null`로

### 출력

```markdown
## 📦 플랜이 아카이브되었습니다

`old-prototype` → archived

아카이브된 플랜은 `/weave-status`에서 숨겨집니다.
복원하려면: `/weave-switch unarchive old-prototype`
```

### 활성 플랜을 아카이브하려는 경우

```markdown
⚠️ `emotion-diary`는 현재 활성 플랜입니다.

아카이브하면 활성 플랜이 없어집니다.
계속할까요? (예/아니오)
```

---

## 플랜 아카이브 해제 (`/weave-switch unarchive {plan-name}`)

### 수행 작업

1. 대상 플랜의 `status`를 `paused`로 변경
2. 활성 플랜으로 자동 전환하지는 않음 (명시적으로 switch 필요)

### 출력

```markdown
## 📦 아카이브가 해제되었습니다

`old-prototype` → paused

활성 플랜으로 전환하려면: `/weave-switch old-prototype`
```

---

## state.yaml 변경 예시

전환 전:
```yaml
active_plan: "emotion-diary"
```

전환 후:
```yaml
active_plan: "todo-app"
```

플랜 파일 변경:
```yaml
# plans/emotion-diary.yaml
status: "paused"     # active → paused

# plans/todo-app.yaml
status: "active"     # paused → active
```
