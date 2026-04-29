# Weave 명령어 통합 정리 계획

> **버전**: 1.1 (피드백 반영)  
> **작성일**: 2026-04-29  
> **상태**: 계획 (Draft)  
> **관련 버전**: maskweaver ≥ 0.8.16

---

## 1. 배경

Maskweaver의 `weave` 워크플로우는 지속적으로 기능이 확장되면서 **명령어 과잉**, **기능 중복**, **문서 4중 중복** 문제가 누적되었습니다. 사용자는 OpenCode 내에서 `/weave` 명령어를 입력할 때 30개 이상의 선택지를 마주하게 되며, 유사한 기능의 명령어들이 어떤 차이가 있는지 파악하기 어렵습니다.

또한 동일한 명령어 설명이 `weave.ts` description, `getHelpMessage()`, `slashcommand.ts` BUILTIN_COMMANDS, `assets/commands/*.md`에 각각 하드코딩되어 있어 한 군데를 수정하면 4곳을 동시에 고쳐야 하는 유지보수 부담이 큽니다.

이 문서는 이 문제를 **단계적으로 해결**하기 위한 실행 계획을 정의합니다.

---

## 2. 현재 문제점 분석

### 2.1 기능 중복

| 그룹 | 기존 명령어 | 문제 상황 |
|------|-------------|-----------|
| 계획 수립 | `research`, `spec`, `design`, `prepare` | `prepare`가 이미 research+spec+plan을 한 번에 수행. 4개가 모두 help에 나엶되어 선택 장애 유발 |
| 원커맨드 | `flow` | `prepare` → `approve-plan` → `craft`를 낱개로 실행하는 것과 기능상 동일 |
| 자율 실행 | `build`, `loop-run` | 둘 다 "승인된 plan을 자동 실행"함. `build`는 Ralph-loop, `loop-run`은 bounded loop로 구현만 다르고 사용자 경험은 동일 |
| 재개/동기화 | `build-resume`, `loop-sync`, `loop-poll`, `loop-watchdog`, `loop-operator` | 중단된 작업을 재개/감시하는 명령어가 5개에 달함. `loop-*` 계열이 10개로 과잉 |

### 2.2 문서 4중 중복

같은 명령어 설명이 다음 4곳에 하드코딩되어 있음:

1. `src/plugin/tools/weave.ts`의 `description` 필드 (라인 89)
2. `src/plugin/tools/weave.ts`의 `getHelpMessage()` (라인 3919)
3. `src/plugin/tools/slashcommand.ts`의 `BUILTIN_COMMANDS` (라인 44)
4. `assets/commands/weave-*.md` 파일들

**영향**: 명령어 설명을 수정할 때 4곳을 동시에 수정해야 하며, 누락 시 help와 slash command 설명이 불일치함.

### 2.3 동작하지 않는 "殭屍" 명령어

- ~~`weave-plan`~~: `weave-design`의 별칭이었으나 enum에 없어 동작하지 않음 (이번에 이미 삭제 완료)
- ~~`weave-switch`~~: 플랜 전환 기능이었으나 handler가 없어 동작하지 않음 (이번에 이미 삭제 완료)
- `loop-step`: `weave.ts` enum에는 있으나 `description`에는 없어 사용자가 인지하기 어려움
- `assets/commands/`에 `loop-*`, `troubleshoot`, `record`, `sync-agents`, `init-config` 등의 `.md` 파일이 없어 slash command로는 접근 불가

### 2.4 외부 참조 위험 (신규)

`loop.ts`의 export 함수들이 `weave.ts` 외부에서 참조되는지 분석한 결과:
- **참조 파일**: `src/plugin/tools/weave.ts`와 `src/weave/loop.ts` 자신만
- **외부 호출 없음**: 다른 모듈에서 `loop.ts` 함수를 import/호출하지 않음
- **결론**: `build` 통합 시 `weave.ts`의 entry point만 변경하고, 기존 handler 함수는 그대로 재사용 가능

---

## 3. 목표

