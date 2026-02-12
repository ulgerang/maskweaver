---
description: Weave 워크플로우 도움말
---

# /weave-help - Weave 워크플로우 도움말

## Weave란?

Maskweaver의 **Phase-Driven Development** 워크플로우입니다.
"AI가 검증하고, 유저가 확인한다"

**멀티 플랜**: 하나의 프로젝트에서 여러 플랜을 동시에 관리할 수 있습니다.

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
| `/weave-spec [docs]` | 요구사항 정제 → 검증 기준 추출 (선택) |
| `/weave-design [docs]` | 요구사항 분석 → Phase 계획 (새 플랜 생성) |
| `/weave-craft [phase-id]` | 활성 플랜의 Phase 실행 (자동 검증) |
| `/weave-status` | 전체 플랜 목록 + 진행 상황 |
| `/weave-switch [plan]` | 활성 플랜 전환 / 아카이브 |
| `/weave-help` | 이 도움말 |

---

## 멀티 플랜 워크플로우

```
/weave-init                    ← 프로젝트 초기화 (1회)
    ↓
/weave-spec docs/              ← 요구사항 정제 + 검증 기준 추출 (선택)
    ↓
/weave-design docs/            ← 첫 번째 플랜 생성
    ↓                            (spec이 있으면 자동 연동)
/weave-craft P1                ← Phase 실행 + 검증 기준 확인
/weave-craft P2
    ↓
/weave-design wiki/new-feat    ← 두 번째 플랜 추가
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
│   └── emotion-diary.yaml   ← 요구사항 명세
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
2. Unit Tests
3. Acceptance Criteria (e2e, integration, performance 등)

---

## 빠른 시작

```bash
# 1. 초기화 (프로젝트당 1회)
/weave-init

# 2. (선택) 요구사항 정제 — 복잡한 프로젝트에서 권장
/weave-spec docs/

# 3. 실행 계획 수립
/weave-design docs/       # 또는 /weave-design emotion-diary (스펙 기반)

# 4. 피드백 → 승인
"좋아, 진행해"

# 5. Phase 실행 (검증 기준 자동 확인)
/weave-craft P1

# 6. 반복
/weave-craft P2 ...

# 7. 새 기능 추가? 새 플랜!
/weave-design docs/new-feature

# 8. 플랜 사이 전환
/weave-switch emotion-diary
```
