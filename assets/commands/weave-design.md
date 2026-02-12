---
description: 요구사항 분석 및 Phase 계획 수립 (멀티 플랜)
---

# /weave-design - 요구사항 분석 및 계획 수립

## 개요

유저의 요구사항 문서를 분석하고, Phase별 실행 계획을 수립합니다.
**멀티 플랜**: 하나의 프로젝트에서 여러 플랜을 동시에 관리할 수 있습니다.

**입력 방식**: 
- 정확한 경로: `docs/`, `wiki/spec.md`
- 자연어 힌트: `기획 폴더`, `README`, `아까 만든 문서`
- **스펙 이름**: `emotion-diary` (기존 `/weave-spec`으로 생성한 명세)

> AI가 자동으로 프로젝트를 탐색하여 관련 문서를 찾습니다.

**Maskweaver 통합**:
- **Memory**: 과거 유사 프로젝트 검색하여 계획 참조
- **Masks**: 아키텍처 분석에 Martin Fowler 마스크 자동 선택

---

## 사전 조건

`/weave-init`이 실행되어 있어야 합니다.
실행되지 않았다면 자동으로 init을 먼저 수행합니다:
1. `.opencode/weave/state.yaml` 존재 여부 확인
2. 없으면 → `/weave-init` 절차 자동 실행 후 계속 진행

---

## Expert Summoning Strategy (Critical)

### Principle: Summon Named Experts for Quality

You are the **Mask Weaver**. Your power lies in summoning the right expert for the right task. Don't try to do everything yourself — **delegate to specialists**.

---

### 1. Architecture & Design Decisions → Expert Council

For **critical architectural decisions**, summon multiple experts for consultation:

```
Complex Architecture Decision:

Task(dummy-human):
  Mask: Martin Fowler (Enterprise Architecture)
  Task: "Analyze these requirements and propose a layer structure,
         key components, and design patterns to use."

Task(dummy-human):
  Mask: Linus Torvalds (System Performance)
  Task: "Review the proposed architecture for performance bottlenecks
         and scalability concerns."

→ Mask Weaver synthesizes both perspectives into final decision.
```

**Why This Works**:
- Each expert focuses on their domain of excellence
- You maintain strategic oversight without context pollution
- Multiple perspectives prevent blind spots

---

### 2. Technology Choices → Squad Parallel Analysis

For **important technology selections** (framework, database, etc.):

```
Mask Weaver:
1. squad start → "Optimal Tech Stack Decision"
2. squad squad (arch-squad) → "Martin Fowler: Maintainability analysis"
3. squad squad (perf-squad) → "Linus Torvalds: Performance analysis"
4. squad squad (dx-squad) → "Dan Abramov: Developer experience analysis"

→ Collect results → Weigh trade-offs → Final decision
```

---

### 3. When to Summon vs Handle Directly

| Situation | Action |
|-----------|--------|
| Reading & summarizing requirements | Handle directly |
| Obvious tech stack (project already decided) | Handle directly |
| Architecture trade-offs with long-term impact | **Summon Martin Fowler** |
| Performance-critical design | **Summon Linus Torvalds** |
| Multiple valid approaches, need comparison | **Squad council** |

> **Rule of Thumb**: If the decision will be hard to reverse later, summon experts. If it's tactical, handle it yourself.

---

## 실행 흐름

```
0. INIT CHECK (weave 초기화 확인)
   ↓
1. RESOLVE (입력 해석 → 스펙 파일 또는 원본 문서 찾기)
   ↓
2. INTAKE (문서/스펙 분석)
   ↓
3. CLARIFY (불명확한 부분 질문 — 스펙 있으면 최소화)
   ↓
4. PLAN (계획서 제시 + Phase별 검증 기준 매핑)
   ↓
5. FEEDBACK (유저 피드백 → 수정)
   ↓
6. APPROVE (승인 시 플랜 파일 생성 + 활성 플랜 설정)
```

---

## 단계별 상세

### Step 0: INIT CHECK

```
.opencode/weave/state.yaml 존재?
  ├─ YES → 계속 진행
  └─ NO → /weave-init 자동 실행 후 계속
```

### Step 1: RESOLVE (경로 해석 + 스펙 탐색)

**스펙 파일 우선 탐색**:

```
입력값 해석:
  1. .opencode/weave/specs/{입력값}.yaml 존재? → 스펙 기반 모드
  2. 아니면 → 기존 경로 해석 로직 (문서 기반 모드)
```

