---
title: Weave x GDC 통합 구현 설계서
status: in-progress
owner: maskweaver
last_updated: 2026-03-03
---

# Weave x GDC 통합 구현 설계서

## 1) 목적과 결론

목적은 Weave의 실행 중심 워크플로우에 GDC의 그래프/스펙 중심 컨텍스트를 결합해, 다음을 동시에 달성하는 것이다.

- 리서치 품질 향상: 이미 존재하는 노드/의존성/구현 근거를 먼저 확인
- 구현 정확도 향상: `gdc extract` 기반으로 작업 컨텍스트를 정밀화
- 검증 신뢰도 향상: `gdc sync + gdc check`를 빌드/테스트 전에 게이트로 배치
- 초기화 일관성: `weave init` 단계에서 GDC 존재 여부를 감지하고 연동 경로를 안내

핵심 결론:

- **GDC는 설계/관계(SoT), Weave는 실행/검증(SoT)** 로 역할을 분리한다.
- 코드베이스 병합 대신 CLI 어댑터 방식으로 느슨 결합한다.
- `.gdc`가 없으면 기존 Weave 동작을 그대로 유지하는 하위호환을 강제한다.

## 2) 통합 원칙

### 2.1 SoT 분리 원칙

- 설계 권위: `.gdc/nodes/*.yaml`, `.gdc/config.yaml`, `gdc graph/check/sync`
- 실행 권위: `.opencode/weave/state.yaml`, `.opencode/weave/plans/*.yaml`, `weave craft/verify/status`

### 2.2 결합 방식 원칙

- 직접 import 대신 `gdc` CLI 호출 기반의 어댑터 사용
- 모든 GDC 호출은 타임아웃, 오류 코드, fallback 메시지 포함
- GDC 실패 시 Weave는 중단이 아닌 강등 모드로 진행 (strict 모드 제외)

### 2.3 호환성 원칙

- GDC 미사용 사용자 UX를 절대 깨지 않는다
- 신규 기능은 opt-in + 자동감지 혼합 방식
- 출력은 human-friendly와 machine-friendly를 분리한다

## 3) 사용자 흐름 설계

## 3.1 `weave init` (GDC 연동)

기존:

- `.opencode/weave` 초기화

확장:

1. `.gdc/config.yaml` 존재 여부 확인
2. 존재 시:
   - `gdc version --machine`으로 호환성 확인
   - 연동 모드 활성화 (`gdcEnabled=true`)
3. 미존재 시:
   - 기존 init 완료 후 안내 메시지 제공
   - 선택적으로 `gdc init` 가이드 출력

예시 안내:

- "GDC가 감지되지 않았습니다. 그래프 기반 리서치를 원하면 `gdc init --language <lang>` 후 다시 `/weave init`을 실행하세요."

## 3.2 `weave research` (의존성 조사 강화)

기존:

- docs + 워크스페이스 텍스트 스캔 중심

확장:

- 기능 키워드 기준으로 GDC에서 다음을 추가 수집
  - `gdc stats --machine`
  - `gdc graph --format json --machine`
  - `gdc check --machine`
  - `gdc query <candidate>` / `gdc trace <node> --direction both --machine`

리서치 보고서(`tasks/research.md`) 신규 섹션:

- `## GDC Node Coverage`
- `## Dependency Blast Radius`
- `## Existing Spec vs Implementation Drift`
- `## Candidate Reuse Nodes`

## 3.3 `weave prepare/design` (그래프 기반 phase/task 생성)

기존:

- 문서에서 feature를 추출해 순차 phase 생성

확장:

- GDC 그래프에서 후보 노드 집합 추출
- 의존성 위상 정렬을 phase/task 의 `dependsOn`에 반영
- `WeaveTask`를 아래 필드로 확장
  - `nodeIds: string[]`
  - `files: string[]`
  - `dependsOn: string[]`
  - `verify: { kind: 'command' | 'checklist'; value: string }[]`
  - `acceptanceRefs: string[]`

## 3.4 `weave craft` (노드 단위 컨텍스트 주입)

기존:

- phase task 목록 기반 실행 컨텍스트 제공

확장:

- task가 `nodeIds`를 가지면 실행 전에 자동 컨텍스트 생성:
  - `gdc extract <node> --with-impl --with-tests --with-callers --output tasks/context/<taskId>-<node>.md`
- `tasks/todo.md`에 해당 파일 경로를 함께 표기

## 3.5 `weave verify` (설계 게이트 선행)

기존:

- 프로젝트 유형 기반 build/test 추천 실행

확장:

0단계 GDC 게이트(옵션, strict에서 필수):

1. `gdc sync --machine`
2. `gdc check --machine`
3. blocking issue가 있으면 verify 실패 처리

그 다음 기존 build/test 레이어 실행.

