---
description: 요구사항 정제 및 검증 기준 추출
---

# /weave-spec - 요구사항 정제

## 개요

기획 문서나 자연어 요구사항을 **구조화된 명세**로 정제합니다.
각 요구사항에서 **검증 기준(Acceptance Criteria)**을 추출하여, 이후 구현 완료의 성공 판정 기준으로 사용합니다.

**입력 방식**: `/weave-design`과 동일
- 정확한 경로: `docs/`, `wiki/spec.md`
- 자연어 힌트: `기획 폴더`, `README`

> 이 커맨드는 **선택 사항**입니다. `/weave-design`을 바로 실행해도 됩니다.
> 요구사항이 복잡하거나, 구현 완료 기준을 명확히 하고 싶을 때 사용합니다.

---

## 실행

```txt
weave command=spec docsPath="$ARGUMENTS"
```

---

## 사전 조건

`/weave-init`이 실행되어 있어야 합니다.
실행되지 않았다면 자동으로 init을 먼저 수행합니다.

---

## 실행 흐름

```
0. INIT CHECK
   ↓
1. RESOLVE (입력 해석 → 실제 경로 찾기)
   ↓
2. ANALYZE (문서에서 요구사항 추출)
   ↓
3. STRUCTURE (요구사항 분류 + 검증 기준 도출)
   ↓
4. REVIEW (유저에게 제시 → 피드백)
   ↓
5. SAVE (스펙 파일 생성)
```

---

## 단계별 상세

### Step 0: INIT CHECK

`.opencode/weave/state.yaml` 존재 확인. 없으면 `/weave-init` 자동 실행.

### Step 1: RESOLVE

`/weave-design`과 동일한 경로 해석 로직. (정확한 경로, 디렉토리 힌트, 시간 힌트, 내용 힌트 등)

### Step 2: ANALYZE

**수행 작업**:
1. 해석된 경로의 모든 문서 읽기
2. 기능 요구사항과 비기능 요구사항 분리
3. 암묵적 요구사항 식별 (명시되지 않았지만 당연히 필요한 것)
4. 요구사항 간 의존관계 파악
5. 과거 유사 프로젝트 검색 (Memory 시스템)

### Step 3: STRUCTURE

각 요구사항을 정제하고, **검증 기준**을 도출합니다.

#### 요구사항 분류

| 분류 | 설명 | 예시 |
|------|------|------|
| `functional` | 시스템이 해야 하는 동작 | 사용자가 로그인할 수 있다 |
| `constraint` | 기술적/비즈니스 제약 | 데이터를 외부 서버로 전송하지 않는다 |
| `performance` | 성능 요구 | 목록 로딩 2초 이내 |
| `ux` | 사용성/접근성 요구 | 모바일에서도 사용 가능해야 한다 |

#### 우선순위 (MoSCoW)

| 값 | 의미 |
|----|------|
| `must` | 없으면 출시 불가 |
| `should` | 강력히 권장, 가능하면 포함 |
| `could` | 있으면 좋지만 없어도 됨 |
| `wont` | 이번 범위에서 명시적으로 제외 |

#### 검증 기준 유형

| type | 의미 | 실행 방법 |
|------|------|----------|
| `e2e` | 브라우저/UI 시나리오 테스트 | Playwright, Cypress 등 |
| `integration` | API/서비스 간 통합 테스트 | supertest, httpx, curl 등 |
| `script` | CLI/스크립트 실행 결과 확인 | shell script, node script |
| `performance` | 성능 기준 충족 | benchmark, lighthouse 등 |
| `manual` | 자동화 불가, 사용자 확인 | 체크리스트로 유저 핸드오프에 포함 |

#### 검증 기준 작성 원칙

- **모호하지 않을 것**: "잘 동작한다" ✗ → "저장 후 목록에서 확인 가능" ✓
- **실행 가능할 것**: 구체적인 입력과 기대 결과를 명시
- **독립적일 것**: 하나의 기준이 하나의 시나리오만 검증
- **유형은 정직하게**: E2E가 불가능한 것은 `manual`로. 억지로 자동화하지 않음

