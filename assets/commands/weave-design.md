---
description: 요구사항 분석 및 Phase 계획 수립 (멀티 플랜)
---

# /weave-design - 요구사항 분석 및 계획 수립

## 개요

유저의 요구사항 문서를 분석하고, Phase별 실행 계획을 수립합니다.
**멀티 플랜**: 하나의 프로젝트에서 여러 플랜을 동시에 관리할 수 있습니다.

큰 계획(phase/시간 규모가 큰 경우)은 자동으로 여러 shard plan 파일로 분할되며,
각 shard는 독립적으로 세부 설계(task/checklist)를 갖습니다.

**입력 방식**: 
- 정확한 경로: `docs/`, `wiki/spec.md`
- 자연어 힌트: `기획 폴더`, `README`, `아까 만든 문서`

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
1. RESOLVE (입력 해석 → 실제 경로 찾기)
   ↓
2. INTAKE (문서 분석)
   ↓
3. CLARIFY (불명확한 부분 질문)
   ↓
4. PLAN (계획서 제시 + 플랜 이름 제안)
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

### Step 1: RESOLVE (경로 해석)

**입력 유형별 처리**:

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

**수행 작업**:
1. 해석된 경로의 모든 문서 읽기
2. 핵심 기능 추출
3. 기술적 요구사항 식별
4. 과거 유사 프로젝트 검색 (Memory 시스템)

---

### Step 3: CLARIFY

불명확한 부분을 유저에게 질문합니다.

---

### Step 4: PLAN

**Phase 크기 기준**:
- 한 Phase = 반나절 ~ 하루 작업량
- 끝나면 유저가 뭔가 "해볼 수 있어야" 함

**플랜 이름 제안**:
계획서와 함께 **플랜 이름(kebab-case)**을 제안합니다:
```markdown
## 📋 실행 계획서

**플랜 이름**: `emotion-diary` (변경 가능)

### 비전
[전체 목표 요약]

### Phase 계획
| Phase | 이름 | 완료 조건 | 예상 시간 |
|-------|------|----------|----------|
| P1 | [...] | [...] | 2-3시간 |
| P2 | [...] | [...] | 2-3시간 |

---
이 계획이 괜찮으세요? 플랜 이름을 바꾸고 싶다면 말씀해주세요.
```

---

### Step 5: APPROVE

**플랜 파일 생성**: `.opencode/weave/plans/{plan-name}.yaml`

> ⚠️ **YAML 작성 규칙 (반드시 준수)**
>
> `done_when`, `vision` 등 **긴 문자열 값**은 반드시 아래 규칙을 따릅니다:
>
> | 상황 | 사용할 표기법 | 예시 |
> |------|-------------|------|
> | 한 줄로 끝나는 짧은 값 | double-quote (`"`) | `done_when: "로그인 기능 동작"` |
> | 여러 줄 또는 긴 값 | block scalar (`\|`) | 아래 예시 참고 |
> | ❌ 절대 금지 | 여러 줄에 걸친 double-quote | `done_when: "1단계...\n2단계..."` |
>
> ```yaml
> # ✅ 올바른 예시 - 짧은 값
> done_when: "유저가 감정을 선택할 수 있다"
>
> # ✅ 올바른 예시 - 긴 값 (block scalar)
> done_when: |
>   1. 유저가 감정을 선택할 수 있다
>   2. 선택한 감정이 저장된다
>   3. 저장 확인 메시지가 표시된다
>
> # ❌ 잘못된 예시 - 닫는 따옴표가 다른 줄에 있음 (YAML 파싱 실패!)
> done_when: "1. 유저가 감정을 선택할 수 있다
>   2. 선택한 감정이 저장된다
>   3. 저장 확인 메시지가 표시된다"
> ```
>
> **핵심 원칙**: `"` 로 시작했으면 **같은 줄에서** `"` 로 닫아야 합니다. 줄바꿈이 필요하면 `|` 를 사용하세요.

```yaml
plan_name: "emotion-diary"
project_name: "감정 일기 앱"
created_at: "2026-02-06"
status: "active"     # active | paused | completed | archived

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
    done_when: "[짧으면 한 줄 double-quote, 길면 | 블록 스칼라 사용]"
    started_at: null
    completed_at: null
    masks_used: []
    checklist:
      - "[체크 항목 1]"
      - "[체크 항목 2]"
    tasks: []
```

**state.yaml 업데이트**:

```yaml
active_plan: "emotion-diary"
```

**완료 메시지**:
```markdown
✅ 플랜이 승인되었습니다!

📁 생성된 파일: `.opencode/weave/plans/emotion-diary.yaml`
📌 활성 플랜으로 설정됨

### 다음 단계
Phase 1을 시작하려면:
`/weave-craft P1`
```

---

## 기존 플랜이 있는 경우

활성 플랜이 이미 존재하면:
```markdown
ℹ️ 현재 활성 플랜: `todo-app` (P2 진행 중)

새 플랜을 추가하면 기존 플랜은 유지되고, 새 플랜이 활성 플랜이 됩니다.
기존 플랜으로 돌아가려면: `/weave-switch todo-app`

계속 진행할까요?
```

---

## 주의사항

1. **Phase는 작게**: 큰 Phase는 분할
2. **복잡한 분석은 위임**: Task(dummy-human)으로 전문가 위임
3. **테스트 가능해야**: 각 Phase 끝에 유저가 확인할 수 있어야
4. **아키텍처는 유연하게**: "변경 가능"을 명시
5. **플랜 이름은 kebab-case**: 파일명이 되므로 영문 소문자, 하이픈만 사용
