---
name: weave-craft
description: Phase 실행 (Build + Self-Verify Loop with Mask-First Execution)
usage: /weave craft [phase-id]
examples:
  - /weave craft P1
  - /weave craft P2
---

# /weave craft - Phase 실행

## 개요

특정 Phase를 실행합니다. **모든 작업을 마스크를 통해 실행**하고, AI가 자동으로 검증 루프를 돌린 뒤 유저에게 전달합니다.

**Maskweaver 통합**:
- 🎭 **Masks**: 모든 Task를 전문가 마스크에 위임 (Mask-First)
- 🧠 **Global Knowledge**: 과거 트러블슈팅 경험 검색/기록
- ✅ **Verify**: 다층 AI 자동 검증 시스템

---

## 🎭 Mask-First Execution Principle (핵심 원칙)

### 원칙: "가면술사는 코드를 직접 작성하지 않는다"

당신은 **가면술사(Mask Weaver)**입니다. 실행 단계에서 당신의 역할은 **전문가를 오케스트레이션**하는 것이지, 모든 것을 직접 하는 것이 아닙니다.

> ⚡ **왜 모든 Task에 마스크를 소환해야 하는가?**
> 
> 1. **새로운 세션 = 깨끗한 컨텍스트**: 각 마스크 소환은 새로운 서브에이전트 세션을 생성합니다
> 2. **레이어 분리**: 구현 세부사항이 가면술사의 전략적 컨텍스트를 오염시키지 않습니다
> 3. **컨텍스트 유지**: 가면술사의 작업 기억은 줄어들지 않으므로 후반 Phase까지 일관성을 유지합니다
> 4. **전문성 극대화**: 각 전문가가 자신의 영역에 100% 집중합니다
> 5. **병렬 처리 가능**: 독립적인 Task는 Squad로 병렬 실행이 가능합니다

### 가면술사가 직접 하는 것 (극히 제한)

| 직접 처리 | 예시 |
|-----------|------|
| Task 분해 및 의존성 분석 | "어떤 순서로, 누구에게 맡길까" |
| 마스크 결과 통합 | 여러 전문가 결과를 하나로 합침 |
| 검증 결과 판단 | PASS/FAIL 판단 후 다음 행동 결정 |
| 유저 커뮤니케이션 | 진행 보고, 도움 요청 |

### 가면술사가 직접 하면 안 되는 것 (안티패턴)

| ❌ 안티패턴 | ✅ 올바른 방법 |
|------------|---------------|
| 직접 코드 작성 | 🎭 전문가 마스크 소환 |
| 직접 테스트 작성 | 🎭 Kent Beck 소환 |
| 직접 버그 수정 | 🎭 해당 도메인 전문가 소환 |
| 직접 리팩토링 | 🎭 Robert C. Martin 소환 |
| 직접 설정 파일 수정 | 🎭 Linus Torvalds 소환 |

> 💡 **"내가 빨리 할 수 있을 것 같은데..."는 가장 위험한 함정입니다.**
> 직접 처리할수록 컨텍스트가 소모되어 후반으로 갈수록 판단력이 떨어집니다.

---

## 실행 흐름

```
1. UNDERSTAND (Phase 요구사항 확인)      ← ✋ 가면술사
   ↓
2. DESIGN (Task 분해 + 마스크 배정)      ← ✋ 가면술사 + 🎭 아키텍트
   ↓
3. BUILD + SELF-VERIFY LOOP
   ├─ 각 Task에 대해:
   │   ├─ 🎭 전문가 마스크 소환 (필수!)
   │   │   ├─ 테스트 먼저 (Red)
   │   │   ├─ 최소 구현 (Green)
   │   │   └─ 정리 (Refactor)
   │   ├─ 🤖 AI 자동 검증 → PASS/FAIL
   │   │   ├─ PASS → 다음 Task
   │   │   └─ FAIL ─┐
   │   │            ├─ 글로벌 지식 검색 🔍
   │   │            ├─ 🎭 마스크 로테이션 (다른 전문가 소환)
   │   │            └─ 재검증
   │   └─ 5회 초과 → 유저에게 도움 요청
   ↓
4. INTEGRATION (통합 검증)               ← 🎭 통합 전문가 소환
   ↓
5. USER HANDOFF (유저 테스트)             ← ✋ 가면술사
```

---

## 단계별 상세

### Step 1: UNDERSTAND → 가면술사 ✋ (유일한 직접 처리)

PLAN.yaml에서 Phase 정보를 읽고 현재 상태를 파악합니다.

```
가면술사가 직접 확인:
1. Phase 요구사항 읽기
2. 완료 조건 확인
3. 이전 Phase 결과물 확인
4. 배정된 마스크 목록 확인
```