| 모드 | 입력 | 동작 |
|------|------|------|
| 스펙 기반 | `emotion-diary` | 스펙 파일에서 요구사항 + 검증 기준 로드 |
| 문서 기반 | `docs/`, `기획서` | 기존처럼 문서를 직접 분석 |

**입력 유형별 처리** (문서 기반 모드):

| 입력 타입 | 예시 | 처리 방법 |
|----------|------|----------|
| 정확한 경로 | `docs/spec.md` | 그대로 사용 |
| 디렉토리 힌트 | `기획 폴더`, `스펙 폴더` | docs/, spec/, design/, wiki/ 등 탐색 |
| 파일 타입 힌트 | `README`, `기획서` | README.md, SPEC.md, *.spec.md 등 검색 |
| 시간 힌트 | `아까 만든`, `어제 정리한` | 최근 수정된 .md 파일 탐색 |
| 내용 힌트 | `요구사항`, `기능 목록` | 파일 내용 검색 (grep) |

**탐색 순서**:
1. 프로젝트 루트의 일반적 문서 위치 확인
   - `docs/`, `doc/`, `wiki/`, `spec/`, `design/`
2. 키워드 매칭으로 후보 파일 탐색
3. 최근 수정 시간 고려 (시간 힌트가 있는 경우)
4. 후보가 여러 개면 유저에게 확인

---

### Step 2: INTAKE

**스펙 기반 모드**:
1. 스펙 파일의 요구사항 및 검증 기준을 그대로 로드
2. 아키텍처 및 기술 스택 판단에 집중
3. 과거 유사 프로젝트 검색 (Memory 시스템)

**문서 기반 모드**:
1. 해석된 경로의 모든 문서 읽기
2. 핵심 기능 추출
3. 기술적 요구사항 식별
4. 과거 유사 프로젝트 검색 (Memory 시스템)
5. **검증 기준 동시 도출**: 각 요구사항에서 검증 기준을 함께 추출
   - 스펙 단계를 거치지 않았으므로, INTAKE에서 직접 수행
   - `/weave-spec`의 검증 기준 유형(e2e, integration, script, performance, manual) 동일하게 적용

---

### Step 3: CLARIFY

불명확한 부분을 유저에게 질문합니다.

**스펙 기반 모드**: 스펙에서 이미 정제된 부분은 건너뛰고, 아키텍처/기술 스택 관련 질문만.
**문서 기반 모드**: 요구사항 + 아키텍처/기술 스택 모두 질문.

---

### Step 4: PLAN

**Phase 크기 기준**:
- 한 Phase = 반나절 ~ 하루 작업량
- 끝나면 유저가 뭔가 "해볼 수 있어야" 함

**검증 기준 매핑**:
각 Phase에 해당 요구사항의 검증 기준을 매핑합니다. 이 매핑이 이후 `/weave-craft`에서 Phase 완료 판정의 기준이 됩니다.

**계획서 출력**:
```markdown
## 실행 계획서

**플랜 이름**: `emotion-diary` (변경 가능)

### 비전
[전체 목표 요약]

### Phase 계획
| Phase | 이름 | 완료 조건 | 검증 기준 | 예상 시간 |
|-------|------|----------|----------|----------|
| P1 | 감정 선택 UI | 감정 6종 선택 가능 | AC-R1-1 (e2e) | 2-3시간 |
| P2 | 일기 저장 | 저장 + 목록 조회 | AC-R1-1, AC-R1-2, AC-R2-1 (e2e) | 2-3시간 |
| P3 | 성능 최적화 | 100개 기준 2초 이내 | AC-R3-1 (performance) | 1-2시간 |

### Phase별 검증 기준 상세

**P2: 일기 저장**
- [e2e] AC-R1-1: 감정 선택 → 텍스트 입력 → 저장 → 목록에서 확인
- [e2e] AC-R1-2: 빈 텍스트로 저장 시도 → 에러 메시지 표시
- [e2e] AC-R2-1: 저장된 일기 3개가 목록에 최신순으로 표시

---
이 계획이 괜찮으세요? 플랜 이름을 바꾸고 싶다면 말씀해주세요.
```

---

### Step 5: APPROVE

**플랜 파일 생성**: `.opencode/weave/plans/{plan-name}.yaml`

