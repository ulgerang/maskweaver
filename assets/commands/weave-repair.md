---
description: 깨진 YAML 플랜 파일을 스캔하고 자동 수복
---

# /weave-repair - YAML 자동 수복

## 개요

Weave 플랜 YAML 파일의 손상을 감지하고 자동으로 수복합니다.

**사용법**:
- `/weave-repair` — 전체 플랜 파일 스캔 및 수복
- `/weave-repair $ARGUMENTS` — 특정 파일만 수복 (예: `holon-x-openclaw-evolution-v3`)

---

## 실행 절차

### 1단계: 플랜 파일 스캔

```
1. .opencode/weave/state.yaml 확인
2. .opencode/weave/plans/ 디렉토리의 모든 .yaml 파일 목록 확인
3. .opencode/weave/PLAN.yaml (레거시) 확인
```

### 2단계: weave tool로 수복 실행

`weave command=repair`를 호출하여 자동 수복을 실행합니다.

### 3단계: 결과 보고

수복 결과를 유저에게 보여줍니다:
- **OK**: 정상 파일
- **FIXED**: 자동 수복 성공 (무엇을 고쳤는지 표시)
- **FAIL**: 자동 수복 불가 (유저에게 복구 옵션 안내)

---

## 자동 수복 가능한 문제

| 문제 | 예시 | 수복 방법 |
|------|------|----------|
| 닫히지 않은 따옴표 | `done_when: "1. fs.edit가 SecurityHook에` | 내부 따옴표 이스케이프 후 닫기 |
| 탭 문자 | 들여쓰기에 탭 사용 | 스페이스 2칸으로 변환 |
| 줄바꿈 문제 | CR+LF 혼합 | LF로 통일 |
| 백업 복원 | 파싱 완전 실패 | `.bak` 파일에서 복원 |

---

## 자동 수복 불가한 경우

수복이 불가능한 파일이 있으면 유저에게 다음 옵션을 안내합니다:

1. **원본 요구사항이 있다면**: `/weave-design`으로 플랜 재생성
2. **`.corrupted` 백업 확인**: plans 디렉토리에 백업 파일 존재 여부
3. **수동 복구**: 유저가 플랜 내용을 기억하면 그 정보로 YAML 재구성

**유저에게 물어볼 것**:
- 해당 플랜의 프로젝트 이름이 무엇이었는지
- 어떤 Phase들이 있었는지
- 각 Phase의 진행 상태 (완료/진행중/대기)

---

## 참고

- 수복 시 원본 파일은 `.corrupted` 확장자로 백업됩니다
- 매 저장마다 `.bak` 백업이 자동 생성됩니다
- `weave status`나 `weave craft` 실행 시에도 YAML 로드 실패하면 자동 수복을 시도합니다