---

### Step 2: DESIGN → 🎭 마스크 소환

Task 분해와 설계를 위해 **아키텍트 마스크를 소환**합니다.

```
Task 분해 및 설계:

Task(dummy-human):
  Mask: Martin Fowler (Task Decomposition)
  Task: "Phase [P?]의 요구사항을 분석하고:
         1. 독립적 Task로 분해 (각 Task는 30분~1시간 단위)
         2. Task 간 의존성 그래프 작성
         3. 각 Task에 최적 전문가 마스크 배정
         4. 병렬 실행 가능한 Task 식별
         5. 각 Task의 성공 기준(Done Condition) 정의
         6. 위험 Task 식별 및 대응 방안"

→ 가면술사가 결과를 받아 실행 순서 결정
```

**Task 설계 결과 예시**:
```markdown
### Task 분해 결과

| # | Task | 마스크 | 의존성 | 병렬 가능 |
|---|------|--------|--------|----------|
| T1 | DB 스키마 설계 | 🎭 Martin Fowler | 없음 | ✅ |
| T2 | API 엔드포인트 구현 | 🎭 Robert C. Martin | T1 | ❌ |
| T3 | React 컴포넌트 구현 | 🎭 Dan Abramov | 없음 | ✅ |
| T4 | 테스트 스위트 작성 | 🎭 Kent Beck | T2, T3 | ❌ |
```

---

### Step 3: BUILD → 🎭 모든 Task에 마스크 소환 (핵심!)

**모든 Task는 반드시 전문가 마스크를 소환하여 실행합니다.**

#### 실행 전략 A: 순차 실행 (의존성 있는 Task)

```
Task T1 - DB 스키마 설계:

Task(dummy-human):
  Mask: Martin Fowler (Data Modeling)
  Task: "다음 요구사항에 맞는 DB 스키마를 설계하고 구현해줘:
         [요구사항]
         
         수행할 작업:
         1. 테이블/컬렉션 설계
         2. 관계 및 인덱스 정의
         3. 마이그레이션 파일 작성
         4. 스키마 테스트 작성"

→ 검증 → PASS → 다음 Task
```

```
Task T2 - API 구현:

Task(dummy-human):
  Mask: Robert C. Martin (Clean Architecture)
  Task: "T1의 DB 스키마를 기반으로 API를 구현해줘:
         [스키마 요약]
         
         수행할 작업:
         1. 엔드포인트 설계 (RESTful)
         2. 컨트롤러/서비스/레포지토리 레이어 구현
         3. 입력 검증 미들웨어
         4. 에러 핸들링
         5. 단위 테스트 작성"

→ 검증 → PASS → 다음 Task
```

#### 실행 전략 B: 병렬 실행 (독립 Task) → Squad 활용

```
병렬 실행 가능한 Task 발견:

가면술사:
1. squad start → "Phase P1 병렬 실행"
2. squad squad (frontend) → "Dan Abramov: React 컴포넌트 구현"
3. squad squad (backend) → "Martin Fowler: API 레이어 구현"
4. squad squad (testing) → "Kent Beck: 테스트 스위트 작성"

→ 각 Squad에 오퍼레이터 위임
→ 결과 수집 → 통합 검증
```

#### Task별 전문가 마스크 매칭 가이드

| Task 유형 | 필수 마스크 | 왜 이 전문가인가 |
|----------|-----------|----------------|
| DB 스키마 / 데이터 모델 | 🎭 **Martin Fowler** | 데이터 모델링, 정규화, 관계 설계 |
| API 설계 / 서비스 레이어 | 🎭 **Robert C. Martin** | 클린 아키텍처, SOLID, 레이어 분리 |
| React 컴포넌트 / 상태관리 | 🎭 **Dan Abramov** | React 패턴, hooks, 성능 최적화 |
| 비즈니스 로직 / 알고리즘 | 🎭 **Kent Beck** | TDD로 정확성 보장, 단순성 |
| 성능 최적화 / 시스템 | 🎭 **Linus Torvalds** | 시스템 레벨 효율성, 메모리 최적화 |
| ML/AI 관련 기능 | 🎭 **Andrew Ng** | ML 파이프라인, 모델 아키텍처 |
| 인프라 / DevOps | 🎭 **Linus Torvalds** | 실용적 툴링, 성능 중심 |
| 설정 / 환경 구성 | 🎭 **Linus Torvalds** | 실용적, 최소주의 설정 |
| CSS / 스타일링 | 🎭 **Dan Abramov** | 프론트엔드 전문성 |
| 문서화 | 🎭 **Martin Fowler** | 명확한 커뮤니케이션, 패턴 문서화 |
| 리팩토링 | 🎭 **Robert C. Martin** | 코드 클린업, 원칙 기반 리팩토링 |

