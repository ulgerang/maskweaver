---
title: Weave vNext Evolution Plan
status: draft
audience: maintainers
last_updated: 2026-02-15
---

# Weave vNext Evolution Plan

목표: 현재 Weave의 사용자 경험(명령 흐름)은 유지하면서, GSD에서 검증된 운영 메커니즘(실행 가능한 계획, 검증 루프, 원자 커밋, 병렬화)을 이식해 `init → spec → plan(design) → craft`가 "진짜로 돌아가는" 개발 엔진이 되도록 강화한다.

핵심 합의사항(이번 문서의 전제):

- `weave init`은 프로젝트 생성 시 1회만 수행한다.
- 기본 사용법(흐름)은 유지한다: `spec → plan → craft`.
- 다만 `spec + plan`을 한 번에 수행하는 단일 명령을 추가해(오케스트레이션) 마찰을 줄인다.
- `git worktree`를 이용해 여러 기능(또는 Phase)을 병렬로 구현 가능하게 만든다.

---

## 1. 배경과 현재 문제

현재 Weave는 문서/커맨드 자산 관점에서는 "Phase 기반 계획 → 실행 → 테스트 루프"를 표방하지만, 실제 엔진 레벨에서 다음 문제가 존재한다.

- Plan 단계가 Phase 목록을 만들지만, craft가 소비할 수 있는 실행 단위(task)가 비거나 모호해지기 쉽다.
- Craft 단계의 build/test 검증이 실제 커맨드 실행이 아니라 로그 수준(placeholder)로 끝나면, "자동 검증" 철학이 붕괴한다.
- `.opencode/` 기반 아티팩트는 일반적으로 git ignore 대상이라, `git worktree`로 병렬 체크아웃을 만들면 Weave 상태/플랜이 worktree에 존재하지 않는 문제가 발생한다.

따라서 vNext는 "명령 이름/흐름"을 바꾸지 않되, 내부를 다음처럼 바꾼다.

- spec/plan 산출물을 craft가 기계적으로 소비할 수 있는 구조로 표준화
- craft를 실제 실행 + 검증 + 재시도 + 기록 루프로 전환
- worktree 생성 시 Weave 아티팩트를 자동으로 bootstrap/copy 하여 init 1회 원칙을 지키면서도 병렬 개발이 가능하도록 함

---

## 2. vNext의 목표/비목표

### 목표

- Weave를 "문서 기반"이 아니라 "실행 가능한 계획 + 검증 가능한 완료 조건" 기반의 엔진으로 만든다.
- `spec → plan → craft`를 계속 쓰되, 기본 경로에서의 입력 부담(명령 2번 + 문서 관리)을 줄인다.
- `git worktree` 기반 병렬 개발을 공식 기능으로 제공한다.
- Weave의 고유 강점(마스크/모델풀/지식베이스)을 GSD 메커니즘 위에 얹어 차별화한다.

### 비목표

- GSD 전체를 그대로 복제/재구현하지 않는다(필요 메커니즘만 선별 이식).
- 모든 병렬 작업을 자동으로 안전하게 만들겠다고 약속하지 않는다(충돌/DB 마이그레이션 등은 정책으로 제한).
- 기존 커맨드를 제거/파괴하지 않는다(새 기능은 additive + 하위호환).

---

## 3. 사용자 경험(UX) 설계

### 3.1 유지되는 기본 흐름

- 1회: `weave init`
- 반복: `weave spec` → `weave design`(= plan) → `weave craft Pn`

### 3.2 추가되는 편의 흐름: spec + plan 통합 오케스트레이션

새 명령(제안 이름): `weave prepare` (alias: `weave blueprint` 가능)

- 목적: 사용자가 "기획 문서"를 준비한 뒤, 한 번의 명령으로 `spec`과 `plan(design)`을 연속 수행
- 동작:
  1. spec 생성/갱신
  2. plan 생성/갱신(Phase + tasks 생성)
  3. 다음 액션 출력: `weave craft P1` 또는 다음 pending phase

원칙:

- 기존 `weave spec`, `weave design`는 계속 남긴다.
- `weave prepare`는 기본 happy-path에서 질문을 최소화하고, 정말 막히는 경우에만 체크포인트로 질문한다.

