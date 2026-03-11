---
description: 전체 플랜 목록 및 진행 상황 확인
---

# /weave-status - 진행 상황 확인

## 개요

전체 플랜 목록과 활성 플랜의 Phase 진행 상황을 확인합니다.

**사용법**:
- `/weave-status` — 전체 개요 (모든 플랜 + 활성 플랜 상세)
- `/weave-status $ARGUMENTS` — 특정 플랜 또는 Phase 상세
  - `$ARGUMENTS` = 플랜 이름 (예: `emotion-diary`)
  - `$ARGUMENTS` = Phase ID (예: `P2`, 활성 플랜의 Phase)

---

## 데이터 로드 방법 (필수)

**반드시 이 순서로 파일을 읽어야 합니다**:

```
1. .opencode/weave/state.yaml 읽기 → active_plan 확인
2. .opencode/weave/plans/ 디렉토리의 모든 .yaml 파일 목록 확인
3. 각 플랜 파일 읽어서 상태 집계
```

**state.yaml이 없는 경우**:
```markdown
📋 Weave가 초기화되지 않았습니다.

시작하려면: `/weave-init`
```

**플랜이 하나도 없는 경우**:
```markdown
📋 아직 플랜이 없습니다.

새 플랜을 만들려면: `/weave-design [docs-path]`
```

---

## 출력: 전체 개요 (`/weave-status`)

```markdown
## 📊 Weave 상태

### 활성 플랜: `emotion-diary`
**감정 일기 앱** — 진행률 40%

[████████░░░░░░░░░░░░] 2/5

| Phase | 이름 | 상태 | 마스크 |
|-------|------|------|--------|
| P1 | 감정 선택 UI | ✅ 완료 (2.5h) | kent-beck, dan-abramov |
| P2 | 감정 저장 | 🔄 진행 중 | kent-beck |
| P3 | 히스토리 뷰 | ⏳ 대기 | |
| P4 | 통계 시각화 | ⏳ 대기 | |
| P5 | 테마 설정 | ⏳ 대기 | |

**다음**: `/weave-craft P2`

---

### 전체 플랜 목록

| 플랜 | 프로젝트 | 상태 | 진행률 |
|------|---------|------|--------|
| 📌 `emotion-diary` | 감정 일기 앱 | active | 40% (2/5) |
| `todo-app` | Todo 앱 | paused | 60% (3/5) |
| `auth-module` | 인증 모듈 | completed | 100% (4/4) |

플랜 전환: `/weave-switch [플랜이름]`
```

---

## 출력: 특정 플랜 상세 (`/weave-status {plan-name}`)

```markdown
## 📊 플랜: `todo-app`

**Todo 앱** — 상태: paused — 진행률 60%

[████████████░░░░░░░░] 3/5

### 비전
사용자가 간단하게 할 일을 관리할 수 있는 웹 앱

### Phases
| Phase | 이름 | 상태 | 소요 시간 | 마스크 |
|-------|------|------|----------|--------|
| P1 | 기본 UI | ✅ 완료 | 2h | dan-abramov |
| P2 | CRUD API | ✅ 완료 | 3h | martin-fowler |
| P3 | 필터/정렬 | ✅ 완료 | 1.5h | kent-beck |
| P4 | 드래그 정렬 | ⏳ 대기 | | |
| P5 | PWA 지원 | ⏳ 대기 | | |

### 아키텍처
- Frontend: React + TypeScript
- Backend: Express.js
- Database: SQLite

이 플랜으로 전환: `/weave-switch todo-app`
```

---

## 출력: 특정 Phase 상세 (`/weave-status P2`)

활성 플랜의 해당 Phase를 상세 표시:

```markdown
## Phase P2: 감정 저장

**플랜**: `emotion-diary`
**상태**: 🔄 진행 중
**시작**: 2026-02-06 10:30
**경과**: 1.5시간

### 사용된 마스크
- Kent Beck

### 발생한 이슈
- 1회 재시도: JSON 직렬화 오류 → 해결됨

### 다음
`/weave-craft P2` — 계속 진행
```

---

## 상태 아이콘

| 아이콘 | 상태 |
|--------|------|
| ✅ | 완료 (completed) |
| 🔄 | 진행 중 (in_progress) |
| ⏳ | 대기 (pending) |
| 🚫 | 차단됨 (의존성 미완료) |
| 📌 | 활성 플랜 표시 |
| ⏸️ | 일시정지 (paused) |

---

## 플랜 상태 종류

| 상태 | 의미 |
|------|------|
| `active` | 현재 작업 중인 플랜 |
| `paused` | 일시 중단 (다른 플랜 작업 중) |
| `completed` | 모든 Phase 완료 |
| `archived` | 보관됨 (목록에서 숨김, --all로 표시) |