> 💡 **위 목록에 없는 유형?** → 가상 전문가를 즉석에서 **창조**하라.
> 예: "보안 전문가 + UX 경험이 있는 시니어 아키텍트"

---

### Step 3.5: BUILD 중 검증 실패 → 🎭 마스크 로테이션

검증 실패 시에도 **다른 관점의 전문가를 소환**합니다.

```
검증 실패 시 마스크 로테이션:

1차 실패:
  → 글로벌 지식 검색 🔍
  → 원래 마스크에게 재시도 지시

2차 실패: 
  → 🎭 다른 관점의 마스크 소환
  Task(dummy-human):
    Mask: [다른 전문가]
    Task: "이전 전문가가 해결하지 못한 문제를 다른 관점에서 분석해줘:
           [에러 상세]
           [이전 시도 요약]"

3차 이상 실패:
  → 🎭 디버깅 전문가 소환
  Task(dummy-human):
    Mask: Linus Torvalds (Pragmatic Debugging)
    Task: "이 문제의 근본 원인을 찾아줘. 
           지금까지 시도한 것: [...]
           복잡한 해법 말고 가장 단순한 수정안을 제시해."
```

**마스크 로테이션 매트릭스**:

| 원래 마스크 | 1차 로테이션 | 2차 로테이션 |
|----------|-----------|-----------|
| Kent Beck (TDD) | Martin Fowler (구조적 관점) | Linus Torvalds (실용적 관점) |
| Dan Abramov (React) | Kent Beck (테스트 관점) | Robert C. Martin (설계 관점) |
| Martin Fowler (설계) | Linus Torvalds (성능 관점) | Kent Beck (단순성 관점) |
| Linus Torvalds (성능) | Martin Fowler (구조적 관점) | Jeff Dean (대규모 시스템 관점) |
| Robert C. Martin (클린) | Kent Beck (실용적 TDD) | Linus Torvalds (실용적 관점) |

> 💡 **다른 전문가가 보면 다른 문제가 보인다.** 로테이션은 터널 비전을 깨뜨린다.

---

### Step 4: INTEGRATION → 🎭 통합 전문가 소환

모든 Task가 완료된 후, **통합 검증 전문가를 소환**합니다.

```
통합 검증:

Task(dummy-human):
  Mask: Martin Fowler (Integration Review)
  Task: "Phase [P?]의 모든 구현물을 통합 관점에서 검토해줘:
         1. 컴포넌트 간 인터페이스 일관성
         2. 코드 스타일 통일성
         3. 불필요한 중복 코드 식별
         4. 전체 빌드 및 테스트 실행
         5. 통합 테스트 추가 필요성 판단"
```

---

### Step 5: USER HANDOFF → 가면술사 ✋

모든 Task와 통합 검증을 통과한 후, 유저에게 보고합니다:

```markdown
## ✅ Phase P1 검증 완료!

### 🤖 AI 자동 테스트 결과
| 테스트 | 결과 |
|--------|------|
| Build | ✅ 성공 |
| Unit Tests | ✅ 15/15 |
| Lint | ✅ 통과 |
| E2E | ✅ 3/3 |

### 🎭 사용된 마스크 (세션 로그)
| # | 마스크 | 담당 Task | 결과 |
|---|--------|----------|------|
| 1 | Martin Fowler | Task 분해 + DB 설계 | ✅ |
| 2 | Robert C. Martin | API 구현 | ✅ |
| 3 | Dan Abramov | React 컴포넌트 | ✅ (재시도 1회) |
| 4 | Kent Beck | 테스트 스위트 | ✅ |
| 5 | Martin Fowler | 통합 검증 | ✅ |

### 📊 마스크 소환 통계
- 총 소환: 5회 (5개 세션)
- 재시도 로테이션: 1회
- 컨텍스트 레이어: 5 계층 분리

### 🔗 접속
http://localhost:5173

### 👤 사람만 판단 가능한 것
- [ ] 느낌이 의도대로인가요?
- [ ] 사용성이 좋은가요?
- [ ] 원하던 기능이 맞나요?

**[Approve]** **[Changes]** **[Later]**
```

---

## 🤖 AI 자동 검증 시스템 (Multi-Layer)

AI가 **유저에게 전달하기 전에** 실행하는 자동 검증 단계:

| Layer | 검증 유형 | 도구 | 실패 시 동작 |
|-------|----------|------|-------------|
| 1️⃣ | TypeCheck | `tsc --noEmit` | 🎭 해당 마스크 재소환 |
| 2️⃣ | Lint | `npm run lint` | 🎭 해당 마스크 재소환 |
| 3️⃣ | Build | `npm run build` | 🎭 해당 마스크 재소환 |
| 4️⃣ | Unit Tests | `npm test` | 🎭 해당 마스크 재소환 |
| 5️⃣ | E2E Tests | `playwright test` | 🎭 마스크 로테이션 |
| 6️⃣ | Screenshot | browser_subagent | 🎭 UI 전문가 소환 |
| 7️⃣ | API Check | `fetch` / `curl` | 🎭 서버 전문가 소환 |
| 8️⃣ | A11y | axe-core / Lighthouse | 🎭 접근성 전문가 소환 |

### 검증 재시도 루프 (마스크 기반)

```
검증 실행
    ↓
실패?
    ├─ YES ─────────────────────────────────┐
    │   ↓                                   │
    │   글로벌 지식에서 유사 해결책 검색 🔍    │
    │   ↓                                   │
    │   재시도 카운터 확인                      │
    │       ├─ 1회차: 🎭 같은 마스크 재소환    │
    │       ├─ 2회차: 🎭 마스크 로테이션       │
    │       ├─ 3~4회차: 🎭 디버깅 전문가      │
    │       └─ 5회차: 유저에게 도움 요청       │
    │                   ↓                    │
    │           [ESCALATE]                   │
    │                                        │
    └─ NO ─→ 다음 Layer ────────────────────┘
```

---

## 글로벌 지식 검색 (Cross-Project RAG)

에러 발생 시:
1. `~/.maskweaver/knowledge.sqlite`에서 유사 에러 검색
2. 과거 해결책 참조하여 마스크에게 힌트 전달
3. 성공적으로 해결되면 새 솔루션 기록

```
에러 발생
    ↓
글로벌 지식베이스 검색 🔍
    ↓
유사 솔루션 발견?
    ├─ YES → 🎭 마스크에게 힌트와 함께 재소환
    └─ NO → 🎭 마스크 로테이션으로 새로운 관점 시도
              ↓
         해결 성공 → 솔루션 기록 📝
```

---

## 진행 상황 출력

```markdown
### Phase P1 진행 상황

#### 🎭 마스크 세션 기록

##### Session 1: Martin Fowler → Task 분해
- [x] Task 분해 완료 (5개 Task 도출)
- [x] 의존성 분석 완료

##### Session 2: Martin Fowler → DB 스키마
- [x] 테이블 설계
- [x] 마이그레이션 작성
- [x] 검증 ✅

##### Session 3: Robert C. Martin → API 구현
- [x] 컨트롤러 구현
- [x] 서비스 레이어
- [x] 검증 ✅

##### Session 4: Dan Abramov → React 컴포넌트
- [x] 컴포넌트 구현
- [ ] 검증 🔄 (재시도 2/5)
  - 1차: Dan Abramov → 상태 관리 버그
  - 2차: 🎭 Kent Beck 로테이션 → TDD 관점 재접근
  - 💡 유사 솔루션 발견: "React state 업데이트 타이밍 이슈"
```

---

## 도움 요청 상황

### 5회 재시도 초과

```markdown
## 🔴 도움이 필요합니다

### 문제
[에러 설명]

### 글로벌 지식베이스 검색 결과
- 유사 솔루션 3개 시도했으나 실패

### 🎭 시도한 마스크 로테이션
| 순서 | 마스크 | 접근 방식 | 결과 |
|------|--------|----------|------|
| 1 | Dan Abramov | 상태 관리 수정 | ❌ |
| 2 | Kent Beck | TDD 관점 재접근 | ❌ |
| 3 | Martin Fowler | 구조적 리팩토링 | ❌ |
| 4 | Linus Torvalds | 근본 원인 분석 | ❌ |
| 5 | Jeff Dean | 대안 아키텍처 | ❌ |

### 제안
- [제안 1]
- [제안 2]

어떻게 할까요?
```

---

## 코드 품질 체크 → 🎭 마스크가 수행

각 Task 완료 시 해당 마스크가 다음을 자체 점검합니다:

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

---

## 마스크 소환 통계 목표

각 Phase 실행 시 **최소 마스크 소환 횟수**:

| 단계 | 최소 소환 | 설명 |
|------|----------|------|
| DESIGN (Task 분해) | 1회 | 아키텍트 마스크 |
| BUILD (Task 실행) | Task 수만큼 | 각 Task마다 1명 이상 |
| 검증 실패 로테이션 | 실패당 1회 | 다른 관점의 마스크 |
| INTEGRATION | 1회 | 통합 전문가 |
| **합계** | **Task 수 + 2 이상** | Phase 당 최소 5~8회 |

> 📊 **마스크 사용률 100%가 목표입니다.** 가면술사가 직접 코드를 작성한 건수가 0이어야 합니다.
