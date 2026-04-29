---
description: 자율 빌드 루프 실행 및 관리 (run, status, stop, list, resume, sync)
---

# /weave-build - 자율 빌드 루프 실행 및 관리

## 개요

승인된 플랜의 지정된 Phase(들)를 **자율 빌드 루프**로 실행하거나, 기존 빌드의 상태를 확인/관리합니다.

| 서브 액션 | 설명 | 대응 기존 명령어 |
|-----------|------|-----------------|
| `run` (기본) | 활성 Phase를 Ralph-loop로 자율 실행 | `weave build`, `weave loop-run` |
| `status` | 특정 빌드/루프의 상태 확인 | `weave loop-status` |
| `stop` | 실행 중인 빌드/루프 중단 요청 | `weave loop-stop` |
| `list` | 모든 빌드/루프 목록 조회 | `weave loop-list` |
| `resume` | 중단(blocked)된 빌드 재개 | `weave build-resume` |
| `sync` | 위임된 squad 결과 동기화 | `weave loop-sync` |

---

## 사용법

```bash
# 자율 빌드 시작 (기본)
/weave-build
/weave-build P1,P2

# 빌드 상태 확인
/weave-build --status build-20250428-a1b2

# 빌드 중단
/weave-build --stop build-20250428-a1b2

# 빌드 목록
/weave-build --list

# 중단 빌드 재개
/weave-build --resume build-20250428-a1b2

# 위임 결과 동기화
/weave-build --sync build-20250428-a1b2
```

---

## 입력

```yaml
action: run | status | stop | list | resume | sync   # (선택) 서브 액션. 기본값: run
phaseIds: "P1,P2"                                     # (선택, action=run) 쉼표로 구분된 Phase ID
buildId: "build-xxx"                                  # (선택, action=status/stop/resume/sync) 대상 빌드 ID
maxRetries: 3                                         # (선택, action=run) 태스크당 최대 재시도
maxIterations: 1                                      # (선택) 최대 반복 횟수
maxNoProgress: 1                                      # (선택) 무진행 허용 횟수
```

---

## 출력 예시

### 성공 (run)

```markdown
## ✅ Build Complete

**Build ID**: `build-20250428-a1b2`
**Plan**: `emotion-diary`
**Phases**: P1, P2

| Phase | 상태 | 소요 시간 |
|-------|------|----------|
| P1 | ✅ 완료 | 12분 |
| P2 | ✅ 완료 | 8분 |
```

### 일부 실패 (blocked)

```markdown
## ⚠️ Build Blocked

**Build ID**: `build-20250428-c3d4`
**Plan**: `emotion-diary`

| Phase | 상태 | 실패 원인 |
|-------|------|----------|
| P1 | ✅ 완료 | - |
| P2 | 🚫 blocked | 타입 검증 실패 (3회 재시도 소진) |

**다음 동작**: `weave build action=resume buildId="build-20250428-c3d4"`
```

---

## 관련 명령어

- `/weave-craft [phaseId]` — 단일 Phase 수동 실행 준비
- `/weave-verify` — 현재 워크트리 검증
- `/weave-status` — 전체 진행 상황