### 3.3 병렬 개발 흐름: worktree

새 명령군(제안): `weave worktree <subcommand>`

- `weave worktree create <name> [--from active|<plan>]`
- `weave worktree list`
- `weave worktree open <name>` (경로 출력)
- `weave worktree merge <name>` (메인 worktree에서 병합 가이드/자동화)
- `weave worktree remove <name>`

사용자 원칙:

- 사용자는 `weave init`을 worktree마다 반복하지 않는다.
- worktree 생성 시 Weave bootstrap을 자동 수행한다(아래 6장 참조).

---

## 4. 아티팩트(파일/디렉토리) 설계

Weave는 두 종류의 아티팩트를 다룬다.

1) 실행/상태(런타임) 아티팩트: worktree별로 독립적이어도 무방
2) 스펙/계획(설계) 아티팩트: worktree에 복제되어야 craft가 바로 가능

### 4.1 기본 저장 위치(현행 유지)

- `.opencode/weave/state.yaml`
- `.opencode/weave/plans/*.yaml`
- `.opencode/weave/specs/*.yaml`

vNext에서도 기본 위치는 유지한다(하위호환).

### 4.2 worktree를 위한 복제/부트스트랩 정책

worktree를 생성할 때, 아래를 "복제 또는 생성"해야 한다.

- `.opencode/weave/` 디렉토리 구조
- 활성 plan 파일(선택): `.opencode/weave/plans/<active>.yaml`
- 관련 spec 파일(선택): `.opencode/weave/specs/<spec>.yaml`
- AI 접근을 위한 ignore override 파일(프로젝트 정책에 따라): `.ignore` 또는 OpenCode가 요구하는 파일

복제 전략 옵션:

- (기본) `--from active`: 메인 worktree의 active plan/spec를 새 worktree로 복사
- (선택) `--from <plan>`: 특정 plan만 복사
- (선택) `--empty`: 빈 weave 상태로 시작(새 기능 탐색용)

### 4.3 레지스트리(추적용)

worktree 관리 편의를 위해 레지스트리 파일을 둔다(기본은 로컬/ignore 가능).

- `.opencode/weave/worktrees.yaml`
  - name, path, branch, base, created_at, assigned_port(optional), notes

---

## 5. 데이터 모델(스키마) 강화: plan이 craft를 구동하도록

현재 Weave의 craft는 `phase.tasks`를 중심으로 계획을 만들 수 있어야 한다.
vNext에서는 plan 단계가 "Phase만" 만드는 것이 아니라 "실행 가능한 task"까지 생성하도록 강화한다.

### 5.1 WeaveTask 확장(제안)

기존(`id,name,status,testCase,...`)에 아래를 추가한다.

- `files`: string[]
  - 이 task가 수정/생성할 파일(또는 glob). 병렬/충돌 분석에 필요
- `dependsOn`: string[]
  - 같은 phase 내 task 의존성
- `verify`: { kind: 'command' | 'checklist'; value: string }[]
  - 검증 커맨드 또는 체크
- `acceptanceRefs`: string[]
  - 어떤 AC를 만족시키는지(예: `AC-3`, `AC-login-01`)
- `autonomous`: boolean
  - AI가 독립 수행 가능한지(체크포인트인지)
- `commit`: { enabled: boolean; message?: string; scope?: 'code' | 'docs' }

주의: 스키마 변경은 YAML repair/validate 로직과 함께 들어가야 하며, 하위호환을 위해 누락 시 기본값으로 처리한다.

### 5.2 PhaseExecutionPlan과 wave

GSD의 execute-phase는 wave(병렬 실행 단위)를 가진다.
Weave는 아래 중 하나를 선택한다.

- 옵션 A: Weave plan에 `wave` 필드를 도입하고, craft가 wave별로 병렬 실행(추천)
- 옵션 B: 기존 `bridge.ts`의 DAG/wave 분석을 계속 쓰되, plan이 `files/dependsOn`를 제공하여 분석 정확도를 높임

---

## 6. Craft 실행 엔진 강화(실제 구현 + 테스트 루프)