## 3.6 `weave status` (설계/실행 통합 대시보드)

추가 지표:

- GDC total nodes / implemented / tested
- unresolved check issues count
- 현재 phase와 연결된 node 수

## 3.7 `weave worktree` (GDC 부트스트랩)

기존:

- `.opencode/weave` 복제

확장:

- `.gdc/config.yaml` 복제
- `.gdc/nodes/` 복제 (옵션)
- `.gdc/graph.db`는 기본 복제 제외 (재생성 권장)

## 4) 구성 설정 확장안

`maskweaver.config.json` 예시:

```json
{
  "gdc": {
    "enabled": true,
    "binPath": "E:/works/gdc/gdc.exe",
    "sourcePath": "E:/works/gdc",
    "strictVerify": true,
    "autoSyncOnPrepare": true,
    "extractContext": {
      "withImpl": true,
      "withTests": true,
      "withCallers": true
    }
  }
}
```

권장 기본값:

- `enabled`: auto-detect
- `strictVerify`: false (초기 도입), 팀 안정화 후 true
- `autoSyncOnPrepare`: true

## 5) 선행 권장 이행(M0)

이 설계서에서 요구하는 선행 조건은 이미 별도 문서로 정의한다.

- 참조: `docs/plan/gdc-machine-contract-v1.ko.md`

핵심:

- GDC 명령의 machine 출력 계약 통일
- 에러 코드 표준화
- `--machine` 모드에서 stdout JSON만 출력

## 6) 구현 범위(파일 단위)

자세한 파일별 백로그는 아래 문서를 따른다.

- `docs/plan/weave-gdc-file-change-map.ko.md`

핵심 대상:

- `src/plugin/tools/weave.ts`
- `src/plugin/tools/slashcommand.ts`
- `src/weave/stages/research.ts`
- `src/weave/stages/plan.ts`
- `src/weave/stages/execute.ts`
- `src/weave/verification/commands.ts`
- `src/weave/worktree.ts`
- `src/weave/types.ts`

## 7) 마일스톤

### M0: GDC 머신 계약 표준화

- 산출물: 계약 문서 + 테스트 시나리오
- 완료 기준: Weave가 GDC 결과를 파싱 가능한 단일 포맷 확보

### M1: 플러그인/명령 연결

- 산출물: `gdc` tool, slash command, config 로딩
- 완료 기준: OpenCode에서 `/gdc-*` 및 `weave` 연계 호출 가능

### M2: Research/Init 연동

- 산출물: init 감지 + research GDC 섹션
- 완료 기준: 리서치 문서에 그래프 기반 분석이 자동 포함

### M3: Prepare/Design/Craft 연동

- 산출물: 노드 기반 task, extract 컨텍스트 생성
- 완료 기준: task가 노드/의존성을 명시하고 craft에서 즉시 활용

### M4: Verify/Status/Worktree 연동

- 산출물: gdc check 게이트, 상태 확장, worktree 부트스트랩 확장
- 완료 기준: 설계-실행 상태를 한 화면에서 확인 가능

### M5: 안정화

- 산출물: 통합 테스트, 회귀 테스트, 문서
- 완료 기준: 기존 Weave 사용자 경로 100% 하위호환 보장

현재 적용(2026-03-03):

- `weave-flow` 경로에 GDC strict/lenient/disabled/미감지 회귀 테스트 보강
- `weave worktree`의 GDC 부트스트랩 범위(`config + nodes`, `graph.db` 제외) 테스트 확정
- verify 추천 커맨드(preflight/build/test 순서, strict/lenient) 단위 테스트 추가
- README/명령 문서와 실제 옵션(`extractContext`, status/worktree 동작) 동기화

## 8) 검증/수용 기준

- 기능 리서치 시 의존성 경로가 문서화되어야 한다.
- `weave craft` 결과에 노드별 컨텍스트 파일 링크가 포함되어야 한다.
- `strictVerify=true` 환경에서 `gdc check` 오류가 있으면 finalize 불가해야 한다.
- GDC가 없는 프로젝트에서는 기존 Weave 동작과 출력이 유지되어야 한다.

## 9) 리스크와 대응

- GDC 출력 포맷 불안정: M0 계약 + 버전 협상(`gdc version --machine`)
- 리서치 시간 증가: quick/full 모드 분리
- worktree 충돌: `.gdc/graph.db` 복제 금지, `gdc sync` 재생성 원칙
- 컨텍스트 과다: `extract` 증거 옵션을 task 복잡도 기준으로 선택적 활성화

## 10) 비범위(초기)

- GDC 내부 로직을 Maskweaver로 포팅
- 모든 GDC 명령의 즉시 완전 JSON화
- 분산 저장 모드에 대한 자동 병합 전략 완성