### Step 4: REVIEW

구조화된 명세를 유저에게 제시합니다:

```markdown
## 요구사항 명세

**스펙 이름**: `emotion-diary` (변경 가능)

### 기능 요구사항 (Functional)

**R1** [must]: 사용자가 감정을 선택하고 일기를 저장할 수 있다
- [e2e] 감정 선택 → 텍스트 입력 → 저장 → 목록에서 확인
- [e2e] 빈 텍스트로 저장 시도 → 에러 메시지 표시

**R2** [must]: 저장된 일기 목록을 조회할 수 있다
- [e2e] 저장된 일기 3개가 목록에 최신순으로 표시

### 비기능 요구사항

**R3** [should]: 일기 목록이 2초 이내에 로딩된다
- [performance] 100개 일기 기준 로딩 시간 < 2000ms

**R4** [could]: 오프라인에서도 저장된 일기를 조회할 수 있다
- [manual] 네트워크 차단 후 기존 일기 목록 접근 가능

---
빠진 요구사항이 있거나, 검증 기준을 수정하고 싶으면 말씀해주세요.
```

### Step 5: SAVE

유저 승인 시 스펙 파일을 생성합니다.

**파일 경로**: `.opencode/weave/specs/{spec-name}.yaml`

```yaml
spec_name: "emotion-diary"
project_name: "감정 일기 앱"
created_at: "2026-02-06"
source_docs:
  - "docs/requirements.md"

requirements:
  - id: R1
    description: "사용자가 감정을 선택하고 일기를 저장할 수 있다"
    category: functional
    priority: must
    acceptance:
      - id: AC-R1-1
        scenario: "감정 선택 → 텍스트 입력 → 저장 → 목록에서 확인"
        type: e2e
      - id: AC-R1-2
        scenario: "빈 텍스트로 저장 시도 → 에러 메시지 표시"
        type: e2e

  - id: R2
    description: "저장된 일기 목록을 조회할 수 있다"
    category: functional
    priority: must
    acceptance:
      - id: AC-R2-1
        scenario: "저장된 일기 3개가 목록에 최신순으로 표시"
        type: e2e

  - id: R3
    description: "일기 목록이 2초 이내에 로딩된다"
    category: performance
    priority: should
    acceptance:
      - id: AC-R3-1
        scenario: "100개 일기 기준 로딩 시간 < 2000ms"
        type: performance

  - id: R4
    description: "오프라인에서도 저장된 일기를 조회할 수 있다"
    category: constraint
    priority: could
    acceptance:
      - id: AC-R4-1
        scenario: "네트워크 차단 후 기존 일기 목록 접근 가능"
        type: manual
```

**완료 메시지**:
```markdown
## 요구사항 명세가 생성되었습니다

📁 파일: `.opencode/weave/specs/emotion-diary.yaml`
📊 요구사항: 4개 (functional 2, performance 1, constraint 1)
🎯 검증 기준: 5개 (e2e 3, performance 1, manual 1)

### 다음 단계
이 명세를 기반으로 실행 계획을 세우려면:
`/weave-design emotion-diary`
```

---

## 완료 후 검증 (필수)

스펙 파일 생성 후, 반드시 다음을 확인합니다:

1. **스펙 파일 존재 확인**: `.opencode/weave/specs/{spec-name}.yaml` 존재 검증
2. **YAML 파싱 가능 확인**: 파일 내용이 유효한 YAML인지 검증
3. **검증 실패 시**: 유저에게 오류를 알리고 재생성 시도

---

## 핵심 원칙

1. **명세만 수립, 계획/구현 금지**: Phase 분할이나 코드 구현은 하지 않음
2. **검증 기준은 구체적으로**: 입력 → 기대결과 형태로 작성
3. **유형은 정직하게**: 자동화 불가능하면 `manual`. 억지로 끼워맞추지 않음
4. **스펙 이름은 kebab-case**: 이후 `/weave-design`의 플랜 이름으로 사용됨
5. **wont도 기록**: 명시적으로 제외한 것을 기록해야 나중에 "왜 안 했어?"를 방지