1. **명령어 체계를 6개 핵심 + 4개 보조로 단순화**하여 사용자가 한눈에 파악할 수 있게 함
2. **`loop-*` 10개를 `build` 명령어의 서브 옵션으로 통합**하여 중복 제거
3. **문서 Single Source of Truth 구축**: `assets/commands/*.md` + `meta/commands.json`을 유일한 명령어 정의로 하고, 나머지는 런타임에 동적으로 읽어 구성
4. **모든 활성 명령어가 slash command (`/weave-*`)와 tool 명령어 (`weave command=*`) 양쪽에서 동일하게 동작**하도록 일치시킴
5. **하위 호환성 정책 단일화**: v0.9에서는 alias + deprecated 경고, v0.10에서 완전 제거

---

## 4. 설계안

### 4.1 통합 후 명령어 체계

```
분석 → 요구 → 계획 → 승인 → 실행/자율 → 검증 → 아카이브
map   interview prepare approve craft/build verify archive
```

| 단계 | 통합 후 명령어 | 역할 | 대응되는 기존 명령어 |
|------|---------------|------|---------------------|
| 분석 | `map` | 코드베이스 구조 분석 + GDC 연동 | `map` (유지) |
| 요구 | `interview` | 맵 기반 멀티스텝 인터뷰 | `interview` (유지) |
| 계획 | `prepare` | research + spec + plan 한 번에 생성 | `research`, `spec`, `design`, `prepare` 중 `prepare`로 통합 |
| 승인 | `approve` | plan 승인 게이트 | `approve-plan` → `approve`로 단순화 (alias 유지) |
| 실행 | `craft` | 단일 Phase 수동 실행 준비 | `craft` (유지) |
| 자율 | `build` | 자율 빌드 루프 + 상태 확인 + 재개 + 중단 | `build`, `build-resume`, `loop-run`, `loop-start`, `loop-step`, `loop-status`, `loop-stop`, `loop-list`, `loop-sync`, `loop-watchdog`, `loop-poll`, `loop-operator` |
| 상태 | `status` | 전체 진행 상황 | `status` (유지) |
| 검증 | `verify` | 빌드/테스트 검증 | `verify` (유지) |
| 아카이브 | `archive` | 변경사항 아카이브 | `archive` (유지) |
| 지식 | `troubleshoot` | 글로벌 지식 검색 / 기록 | `troubleshoot`, `record`를 `troubleshoot --record`로 통합 |
| 수리 | `repair` | plan YAML 자동 수리 | `repair` (유지) |
| 에이전트 | `agents` | 에이전트 싱크 + 설정 초기화 | `sync-agents`, `init-config`를 `agents --sync`, `agents --init`로 통합 |
| 도움말 | `help` | 도움말 출력 | `help` (유지) |

**제거 대상**: `flow` (prepare + approve + craft를 순차 실행하는 것이므로 `prepare --auto-approve`로 대체), `research`, `spec`, `design`

### 4.2 `build` 명령어 상세 설계

기존 12개(`build`, `build-resume`, `loop-*` 10개)를 하나의 `build` 명령어로 통합합니다.

```
build                    # 자율 빌드 시작 (기존 build / loop-run)
build --status [buildId] # 빌드 상태 확인 (기존 loop-status)
build --stop [buildId]   # 빌드 중단 요청 (기존 loop-stop)
build --list             # 빌드 목록 조회 (기존 loop-list)
build --resume [buildId] # 중단 빌드 재개 (기존 build-resume)
build --sync [buildId]   # 위임된 squad 결과 동기화 (기존 loop-sync)
```

**내부 구현**: `weave.ts`의 switch-case에서 `build` 하나만 남기고, `action` 인자를 추가하여 내부적으로 기존 handler들을 분기 호출. 기존 handler 함수(`handleBuild`, `handleBuildResume`, `handleLoopRun` 등)는 그대로 유지하되, entry point만 통합.

### 4.3 `prepare` 통합 및 캐시 전략

`research`, `spec`, `design`을 `prepare`로 통합하면서도 **개별 재실행** 요구를 대응하기 위해 캐시 기반 스킵 로직을 활용합니다.

