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

## 핵심 원칙: 요청받은 Phase만 구현

> **⚠️ CRITICAL: `/weave-craft`는 지정된 Phase의 작업만 수행합니다. 다른 Phase의 작업이나 계획에 없는 범위 밖 구현은 절대 수행하지 않습니다.**

- 플랜 파일에 정의된 해당 Phase의 `checklist`와 `tasks` 항목만 구현합니다.
- 다음 Phase에 해당하는 작업을 미리 구현하지 않습니다.
- Phase 범위에 명시되지 않은 기능, 파일, 설정을 추가하지 않습니다.
- 범위 밖 작업이 필요하다고 판단되면, 구현하지 않고 유저에게 알려 플랜 수정을 제안합니다.

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

### YAML 읽기 실패 시 자동 수복

플랜 파일(`state.yaml` 또는 `plans/*.yaml`)을 읽었을 때 YAML 파싱 에러가 발생하면, 자동 수복을 시도합니다.

**일반적인 깨짐 패턴과 수복 방법**:

| 깨짐 패턴 | 증상 | 수복 방법 |
|-----------|------|----------|
| 들여쓰기 불일치 | `bad indentation` 에러 | 들여쓰기를 2-space 기준으로 정규화 |
| 탭 문자 혼입 | `tab character` 에러 | 탭 → 2 spaces 변환 |
| 따옴표 미닫힘 | `unexpected end of stream` | 열린 따옴표 찾아서 닫기 |
| 중복 키 | `duplicate key` 에러 | 나중에 나온 값 유지, 중복 제거 |
| 빈 값/null 깨짐 | `null` 대신 빈 문자열 | `null` 또는 적절한 기본값으로 복원 |
| 잘린 파일 | 파일이 중간에 끊김 | 마지막 완전한 블록까지 복원 후 유저 알림 |

```
YAML 읽기 수복 절차:
1. Read(yaml_path) → 파일 내용 로드
2. YAML 파싱 시도
   ├─ 성공 → 정상 진행
   └─ 실패 → 수복 시작
3. 수복 시도:
   a. 파일 원본 내용을 보존 (백업용 변수에 저장)
   b. 일반적인 깨짐 패턴 자동 교정 (위 표 참고)
   c. 교정된 내용으로 다시 YAML 파싱 시도
      ├─ 성공 → 교정된 내용으로 파일 덮어쓰기 + 유저에게 수복 사실 알림
      └─ 실패 → 4단계로
4. 수복 불가 시:
   a. 유저에게 "YAML 파일이 심각하게 손상됨" 알림
   b. 원본 내용을 그대로 출력하여 유저가 직접 수정할 수 있게 제공
   c. `/weave-design`으로 플랜 재생성 제안
```

> **주의**: 수복 시 원본 데이터를 최대한 보존합니다. 확실하지 않은 값은 추측하지 않고, 유저에게 확인을 요청합니다.

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

### 플랜 업데이트 후 검증 (필수)

플랜 파일 업데이트 후, 반드시 다음을 확인합니다:

1. **Phase 상태 반영 확인**: 해당 Phase의 `status`가 `completed`로 변경되었는지 검증
2. **타임스탬프 기록 확인**: `started_at`과 `completed_at`이 올바르게 기록되었는지 검증
3. **다른 Phase 무변경 확인**: 실행하지 않은 Phase들의 상태가 변경되지 않았는지 검증
4. **검증 실패 시**: 유저에게 오류를 알리고 플랜 파일 재업데이트 시도

```
검증 절차:
1. Read(".opencode/weave/plans/{active_plan}.yaml") → 전체 플랜 파일 읽기
2. 해당 Phase의 status == "completed" 확인
3. started_at, completed_at 값 존재 확인
4. 다른 Phase들의 status가 원래 값 그대로인지 확인
5. 모두 정상이면 → 유저 핸드오프 진행
6. 하나라도 실패하면 → 오류 보고 및 재시도
```

### YAML 쓰기 시 자동 수복

플랜 파일을 업데이트한 후 다시 읽어 검증할 때 YAML 파싱 에러가 발생하면, 업데이트 과정에서 YAML이 깨진 것입니다. 이 경우 자동 수복을 수행합니다.

```
YAML 쓰기 수복 절차:
1. 플랜 파일 업데이트 (Write)
2. 업데이트된 파일 다시 읽기 (Read)
3. YAML 파싱 시도
   ├─ 성공 → 정상 진행 (검증 계속)
   └─ 실패 → 쓰기 수복 시작
4. 쓰기 수복:
   a. 업데이트 전 원본 플랜 내용을 기반으로 재구성
   b. 변경해야 할 Phase 필드만 정확히 반영하여 YAML을 처음부터 다시 생성
   c. 재생성된 YAML로 파일 덮어쓰기
   d. 다시 읽어서 파싱 검증
      ├─ 성공 → 유저에게 "YAML 수복 후 정상 저장됨" 알림
      └─ 실패 → 5단계로
5. 재수복 실패 시:
   a. 유저에게 "플랜 파일 업데이트 중 YAML 손상 발생" 알림
   b. 정상적인 원본 내용 + 이번 Phase 변경사항을 텍스트로 출력
   c. 유저가 직접 확인 후 수동 저장하도록 안내
```

**쓰기 수복 시 핵심 규칙**:
- 업데이트 전 원본 파일 내용을 항상 메모리에 보관해 둡니다 (롤백 대비).
- YAML을 부분 편집(텍스트 치환)하지 않고, 전체 구조를 파악한 뒤 완전한 YAML로 재생성합니다.
- 특수문자가 포함된 문자열 값은 반드시 따옴표로 감쌉니다.
- 재생성 시 원본의 Phase 순서와 필드 순서를 유지합니다.

---

## 유저 핸드오프

모든 Task 통과 후:

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

### 사람만 판단 가능한 것
- [ ] 느낌이 의도대로인가요?
- [ ] 사용성이 좋은가요?
- [ ] 원하던 기능이 맞나요?

**다음**: `/weave-craft P2` | **상태**: `/weave-status`
```

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
