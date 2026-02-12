---
description: Phase 실행 (Build + Self-Verify Loop with Mask auto-selection)
---

# /weave-craft - Phase 실행

## 개요

**활성 플랜**의 특정 Phase를 실행합니다.
AI가 자동으로 검증 루프를 돌리고, 완료되면 유저에게 전달합니다.

**사용법**: `/weave-craft $ARGUMENTS`
- `$ARGUMENTS` = Phase ID (예: `P1`, `P2`)

**Maskweaver 통합**:
- **Masks**: Task별 전문가 마스크 자동 선택
- **Global Knowledge**: 과거 트러블슈팅 경험 검색/기록
- **Verify**: 다층 AI 자동 검증 시스템

---

## 사전 조건: 활성 플랜 확인

실행 전 반드시:

```
1. .opencode/weave/state.yaml 읽기
2. active_plan 값 확인
3. .opencode/weave/plans/{active_plan}.yaml 읽기
4. 해당 Phase 상태 확인
```

**활성 플랜이 없는 경우**:
```markdown
❌ 활성 플랜이 없습니다.

플랜을 먼저 만들어주세요: `/weave-design [docs]`
또는 기존 플랜을 선택하세요: `/weave-switch`
```

**요청한 Phase가 없는 경우**:
```markdown
❌ 플랜 `emotion-diary`에 Phase P7이 없습니다.

사용 가능한 Phase:
- P1: 감정 선택 UI ✅
- P2: 감정 저장 🔄
- P3: 히스토리 뷰 ⏳
```

---

## 실행 흐름

```
0. LOAD PLAN (활성 플랜 + Phase 정보 로드)
   ↓
1. UNDERSTAND (Phase 요구사항 확인)
   ↓
2. DESIGN (Task 분해 + 설계)
   ↓
3. BUILD + SELF-VERIFY LOOP
   ├─ 각 Task에 대해:
   │   ├─ 적합한 마스크 자동 선택
   │   ├─ 테스트 먼저 (Red)
   │   ├─ 최소 구현 (Green)
   │   ├─ 정리 (Refactor)
   │   └─ AI 자동 검증 → PASS/FAIL
   │       ├─ PASS → 다음 Task
   │       └─ FAIL → 글로벌 지식 검색 → 수정 → 재검증
   └─ 5회 초과 → 유저에게 도움 요청
   ↓
4. UPDATE PLAN (Phase 상태 업데이트)
   ↓
5. USER HANDOFF (검증 완료 → 유저 테스트)
```

---

## Step 0: LOAD PLAN

```yaml
# 1. state.yaml에서 활성 플랜 확인
active_plan: "emotion-diary"

# 2. plans/emotion-diary.yaml에서 Phase 정보 로드
# 3. Phase 상태가 pending 또는 in_progress인지 확인
# 4. completed인 Phase를 재실행하려면 유저에게 확인
```

---

## Expert Summoning Strategy for Execution (Core)

### Principle: The Right Expert for Each Task

You are the **Mask Weaver**. During execution, your role is to **orchestrate experts**, not to do everything yourself. Each domain has its master — summon them.

---

### 1. Task Complexity → Execution Strategy

#### Handle Directly (Simple Tasks)

```
Examples:
- Simple file creation
- Minor styling adjustments
- Configuration changes
- Straightforward bug fixes

→ You handle these quickly without delegation.
```

#### Summon Expert (Complex Single Task)

For **substantial implementation work**, summon the domain expert:

```
Complex Business Logic:

Task(dummy-human):
  Mask: Kent Beck
  Task: "Implement the payment validation logic using TDD.
         Write tests first, cover edge cases, keep it simple."

Complex State Management:

Task(dummy-human):
  Mask: Dan Abramov
  Task: "Design the global state architecture for this feature.
         Consider React patterns and performant updates."

Performance-Critical Code:

Task(dummy-human):
  Mask: Linus Torvalds
  Task: "Optimize this data processing function.
         Focus on memory efficiency and computational complexity."

→ You receive the completed work and integrate it.
```