- 이미 생성된 `tasks/research.md`가 있으면 research 단계를 스킵
- 이미 생성된 `specs/*.yaml`가 있으면 spec 단계를 스킵
- 이미 생성된 `plans/*.yaml`가 있으면 design 단계를 스킵
- **강제 재실행**: 기존 파일을 삭제 후 `prepare` 재실행 (고급 사용자용)

### 4.4 문서 Single Source of Truth 구조

```
assets/commands/
├── meta/
│   ├── commands.json          # 명령어 메타데이터 (name, args, aliases, deprecated 등)
│   └── commands.schema.json   # JSON Schema (선택)
├── weave-help.md              # 명령어 목록 + 워크플로우 개요
├── weave-map.md
├── weave-interview.md
├── weave-prepare.md
├── weave-approve.md
├── weave-craft.md
├── weave-build.md             # build + --status, --stop, --list, --resume, --sync 포함
├── weave-status.md
├── weave-worktree.md
├── weave-verify.md
├── weave-archive.md
├── weave-troubleshoot.md      # troubleshoot + --record 포함
├── weave-repair.md
└── weave-agents.md            # agents --sync, --init 포함
```

**동적 로딩 구조**:
- `slashcommand.ts`: `assets/commands/*.md`를 런타임에 읽어 BUILTIN_COMMANDS 대체. `getAssetsDir()` 로직 재사용
- `weave.ts` description: `meta/commands.json`을 읽어 동적으로 생성
- `weave.ts` `getHelpMessage()`: `assets/commands/weave-help.md`를 읽어 그대로 반환
- **fail-safe**: 파일 I/O 실패 시 `commands.json`을 JS 번들에 inline default로 포함하여 fallback

### 4.5 `commands.json` 스키마 예시

```json
{
  "$schema": "./commands.schema.json",
  "schemaVersion": "1.0",
  "lastUpdated": "2026-04-29",
  "commands": [
    {
      "name": "build",
      "aliases": ["loop-run"],
      "deprecatedAliases": ["build-resume", "loop-start", "loop-step", "loop-status", "loop-stop", "loop-list", "loop-sync", "loop-watchdog", "loop-poll", "loop-operator"],
      "deprecatedSince": "0.9.0",
      "removedIn": "0.10.0",
      "migration": "use 'build' with action option",
      "description": "자율 빌드 루프 실행 및 관리",
      "descriptionEn": "Autonomous build loop — run, resume, or inspect builds",
      "category": "execution",
      "args": [
        { "name": "action", "type": "enum", "values": ["run", "status", "stop", "list", "resume", "sync"], "default": "run", "description": "Build sub-action" },
        { "name": "phaseIds", "type": "string", "required": false, "description": "Comma-separated phase IDs for run action" },
        { "name": "buildId", "type": "string", "required": false, "description": "Build ID for status/stop/resume/sync actions" }
      ],
      "mdFile": "weave-build.md",
      "handler": "handleBuild",
      "examples": ["weave command=build", "weave command=build action=status buildId=\"build-20250428-a1b2\""]
    }
  ]
}
```

핵심 필드 설명:
- `name`: 기본 명령어 이름
- `aliases`: 현재 버전에서도 완전히 지원하는 별칭 (예: `approve-plan` → `approve`)
- `deprecatedAliases`: 여전히 동작하지만 deprecated 경고를 출력하는 별칭
- `deprecatedSince` / `removedIn`: 하위 호환성 정책 명시
- `migration`: 대체 사용법 안내 메시지
- `category`: 분류 (analysis, planning, execution, management, knowledge, configuration, meta)

---

## 5. 실행 계획 (Phase)

### Phase 1: 구조 설계 및 메타데이터 추출 (1일)

**목표**: 현재 명령어들의 메타데이터를 추출하고, 통합 대상을 확정

**작업 항목**:
- [x] `assets/commands/meta/commands.json` 스키마 설계 및 예시 작성
- [x] 기존 `weave.ts` enum의 모든 명령어를 메타데이터로 추출하여 `commands.json` 초안 작성
- [x] `loop.ts` 참조 분석 (grep/import) — **결과: 외부 참조 없음, `weave.ts`에서만 사용**
- [ ] `weave-help.md`를 템플릿화하여 나머지 `.md` 파일 목록으로부터 자동 생성 가능하도록 구조 변경
- [ ] 삭제 대상 명령어 최종 확정 (팀 리뷰)