vNext craft의 핵심은 "계획 출력"이 아니라 "실행 + 검증 + 기록"이다.

### 6.1 표준 실행 루프(제안)

Phase Pn에 대해:

1. phase 상태를 `in_progress`로 변경
2. task를 wave 순서대로 실행
3. 각 task는 다음을 따른다
   - 구현(코드 변경)
   - verify 실행(커맨드)
   - 실패 시: 지식베이스 검색 → 마스크 로테이션 → 재시도(maxRetries)
   - 성공 시: 원자 커밋(옵션/정책)

vNext 구현(1차):

- `weave craft`에 task loop를 내장하여 상태 업데이트 + (옵션)quick verify/commit을 수행한다
- phase 완료 시 `weave craft`가 내부적으로 full verify + 완료 처리를 수행한다
4. phase 레벨 검증(필수 AC 커버리지 중심)
5. handoff(유저 체크리스트) 출력

### 6.2 검증 레이어(실행 커맨드 실제 수행)

`build/test`는 placeholder가 아닌 실제 실행으로 전환한다.

핵심 원칙: Weave는 `npm run build/test` 같은 단일 생태계(웹) 가정에 의존하지 않고,
프로젝트 루트의 증거(예: `go.mod`, `Cargo.toml`, `pyproject.toml`, `package.json`, `*.sln`)를 기반으로
**검증 커맨드를 추천/실행**한다.

- Node(웹/백엔드/CLI 공통)
  - package manager 자동 감지: `npm|pnpm|yarn|bun`
  - `package.json`의 `scripts` 기반으로 `lint/typecheck/build/test`를 선택(없으면 스킵)
- Go
  - `go build ./...`, `go test ./...`, `go vet ./...`
- Rust
  - `cargo check`, `cargo test` (옵션: `cargo clippy -- -D warnings`)
- Python
  - 실행기 prefix 감지: `poetry run` / `uv run` / `pipenv run` (없으면 생략)
  - 테스트: `pytest` 또는 `python -m unittest` (증거 기반)
  - 옵션: `ruff`, `mypy`
- .NET
  - `dotnet build`, `dotnet test`
- E2E(옵션)
  - Web 프로젝트에서만: Playwright 설치/브라우저 설치 체크 후 `playwright test`

정책:

- 기본은 빠른 레이어부터(타입체크/유닛) 실패-조기 종료
- E2E/스크린샷/접근성은 opt-in

### 6.3 원자 커밋(선택이지만 권장)

GSD식 "작게 자주"를 Weave에도 도입한다.

- task 단위로 커밋
- 커밋 메시지는 Weave가 생성하되, 최소 규칙을 둔다
  - `feat(weave): ...`, `fix(weave): ...`, `test: ...`, `docs: ...` 등
- 비밀키/민감정보 검사(간단한 정규식 기반) 1차 방어를 커밋 전 단계에 둔다

---

## 7. git worktree 병렬 개발 설계

### 7.1 언제 worktree를 쓰나

- 서로 다른 기능/Phase를 동시에 진행하고 싶을 때
- 파일 충돌 가능성이 높은 병렬 편집을 피하고 싶을 때(각자 별도 작업 디렉토리)
- 각 기능이 독립적으로 테스트/빌드가 필요할 때

### 7.2 언제 worktree를 피해야 하나(정책)

- 동일 파일/동일 영역을 두 작업이 수정하는 것이 계획 단계에서 감지되는 경우
- DB 마이그레이션/스키마 변경을 병렬로 진행하는 경우(원칙적으로 순차)
- 공통 설정 파일(예: package-lock, tsconfig) 변경이 예상되는 경우(병렬 금지 또는 엄격한 분리 필요)

### 7.3 worktree 생성/부트스트랩

`weave worktree create <name>` 수행 시:

1) `git worktree add -b <branch> <path> <base>`
2) worktree 내부에 `.opencode/weave` 부트스트랩
   - (기본) 메인 worktree의 active plan/spec 복사
   - 또는 `--empty`
3) 포트 할당(옵션)
   - dev server 충돌 방지를 위해 registry에 port 저장

### 7.4 병합 전략

