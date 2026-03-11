---
title: Weave x GDC 파일 단위 구현 백로그
status: draft
owner: maskweaver
last_updated: 2026-03-03
---

# Weave x GDC 파일 단위 구현 백로그

이 문서는 실제 구현 시 어떤 파일을 어떻게 변경할지 정리한 실행 백로그다.

## 1) Maskweaver 변경 맵

| 파일 | 변경 목적 | 마일스톤 |
|---|---|---|
| `src/shared/config.ts` | `gdc` 런타임 설정 타입 추가 | M1 |
| `maskweaver.config.json` | 샘플/기본 설정에 `gdc` 섹션 반영 | M1 |
| `src/plugin/tools/weave.ts` | init/research/prepare/craft/verify에 GDC 호출 체인 추가 | M2~M4 |
| `src/plugin/tools/slashcommand.ts` | `/gdc-*` alias 및 도움말 연결 | M1 |
| `src/weave/types.ts` | `WeaveTask` 확장(`nodeIds`, `files`, `dependsOn`, `verify`, `acceptanceRefs`) | M3 |
| `src/weave/stages/research.ts` | `.gdc` 기반 리서치 섹션 생성 로직 추가 | M2 |
| `src/weave/stages/plan.ts` | GDC 그래프 기반 phase/task 생성 로직 추가 | M3 |
| `src/weave/stages/execute.ts` | `gdc extract` 컨텍스트 생성 및 task 안내 반영 | M3 |
| `src/weave/verification/commands.ts` | GDC pre-verify 단계 추천/실행 정책 추가 | M4 |
| `src/weave/worktree.ts` | `.gdc/config.yaml`, `.gdc/nodes/` 부트스트랩 옵션 추가 | M4 |
| `src/weave/stages/handoff.ts` | phase 완료 시 관련 노드 상태 안내 추가 | M4 |
| `src/weave/bridge.ts` | 노드 의존 기반 DAG 정확도 개선 | M3 |

## 2) GDC 변경 맵(선행 조건)

| 파일 | 변경 목적 | 마일스톤 |
|---|---|---|
| `internal/cli/root.go` | `--machine` 글로벌 플래그, stderr/stdout 규칙 | M0 |
| `internal/cli/version` 관련 | `contractVersion` 포함 JSON 출력 | M0 |
| `internal/cli/check.go` | 공통 envelope + issue 구조 고정 | M0 |
| `internal/cli/sync.go` | 변경 요약 JSON 고정 | M0 |
| `internal/cli/graph.go` | 기존 JSON + envelope 적용 | M0 |
| `internal/cli/stats.go` | stats JSON 출력 추가/고정 | M0 |
| `internal/cli/show.go` | show JSON 출력 추가/고정 | M0/M1 |
| `internal/cli/trace.go` | trace JSON 출력 추가/고정 | M0/M1 |
| `internal/cli/extract.go` | extract 결과 메타 JSON 출력 | M1 |

## 3) 테스트 계획

## 3.1 Maskweaver

- `test/weave-flow.test.ts`
  - GDC 감지 프로젝트에서 `flow`가 `sync/check`를 선행하는지 검증
  - `research` 산출물에 GDC 섹션이 생기는지 검증
- `test/weave-worktree-gdc.test.ts`
  - worktree 생성 시 `.gdc/config.yaml`, `.gdc/nodes/**` 복제 검증
  - `.gdc/graph.db` 미복제 원칙 검증
- `test/weave-verification-commands.test.ts`
  - GDC preflight 추천(`sync/check`)의 strict/lenient/disabled 동작 검증
  - 추천 커맨드 출력 순서(preflight -> build -> test) 검증

## 3.2 GDC

- 신규: `tests/integration/machine_output_test.go`
  - `--machine` JSON 스키마 검증
  - stderr 오염 여부 검증
  - exit code 계약 검증

## 4) 점진 배포 전략

### Phase A (실험)

- 기본값: `gdc.enabled=auto`, `strictVerify=false`
- 수집: 실패 패턴/파싱 오류/실행 시간

### Phase B (안정화)

- 팀 프로젝트 기본값: `strictVerify=true`
- 문제 유형별 fallback 규칙 확정

### Phase C (기본 경로화)

- GDC 프로젝트에서는 `weave prepare`가 자동으로 GDC-aware 모드 사용
- 문서/도움말 기본 예시에 GDC 연동 경로 반영

## 5) 완료 정의(Definition of Done)

- 문서 기준:
  - `docs/plan/weave-gdc-integration-plan.ko.md` 업데이트 완료
  - `docs/plan/gdc-machine-contract-v1.ko.md`와 실제 구현 일치
- 기능 기준:
  - GDC 있는 프로젝트에서 리서치/설계/검증이 실제로 개선됨
  - GDC 없는 프로젝트의 기존 동작 회귀 없음
- 품질 기준:
  - 통합 테스트 통과
  - 주요 실패 경로에서 사용자 안내가 명확함

## 6) M5 안정화 체크포인트

- 회귀 보호: GDC 미사용 프로젝트에서 verify/flow 경로 유지 테스트 확보
- 통합 안정성: strict/lenient/disabled 모드 테스트 케이스 분리
- 문서 동기화: README와 명령 문서의 설정/동작 설명을 실제 구현과 일치