**산출물**:
- `assets/commands/meta/commands.json` (v1.0)
- `assets/commands/meta/commands.schema.json` (선택)
- `assets/commands/weave-help.md` 템플릿 구조
- `loop.ts` 참조 분석 보고서

### Phase 2: 명령어 통합 구현 (2일)

**목표**: `build`, `troubleshoot`, `agents` 통합 및 `prepare` 외장 명령어 제거

**작업 항목**:
- [ ] `weave.ts`의 `args.command` enum을 통합 후 명령어로 축소
- [ ] `build` 명령어에 `action` 인자 추가 (`run`, `status`, `stop`, `list`, `resume`, `sync`)
- [ ] 기존 `loop-*` handler들을 `build`의 내부 분기로 연결 (handler 본문은 재사용)
- [ ] `troubleshoot`에 `--record` 플래그 추가, `record` 명령어 제거
- [ ] `agents` 명령어 신규 생성 (`--sync`, `--init` 플래그). `config` 대신 `agents`로 분리
- [ ] `flow`, `research`, `spec`, `design` 명령어를 enum/switch에서 제거
- [ ] `approve-plan` → `approve`로 이름 변경 (`approve-plan`은 alias로 유지)
- [ ] `prepare` 낶에 캐시 기반 스킵 로직 추가 (이미 생성된 아티팩트가 있으면 해당 단계 스킵)

**영향 파일**:
- `src/plugin/tools/weave.ts`
- `src/weave/loop.ts` (참조만, 변경 없음 — entry point만 이동)

### Phase 3: 문서 동적 로딩 구현 (1일)

**목표**: 4중 문서 중복 제거 및 Single Source of Truth 구현

**작업 항목**:
- [ ] `assets/commands/meta/commands.json`을 읽어 `slashcommand.ts`가 동적으로 명령어를 등록하도록 변경
- [ ] `BUILTIN_COMMANDS` 하드코딩 제거, `getAllCommands()` 함수가 `.md` + `commands.json`을 조합하도록 수정
- [ ] `weave.ts`의 `getHelpMessage()`가 `assets/commands/weave-help.md`를 파일로 읽어 반환하도록 변경
- [ ] `weave.ts`의 `description` 필드가 `commands.json`을 읽어 동적으로 생성되도록 변경
- [ ] **fail-safe**: 파일 I/O 실패 시 `commands.json` inline default를 fallback으로 사용
- [ ] `getAssetsDir()` 로직을 `slashcommand.ts`에서 재사용하도록 공유 유틸리티로 추출 (선택)

**영향 파일**:
- `src/plugin/tools/slashcommand.ts`
- `src/plugin/tools/weave.ts`
- `src/plugin/index.ts` (선택: `getAssetsDir()` 공유)

### Phase 4: 자산 파일 정리 및 QA (1~2일)

**목표**: `assets/commands/`를 통합 후 명령어로 재구성하고, help 일관성 및 테스트 검증

**작업 항목**:
- [ ] `assets/commands/`의 기존 `.md` 파일들을 통합 후 명령어로 재작성
- [ ] `weave-build.md`에 `build`의 모든 서브 옵션 설명을 통합
- [ ] `weave-agents.md` 신규 작성 (`--sync`, `--init`)
- [ ] `weave-troubleshoot.md`에 `--record` 설명 추가
- [ ] `weave-approve.md` 신규 작성 (`approve-plan`의 alias 설명 포함)
- [ ] 삭제된 명령어(`flow`, `research`, `spec`, `design`, `loop-*` 등)에 해당하는 `.md` 파일 제거
- [ ] `npm run build` 통과 확인
- [ ] 기존 테스트(`vitest`) 통과 확인
- [ ] **신규 테스트**: `build` 통합 시 `--status`, `--stop`, `--list`, `--resume`, `--sync` 각각에 대한 단위 테스트 추가
- [ ] **신규 테스트**: 동적 로딩 — `commands.json` 파싱, `.md` 파일 조합 로직 단위 테스트
- [ ] OpenCode 플러그인 로드 시 slash command 목록 확인 (`/weave help` 또는 `/list`)