#### Squad Parallel Execution (Multiple Independent Tasks)

When a Phase has **several independent tasks**, run them in parallel:

```
Phase with Frontend + Backend + Tests:

Mask Weaver:
1. squad start → "Phase P1 Parallel Execution"
2. squad squad (ui-squad) → "Dan Abramov: Build the React components"
3. squad squad (api-squad) → "Martin Fowler: Implement the API layer"
4. squad squad (test-squad) → "Kent Beck: Write comprehensive test suite"

→ Collect all results → Integrate → Run unified verification
```

---

### 2. Expert Selection Guide

| Task Type | Summon | Why |
|-----------|--------|-----|
| Business logic, algorithms | **Kent Beck** | TDD ensures correctness, simplicity |
| React components, state | **Dan Abramov** | React patterns, hooks, performance |
| API design, services | **Martin Fowler** | Clean architecture, separation |
| Performance optimization | **Linus Torvalds** | System-level efficiency |
| Database, queries | **Martin Fowler** | Data modeling, query patterns |
| ML/AI features | **Andrew Ng** | ML best practices |
| DevOps, infrastructure | **Linus Torvalds** | Pragmatic tooling |

---

### 3. Execution Decision Flow

```
Analyze Task
    ↓
Can you finish in 5 minutes?
    ├─ YES → Handle directly
    └─ NO → Single focused task?
               ├─ YES → Summon domain expert
               └─ NO → Multiple independent tasks?
                          ├─ YES → Squad parallel
                          └─ NO → Sequential expert delegation
```

---

### 4. Expert Rotation on Failure

If you're **stuck on the same error twice**, try a different perspective:

```
Stuck on React state bug:
- First attempt: Dan Abramov approach
- Still failing → Summon Kent Beck
  "Review this from a TDD perspective"

Stuck on performance issue:
- First attempt: Linus Torvalds approach  
- Still failing → Summon Martin Fowler
  "Maybe this is an architecture problem, not just optimization."
```

---

## AI 자동 검증 시스템 (Multi-Layer)

| Layer | 검증 유형 | 도구 | 실패 시 동작 |
|-------|----------|------|-------------|
| 1 | TypeCheck | `tsc --noEmit` | 재시도 (코드 수정) |
| 2 | Lint | `npm run lint` | 재시도 (코드 수정) |
| 3 | Build | `npm run build` | 재시도 (코드 수정) |
| 4 | Unit Tests | `npm test` | 재시도 (테스트/코드 수정) |
| 5 | E2E Tests | `playwright test` | 재시도 (앱/테스트 수정) |
| 6 | Screenshot | Playwright / browser | 시각적 확인 |
| 7 | API Check | `fetch` / `curl` | 재시도 (서버/라우트 수정) |
| 8 | A11y | axe-core / Lighthouse | 재시도 (접근성 개선) |

### 검증 재시도 루프

```
검증 실행
    ↓
실패?
    ├─ YES → 글로벌 지식에서 유사 해결책 검색
    │         → 해결책 적용
    │         → 재시도 카운터 < 5? → 다시 검증
    │         → 5회 초과 → 유저에게 도움 요청
    └─ NO → 다음 Layer
```

---

## Step 4: UPDATE PLAN

Phase 완료 시 플랜 파일을 업데이트합니다:

```yaml
# .opencode/weave/plans/{active_plan}.yaml 내 해당 Phase 업데이트:
phases:
  - id: "P1"
    status: "completed"         # pending → in_progress → completed
    started_at: "2026-02-06T10:30:00"
    completed_at: "2026-02-06T13:00:00"
    masks_used:
      - name: "kent-beck"
        tasks: 2
        effectiveness: 0.9
      - name: "dan-abramov"
        tasks: 1
        effectiveness: 0.85
    retry_count: 1
    issues:
      - "JSON 직렬화 오류 → useEffect 의존성 추가로 해결"
```

---

## 유저 핸드오프

모든 Task 통과 후:

### 1. AI 사전 체험 (Virtual User Test)

코드 검증이 끝나면, **가상의 대상 사용자 페르소나**를 만들어 주관적 항목을 먼저 평가한다.

#### 페르소나 생성 기준

플랜의 목적과 대상 사용자를 기반으로 적절한 페르소나를 구성한다:

```yaml
virtual_user:
  name: "직장인 김지수 (30대)"           # 프로젝트 대상에 맞는 가상 인물
  context: "퇴근 후 하루를 정리하며 감정 기록"  # 사용 맥락
  goals: "간단하고 빠르게 오늘의 감정을 남기고 싶다"
  tech_level: "일반 사용자"               # 기술 수준
```

#### 평가 항목

페르소나 관점에서 다음을 평가한다:

| 항목 | 평가 관점 |
|------|----------|
| **느낌/톤** | UI 분위기가 프로젝트 의도와 맞는가? (스크린샷 기반) |
| **사용 흐름** | 핵심 동작이 직관적으로 완료되는가? (클릭 수, 동선) |
| **기능 일치** | 플랜에 정의된 기능이 실제로 동작하는가? |
| **첫인상** | 처음 본 사용자가 헤매지 않을까? |

#### 평가 방법

- **스크린샷 촬영**: 브라우저로 주요 화면을 캡처하여 시각적으로 확인
- **동선 시뮬레이션**: 핵심 시나리오를 실제로 클릭하며 체험
- **플랜 대조**: 원래 요구사항과 구현 결과를 항목별로 비교

### 2. 핸드오프 메시지 형식

```markdown
## ✅ Phase P1 검증 완료!

**플랜**: `emotion-diary`

### AI 자동 테스트 결과
| 테스트 | 결과 |
|--------|------|
| Build | ✅ 성공 |
| Unit Tests | ✅ 15/15 |
| Lint | ✅ 통과 |

### 사용된 마스크
- Kent Beck (테스트)
- Dan Abramov (React 컴포넌트)

### 접속
http://localhost:5173

### AI 사전 체험 결과

> 💡 **"직장인 김지수 (30대)"** 관점으로 먼저 사용해봤습니다.
> 한번 확인해보세요.

| 항목 | AI 평가 | 비고 |
|------|---------|------|
| 느낌/톤 | ✅ 부드러운 파스텔 톤이 감정 기록 앱에 적합해 보입니다 | 스크린샷 첨부 |
| 사용 흐름 | ⚠️ 감정 선택 → 저장까지 3탭인데, 2탭이면 더 자연스러울 것 같습니다 | 중간 확인 화면 생략 검토 |
| 기능 일치 | ✅ 감정 선택 UI가 플랜대로 동작합니다 | - |
| 첫인상 | ✅ 아이콘만으로 감정이 구분됩니다 | - |

> 위 내용은 AI가 가상 사용자로서 판단한 것입니다.
> 실제 느낌과 다를 수 있으니 직접 확인 부탁드립니다.

**다음**: `/weave-craft P2` | **상태**: `/weave-status`
```

### 3. 핵심 원칙

- **빈 체크박스를 던지지 않는다**: AI가 먼저 체험하고 소견을 제시한다
- **단정하지 않는다**: "~해 보입니다", "~인 것 같습니다" 톤으로 제안한다
- **유저 판단을 대체하지 않는다**: 최종 확인은 반드시 유저 몫
- **구체적 근거를 붙인다**: 스크린샷, 클릭 수, 플랜 대조 등 판단 근거를 함께 제시

---

## 코드 품질 체크

각 Task 완료 시 적용:

```yaml
SOLID:
  - "한 함수/클래스가 여러 일을 하지 않는가?"
  - "새 기능 추가 시 기존 코드 수정 최소화?"

KISS:
  - "더 간단한 방법이 있는가?"
  - "불필요한 추상화가 있는가?"

DRY:
  - "같은 코드가 반복되는가?"
  - "공통 함수로 추출할 것이 있는가?"
```