- 메인 worktree에서 순차 merge(충돌 해결 + 통합 테스트 1회)
- `weave worktree merge <name>`는 다음을 가이드 또는 자동 실행
  - `git merge <branch>`
  - 통합 검증 커맨드 실행
  - 성공 시 `worktree remove` 안내

---

## 8. spec + plan 통합 명령(weave prepare) 상세

### 입력

- docs 경로(선택): 기존 `weave design [docsPath]`와 동일 패턴
- 또는 "이번에 만들 기능"에 대한 짧은 설명(문서 없이 시작)

### 출력

- spec 파일 경로
- plan 파일 경로(또는 active plan)
- 생성/수정된 Phase 목록
- 다음 실행 명령: `weave craft Pn`

### 체크포인트 규칙

- 스펙에 필수 결정이 없으면 자동 진행
- 필수 결정이 있으면 최소 질문만 하고, 답을 받으면 이어서 plan까지 진행

---

## 9. 구현 로드맵(vNext 개발 단계)

### M0: 문서/스키마 확정

- vNext 스키마(WeaveTask 확장, spec->plan 매핑) 확정
- 하위호환/마이그레이션 정책 확정

### M1: `weave prepare` 추가(오케스트레이션)

- spec → plan을 순차 실행
- 기존 명령 유지

성공 기준:

- 한 번의 명령으로 spec/plan 생성 완료
- 다음 액션으로 craft가 안내됨

### M2: plan이 "실행 가능한 tasks"를 생성

- Phase에 task 생성(파일/검증/AC 참조 포함)
- 간단한 plan checker(모호한 task/AC 미커버/과대 task 감지)

성공 기준:

- craft가 빈 execution plan을 내지 않음
- must AC가 task에 매핑됨

### M3: craft 검증 루프를 실제 실행으로 전환

- build/unit 커맨드 실제 실행
- 실패 시 재시도/지식베이스/마스크 로테이션

성공 기준:

- craft가 실패를 감지하고 원인을 출력함
- 성공 시 "검증 리포트" 생성

### M4: 원자 커밋 + 최소 secret scan

- task 단위 커밋 옵션
- 커밋 전 민감정보 검사

vNext 구현(1차):

- phase 자동 완료 경로에 옵션으로 commit 기능을 추가한다(기본값은 off)
- commit 직전에 staged 파일 목록을 대상으로 secret scan을 수행한다
- 안전 기본값: staged가 없으면 커밋을 거부하고 `stageAll=true` 또는 수동 staging을 요구한다

### M5: worktree 명령군 추가

- create/list/open/merge/remove
- bootstrap/copy 정책 구현

성공 기준:

- 2개 worktree에서 동시에 `weave craft` 수행 가능
- 메인에서 merge 후 통합 검증 가능

---

## 10. 리스크와 대응

- plan/status 파일 merge 충돌
  - 대응: `.opencode/weave`는 기본적으로 로컬 상태로 두고, worktree에는 복사만 수행(병합 대상 아님)
- 병렬 개발 시 코드 충돌
  - 대응: task의 `files` 기반으로 사전 충돌 감지 + 정책상 병렬 금지 영역 정의
- test 실행 시간 증가
  - 대응: 레이어 분리(빠른 검증 먼저), e2e opt-in

---

## 11. 오픈 이슈(결정 필요)

- spec/plan 아티팩트를 git에 커밋할 것인가?
  - 옵션 1: `.opencode/weave` 유지(로컬)
  - 옵션 2: `.planning/weave` 또는 `weave/` 같은 tracked 디렉토리 병행(공유/병합 용이)
- worktree 기본 경로 규칙(레포 외부/내부)
- merge 전략(merge vs squash vs PR) 기본값

---

## Appendix A. 추천 기본 명령 세트(최종 형태)

- `weave init` (1회)
- `weave prepare [docs/]` (새로 추가)
- `weave spec ...` (기존 유지)
- `weave design [docs/]` (기존 유지, alias로 `weave plan` 제공 가능)
- `weave craft Pn` (강화)
- `weave verify` (새로 추가: 프로젝트 유형 자동 감지 기반 build/test 검증)
- `weave status / switch / repair` (기존 유지)
- `weave worktree ...` (새로 추가)