**영향 파일**:
- `assets/commands/*.md` (대부분 재작성 또는 삭제)
- `test/` (신규 테스트 추가)

---

## 6. 하위 호환성 정책

### 단일화된 정책

| 버전 | 정책 |
|------|------|
| **v0.9.x** | 기존 명령어는 `deprecatedAliases`로 동작. 실행 시 deprecated 경고 출력. `migration` 메시지 안내 |
| **v0.10.x** | `deprecatedAliases` 완전 제거. `Error: "{cmd}"는 통합되어 더 이상 사용되지 않습니다. {migration}` 형태의 친절한 에러 메시지 출력 |

### `commands.json` 자동화 필드

```json
{
  "name": "prepare",
  "deprecatedAliases": ["research", "spec", "design"],
  "deprecatedSince": "0.9.0",
  "removedIn": "0.10.0",
  "migration": "use 'prepare' (includes research + spec + design)"
}
```

`weave.ts`는 `commands.json`을 읽어 `deprecatedAliases`에 대해 자동으로 경고 메시지를 출력하고, `removedIn` 버전 이상에서는 alias 해제를 자동 처리할 수 있습니다.

---

## 7. 마이그레이션 가이드

### 사용자 입장 변경사항

| 기존 사용법 | 변경 후 사용법 | 비고 |
|-------------|----------------|------|
| `/weave flow docs/` | `/weave prepare docs/` → `/weave approve` → `/weave craft` | `flow` 제거. 단계별 실행 권장 |
| `/weave research docs/` | `/weave prepare docs/` | `research`가 `prepare` 낶에 포함. 이미 생성된 research.md 있으면 스킵 |
| `/weave spec docs/` | `/weave prepare docs/` | `spec`이 `prepare` 낶에 포함 |
| `/weave design docs/` | `/weave prepare docs/` | `design`이 `prepare` 낶에 포함 |
| `/weave approve-plan` | `/weave approve` | 이름 단순화. `/weave approve-plan`은 v0.9까지 alias로 동작 |
| `/weave build` | `/weave build` | 유지 |
| `/weave build-resume` | `/weave build --resume` | 옵션으로 변경 |
| `/weave loop-run` | `/weave build` | `build`와 통합 |
| `/weave loop-status` | `/weave build --status` | 옵션으로 변경 |
| `/weave loop-stop` | `/weave build --stop` | 옵션으로 변경 |
| `/weave loop-sync` | `/weave build --sync` | 옵션으로 변경 |
| `/weave loop-*` (그 외) | `/weave build` 또는 `/weave build --list` | 대부분 `build`로 통합 |
| `/weave record` | `/weave troubleshoot --record` | 옵션으로 변경 |
| `/weave sync-agents` | `/weave agents --sync` | `agents`로 통합 |
| `/weave init-config` | `/weave agents --init` | `agents`로 통합 |

### alias 지원

- `approve-plan` → `approve`만 v0.9까지 alias로 지원. 나머지는 `commands.json`의 `deprecatedAliases`로 관리
- alias 사용 시 콘솔에 다음과 같은 경고 출력:
  ```
  ⚠️ "loop-run"은 deprecated되었습니다. v0.10.0에서 제거될 예정입니다.
     대체: weave command=build
  ```

---

## 8. 파일 변경 목록 예상

### 수정 파일
- `src/plugin/tools/weave.ts` (대폭 수정: enum 축소, build 통합, 동적 help 로딩)
- `src/plugin/tools/slashcommand.ts` (중폭 수정: BUILTIN_COMMANDS 제거, 동적 명령어 등록)

### 삭제 파일
- `assets/commands/weave-flow.md`
- `assets/commands/weave-research.md`
- `assets/commands/weave-spec.md`
- `assets/commands/weave-design.md`
- `assets/commands/weave-plan.md` (이미 삭제 완료)
- `assets/commands/weave-switch.md` (이미 삭제 완료)
- `assets/commands/weave-approve-plan.md` → `weave-approve.md`로 대체

