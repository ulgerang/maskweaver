---
description: Weave 워크플로우 도움말
---

# /weave-help - Weave 워크플로우 도움말

## Weave란?

Maskweaver의 **Phase-Driven Development** 워크플로우입니다.
"AI가 검증하고, 유저가 확인한다"

**멀티 플랜**: 하나의 프로젝트에서 여러 플랜을 동시에 관리할 수 있습니다.

---

## 버전 확인

설치된 Maskweaver 버전을 확인하는 방법:

| 방법 | 명령어 |
|------|--------|
| CLI | `maskweaver --version` 또는 `maskweaver -V` |
| npm | `npm list maskweaver` |
| 채팅 내 | `maskweaver_status` 도구 사용 |
| Weave | `/weave help` |
| Node.js | `import { VERSION } from 'maskweaver'` |

---

## 핵심 철학

```
1. 테스트 먼저 (Protect Before Change)
2. 작게 자주 (Small & Often)
3. 동작이 정답 (Working > Perfect)
```

---

## 명령어 목록

| 명령어 | 설명 |
|--------|------|
| `/weave-init` | Weave 초기화 (프로젝트당 1회) |
| `/weave-research [docs]` | 문서+워크스페이스를 깊게 조사하고 `tasks/research.md` 생성 |
| `/weave-spec [docs]` | 요구사항 정제 + 검증 기준(AC) 추출 (선택) |
| `/weave-prepare [docs]` | **research + spec + plan을 한 번에 생성** (큰 계획은 자동 분할) |
| `/weave-refine-plan` | `tasks/plan-notes.md` 지시문을 plan에 자동 반영 |
| `/weave-approve-plan` | 구현 전 계획 승인 게이트 통과 |
| `/weave-flow [docs]` | **원커맨드** prepare → approve-plan gate → craft |
| `/weave-design [docs]` | 요구사항 분석 → Phase 계획 (새 플랜 생성, 큰 계획은 자동 분할) |
| `/weave-plan [docs]` | `/weave-design` 별칭 (호환용) |
| `/weave-craft [phase-id]` | 활성 플랜의 Phase 실행 준비 (실행 컨텍스트 생성) |
| `/weave-status` | 전체 플랜 목록 + 진행 상황 |
| `/weave-switch [plan]` | 활성 플랜 전환 / 아카이브 |
| `/weave-worktree` | git worktree 기반 병렬 작업(기능/Phase) 관리 |
| `/weave-verify` | 빌드/테스트 검증 실행(프로젝트 유형 자동 감지) |
| `/weave-help` | 이 도움말 |

---

## 멀티 플랜 워크플로우

```
/weave-init                    ← 프로젝트 초기화 (1회)
    ↓
/weave-flow docs/              ← (원커맨드) prepare→approve-plan gate→craft
    ↓
/weave-prepare docs/           ← (수동 경로) research+spec+plan 한 번에 생성
    ↓
/weave-refine-plan             ← (선택) plan-notes 기반 자동 정제
    ↓
/weave-approve-plan            ← 구현 전 계획 승인 (필수)
    ↓
/weave-craft                   ← 다음 Phase 자동 선택 실행 준비
    ↓
/weave-design wiki/new-feat    ← 두 번째 플랜 추가 (또는 prepare)
    ↓
/weave-switch first-plan       ← 첫 번째 플랜으로 돌아가기
    ↓
/weave-status                  ← 전체 상황 확인
```

### 플랜 상태 흐름

```
active ──→ paused ──→ active (switch로 전환)
  │                      │
  └──→ completed ──→ archived (switch archive)
                         │
                         └──→ paused (switch unarchive)
```

---

## 파일 구조

```
.opencode/weave/
├── state.yaml           ← 활성 플랜 추적
├── specs/
│   ├── emotion-diary.yaml    ← baseline spec 1
│   └── todo-app.yaml         ← baseline spec 2
└── plans/
    ├── emotion-diary.yaml   ← 플랜 1
    ├── todo-app.yaml        ← 플랜 2
    └── auth-module.yaml     ← 플랜 3
```

---

## Maskweaver 통합 기능

### 마스크 자동 선택

작업 맥락에 따라 전문가 마스크가 자동 선택됩니다:
- 아키텍처 → Martin Fowler
- 테스트 → Kent Beck
- React → Dan Abramov
- 성능 → Linus Torvalds

### 글로벌 지식 공유

트러블슈팅 경험이 프로젝트 간 공유됩니다:
- 에러 발생 시 → 과거 솔루션 검색
- 해결 시 → 새 솔루션 기록

### 다층 자동 검증

Phase 실행 시 자동 검증:
1. TypeCheck → Lint → Build
2. Unit Tests → E2E Tests
3. Screenshot → A11y Check

---

## 빠른 시작

```bash
# 1. 초기화 (프로젝트당 1회)
/weave-init

# 2. (추천) spec + plan을 한 번에 생성
/weave-prepare wiki/

# 3. 계획 검토 후 승인 게이트 통과
/weave-refine-plan   # (선택) notes 반영
/weave-approve-plan

# 4. 다음 Phase 자동 선택 실행
/weave-craft

# 5. 새 기능 추가? 새 플랜!
/weave-design docs/new-feature

# 6. 플랜 사이 전환
/weave-switch emotion-diary
```
