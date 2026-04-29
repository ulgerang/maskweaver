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

| 방법 | 명령어 |
|------|--------|
| CLI | `maskweaver --version` 또는 `maskweaver -V` |
| npm | `npm list maskweaver` |
| 채팅 내 | `maskweaver_status` 도구 사용 |
| Weave | `/weave help` |

---

## 핵심 철학

```
1. 테스트 먼저 (Protect Before Change)
2. 작게 자주 (Small & Often)
3. 동작이 정답 (Working > Perfect)
```

---

## 통합 후 명령어 목록 (v0.9+)

| 명령어 | 설명 |
|--------|------|
| `/weave-init` | Weave 초기화 (프로젝트당 1회) |
| `/weave-map [deep]` | 코드베이스 구조 분석 + GDC 그래프 연동 |
| `/weave-interview [docs]` | 코드베이스 맵 기반 멀티스텝 요구사항 인터뷰 |
| `/weave-prepare [docs]` | **research + spec + plan을 한 번에 생성** (큰 계획은 자동 분할) |
| `/weave-refine-plan` | `tasks/plan-notes.md` 지시문을 plan에 자동 반영 |
| `/weave-approve` | 구현 전 계획 승인 게이트 통과 |
| `/weave-craft [phase-id]` | 활성 플랜의 Phase 실행 준비 (실행 컨텍스트 생성) |
| `/weave-build [action]` | **자율 빌드 루프** — run, status, stop, list, resume, sync |
| `/weave-status` | 전체 플랜 목록 + 진행 상황 |
| `/weave-worktree` | git worktree 기반 병렬 작업 관리 |
| `/weave-verify` | 빌드/테스트 검증 실행 (프로젝트 유형 자동 감지) |
| `/weave-archive` | 검증된 변경사항 아카이브 |
| `/weave-troubleshoot [error]` | 글로벌 지식 검색 / 솔루션 기록 (`--record`) |
| `/weave-repair` | plan YAML 자동 검사 및 수리 |
| `/weave-agents [flags]` | 에이전트 동기화 (`--sync`) / 설정 초기화 (`--init`) |
| `/weave-help` | 이 도움말 |

---

## 워크플로우

```
/weave-init                    ← 프로젝트 초기화 (1회)
    ↓
/weave-prepare docs/           ← research + spec + plan 한 번에 생성
    ↓
/weave-refine-plan             ← (선택) plan-notes 기반 자동 정제
    ↓
/weave-approve                 ← 구현 전 계획 승인 (필수)
    ↓
/weave-craft                   ← 다음 Phase 자동 선택 실행 준비
    ↓
/weave-build                   ← 자율 빌드 루프 실행
    ↓
/weave-verify                  ← 검증
    ↓
/weave-archive                 ← 아카이브
```

---

## 파일 구조

```
.opencode/weave/
├── state.yaml           ← 활성 플랜 추적
├── specs/
│   └── *.yaml           ← baseline spec
└── plans/
    └── *.yaml           ← 플랜
```

---

## 마이그레이션 노트 (v0.9)

| 기존 명령어 | 새 명령어 | 비고 |
|-------------|-----------|------|
| `approve-plan` | `approve` | alias로 v0.9까지 동작 |
| `build-resume` | `build --resume` | alias로 v0.9까지 동작 |
| `loop-run` | `build` | alias로 v0.9까지 동작 |
| `loop-status` | `build --status` | alias로 v0.9까지 동작 |
| `loop-stop` | `build --stop` | alias로 v0.9까지 동작 |
| `loop-list` | `build --list` | alias로 v0.9까지 동작 |
| `loop-sync` | `build --sync` | alias로 v0.9까지 동작 |
| `record` | `troubleshoot --record` | alias로 v0.9까지 동작 |
| `sync-agents` | `agents --sync` | alias로 v0.9까지 동작 |
| `init-config` | `agents --init` | alias로 v0.9까지 동작 |
| `research` | `prepare` | deprecated alias (v0.9 경고) |
| `spec` | `prepare` | deprecated alias (v0.9 경고) |
| `design` | `prepare` | deprecated alias (v0.9 경고) |
| `flow` | `prepare` → `approve` → `craft` | deprecated alias (v0.9 경고) |