```yaml
plan_name: "emotion-diary"
project_name: "감정 일기 앱"
created_at: "2026-02-06"
status: "active"     # active | paused | completed | archived
spec_ref: "emotion-diary"   # 참조한 스펙 파일 이름 (없으면 null)

vision: |
  [전체 비전]

architecture:
  frontend: "[...]"
  backend: "[...]"
  database: "[...]"

phases:
  - id: "P1"
    name: "[Phase 이름]"
    status: "pending"    # pending | in_progress | completed
    done_when: "[완료 조건]"
    started_at: null
    completed_at: null
    masks_used: []
    checklist:
      - "[체크 항목 1]"
      - "[체크 항목 2]"
    acceptance:
      - id: "AC-R1-1"
        scenario: "감정 선택 → 텍스트 입력 → 저장 → 목록에서 확인"
        type: "e2e"
        status: "pending"     # pending | passed | failed
      - id: "AC-R1-2"
        scenario: "빈 텍스트로 저장 시도 → 에러 메시지 표시"
        type: "e2e"
        status: "pending"
    tasks: []
```

**state.yaml 업데이트**:

```yaml
active_plan: "emotion-diary"
```

**완료 메시지**:
```markdown
## 플랜이 승인되었습니다!

📁 생성된 파일: `.opencode/weave/plans/emotion-diary.yaml`
📌 활성 플랜으로 설정됨

### 검증 기준 요약
| Phase | e2e | integration | performance | manual | 합계 |
|-------|-----|-------------|-------------|--------|------|
| P1    | 1   | 0           | 0           | 0      | 1    |
| P2    | 3   | 0           | 0           | 0      | 3    |
| P3    | 0   | 0           | 1           | 0      | 1    |

### 다음 단계
Phase 1을 시작하려면:
`/weave-craft P1`
```

---

## 기존 플랜이 있는 경우

활성 플랜이 이미 존재하면:
```markdown
현재 활성 플랜: `todo-app` (P2 진행 중)

새 플랜을 추가하면 기존 플랜은 유지되고, 새 플랜이 활성 플랜이 됩니다.
기존 플랜으로 돌아가려면: `/weave-switch todo-app`

계속 진행할까요?
```

---

## 핵심 원칙: 계획만 수립, 구현 금지

> **CRITICAL: `/weave-design`은 계획 파일(.yaml)만 생성합니다. 코드 구현, 파일 생성, 프로젝트 셋업 등 실제 구현 작업은 절대 수행하지 않습니다.**

- 이 커맨드의 산출물은 오직 `.opencode/weave/plans/{plan-name}.yaml` 파일과 `state.yaml` 업데이트뿐입니다.
- 코드 작성, 디렉토리 생성, 패키지 설치 등 구현에 해당하는 모든 행위는 `/weave-craft` 단계에서 수행합니다.
- Phase 내부의 `tasks`는 계획 항목으로만 기록하고, 실행하지 않습니다.

---

## 완료 후 검증 (필수)

플랜 파일 생성 후, 반드시 다음을 확인합니다:

1. **플랜 파일 존재 확인**: `.opencode/weave/plans/{plan-name}.yaml` 파일이 실제로 존재하는지 검증
2. **state.yaml 반영 확인**: `active_plan` 값이 새 플랜 이름으로 올바르게 설정되었는지 검증
3. **검증 기준 매핑 확인**: 모든 Phase에 최소 1개 이상의 acceptance 항목이 있는지 확인
4. **검증 실패 시**: 유저에게 오류를 알리고 재생성 시도

```
검증 절차:
1. Read(".opencode/weave/plans/{plan-name}.yaml") → 파일 존재 확인
2. Read(".opencode/weave/state.yaml") → active_plan 값 확인
3. 각 Phase의 acceptance 배열이 비어있지 않은지 확인
4. 모두 정상이면 → 완료 메시지 출력
5. 하나라도 실패하면 → 오류 보고 및 재시도
```

---

## 주의사항

1. **Phase는 작게**: 큰 Phase는 분할
2. **복잡한 분석은 위임**: Task(dummy-human)으로 전문가 위임
3. **테스트 가능해야**: 각 Phase 끝에 유저가 확인할 수 있어야
4. **아키텍처는 유연하게**: "변경 가능"을 명시
5. **플랜 이름은 kebab-case**: 파일명이 되므로 영문 소문자, 하이픈만 사용
6. **구현 금지**: 이 커맨드에서는 계획 파일 생성 외 어떤 코드/파일도 만들지 않음
7. **검증 필수**: 플랜 파일 생성 후 반드시 파일 존재와 state.yaml 반영을 확인
8. **검증 기준 매핑 필수**: 모든 Phase에 acceptance 항목 존재. 초기 Phase에서 e2e가 불가능하면 적합한 유형(script, manual 등)으로 지정