### 신규/재작성 파일
- `assets/commands/weave-build.md` (재작성: build + 서브 옵션)
- `assets/commands/weave-approve.md` (신규)
- `assets/commands/weave-agents.md` (신규: `config` 대신 `agents`로 분리)
- `assets/commands/weave-troubleshoot.md` (재작성: --record 추가)
- `assets/commands/weave-help.md` (재작성: 통합 후 명령어 목록 + ASCII 워크플로우)
- `assets/commands/meta/commands.json` (신규)
- `assets/commands/meta/commands.schema.json` (선택)

---

## 9. 위험도 및 롤백 계획

| 위험 요소 | 영향도 | 완화 방안 |
|-----------|--------|-----------|
| 기존 사용자 스크립트/문서가 `loop-run`, `flow` 등을 참조하고 있을 수 있음 | 중 | v0.9에서 `deprecatedAliases`로 유지 + 경고 메시지. v0.10에서 제거 |
| `build` 통합 시 기존 handler 호출 구조가 복잡해짐 | 중 | 기존 handler 함수는 그대로 두고 entry point만 분기. 단위 테스트로 검증 |
| 동적 `.md` 로딩 시 파일 I/O로 인한 플러그인 초기화 지연 | 낮음 | `.md` 파일은 수십 KB 수준. `commands.json`을 inline default로 포함하여 파일 I/O 실패 시 fallback |
| 패키징 후 `assets/commands/` 경로 변경 | 낮음 | `getAssetsDir()` 로직(이미 `src/plugin/index.ts`에 구현됨)을 `slashcommand.ts`에서 재사용 |
| `commands.json` 스키마가 미래 확장성을 해침 | 낮음 | `schemaVersion` 필드 포함. 향후 v2.0 마이그레이션 가능 |

**롤백**: Git revert로 단순 복구 가능. Phase별로独立 커밋하여 롤백 단위를 세분화.

---

## 10. 테스트 전략

### 단위 테스트 (신규)

| 대상 | 테스트 내용 | 파일 |
|------|-------------|------|
| `build` 통합 | `action=run`, `status`, `stop`, `list`, `resume`, `sync` 각각이 올바른 handler를 호출하는지 | `test/weave-build.test.ts` |
| `prepare` 캐시 | 이미 존재하는 research.md/spec/pl이 있을 때 해당 단계를 스킵하는지 | `test/weave-prepare.test.ts` |
| 동적 로딩 | `commands.json` 파싱, `.md` 파일 조합, fallback 동작 | `test/commands-loader.test.ts` |
| alias 처리 | `deprecatedAliases` 입력 시 경고 메시지 출력 + 올바른 handler 호출 | `test/weave-aliases.test.ts` |

### E2E 테스트

- `/weave build --list` slash command가 실제로 등록되어 실행되는지
- `/weave agents --sync`가 `sync-agents`와 동일하게 동작하는지
- `/weave approve`가 `approve-plan` alias를 통해 동작하는지

### 회귀 테스트

- 기존 `test/weave-*.test.ts` 전체 통과 확인
- `npm run build` 오류 없음 확인

---

## 11. 체크리스트 (완료 기준)

- [ ] `weave.ts`의 명령어 enum이 14개 이하로 축소됨
- [ ] `build` 하나로 `loop-*` 전체가 대체됨
- [ ] `assets/commands/*.md`가 통합 후 명령어만 존재함 (잔여 파일 없음)
- [ ] `slashcommand.ts`의 BUILTIN_COMMANDS 하드코딩이 제거되고 `.md` + `commands.json` 기반 동적 로딩으로 대체됨
- [ ] `weave.ts`의 `getHelpMessage()`가 파일 I/O 기반으로 변경됨
- [ ] `weave.ts`의 `description`이 `commands.json` 기반으로 동적으로 생성됨
- [ ] 파일 I/O 실패 시 inline default fallback 동작 확인
- [ ] `npm run build` 및 기존 테스트(`vitest`) 통과
- [ ] 신규 단위 테스트 (`build` 서브 액션, 동적 로딩, alias) 통과
- [ ] OpenCode 플러그인 로드 시 `/weave help`가 통합 후 명령어만 출력함
- [ ] `deprecatedAliases` 사용 시 경고 메시지 출력 확인
