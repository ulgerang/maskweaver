---
name: weave-craft
description: Phase 실행 (Build + Self-Verify Loop with Mask auto-selection)
usage: /weave craft [phase-id]
examples:
  - /weave craft P1
  - /weave craft P2
---

# /weave craft - Phase 실행

## 개요

특정 Phase를 실행합니다. AI가 자동으로 검증 루프를 돌리고, 완료되면 유저에게 전달합니다.

**Maskweaver 통합**:
- 🎭 **Masks**: Task별 전문가 마스크 자동 선택
- 🧠 **Global Knowledge**: 과거 트러블슈팅 경험 검색/기록
- ✅ **Verify**: 다층 AI 자동 검증 시스템

---

## 실행 흐름

```
1. UNDERSTAND (Phase 요구사항 확인)
   ↓
2. DESIGN (Task 분해 + 설계)
   ↓
3. BUILD + SELF-VERIFY LOOP
   ├─ 각 Task에 대해:
   │   ├─ 적합한 마스크 자동 선택 🎭
   │   ├─ 테스트 먼저 (Red)
   │   ├─ 최소 구현 (Green)
   │   ├─ 정리 (Refactor)
   │   └─ AI 자동 검증 → PASS/FAIL
   │       ├─ PASS → 다음 Task
   │       └─ FAIL → 글로벌 지식 검색 → 수정 → 재검증
   └─ 5회 초과 → 유저에게 도움 요청
   ↓
4. USER HANDOFF (검증 완료 → 유저 테스트)
```

---

## 🤖 AI 자동 검증 시스템 (Multi-Layer)

AI가 **유저에게 전달하기 전에** 실행하는 자동 검증 단계:

| Layer | 검증 유형 | 도구 | 실패 시 동작 |
|-------|----------|------|-------------|
| 1️⃣ | TypeCheck | `tsc --noEmit` | 재시도 (코드 수정) |
| 2️⃣ | Lint | `npm run lint` | 재시도 (코드 수정) |
| 3️⃣ | Build | `npm run build` | 재시도 (코드 수정) |
| 4️⃣ | Unit Tests | `npm test` | 재시도 (테스트/코드 수정) |
| 5️⃣ | E2E Tests | `playwright test` | 재시도 (앱/테스트 수정) |
| 6️⃣ | Screenshot | Playwright / browser_subagent | 시각적 확인 |
| 7️⃣ | API Check | `fetch` / `curl` | 재시도 (서버/라우트 수정) |
| 8️⃣ | A11y | axe-core / Lighthouse | 재시도 (접근성 개선) |

### 검증 재시도 루프

```
검증 실행
    ↓
실패?
    ├─ YES ─────────────────────────────┐
    │   ↓                               │
    │   글로벌 지식에서 유사 해결책 검색 🔍  │
    │   ↓                               │
    │   해결책 적용                       │
    │   ↓                               │
    │   재시도 카운터 < 5?               │
    │       ├─ YES → 다시 검증 ────────→ │
    │       └─ NO → 유저에게 도움 요청    │
    │                   ↓                │
    │           [ESCALATE]               │
    │                                    │
    └─ NO ─→ 다음 Layer ────────────────┘
```

### 검증 도구 상세

#### Playwright (E2E + Screenshot)

```typescript
// E2E 테스트
npx playwright test

// 스크린샷 캡처
await page.goto('http://localhost:3000');
await page.screenshot({ path: 'screenshot.png', fullPage: true });
```

#### browser_subagent (시각적 테스트)

Antigravity의 browser_subagent를 활용:
1. 브라우저에서 페이지 로드
2. 특정 요소 확인
3. 스크린샷 캡처
4. DOM 분석

#### DevTools 연동

```typescript
// Console 에러 확인
page.on('console', msg => {
  if (msg.type() === 'error') recordError(msg.text());
});

// Network 요청 검증
page.on('response', response => {
  if (response.status() >= 400) recordError(`${response.url()}: ${response.status()}`);
});
```

#### 접근성 검사 (axe-core)

```typescript
const AxeBuilder = require('@axe-core/playwright').default;
const results = await new AxeBuilder({ page }).analyze();
// violations 배열로 접근성 이슈 확인

---

## 마스크 자동 선택

AI가 작업 맥락을 분석하여 적합한 전문가 마스크를 선택합니다:

| 작업 유형 | 자동 선택 마스크 |
|----------|-----------------|
| 아키텍처/설계 | 🏗️ Martin Fowler |
| 테스트/TDD | 🧪 Kent Beck |
| React/프론트엔드 | ⚛️ Dan Abramov |
| 성능/시스템 | 🐧 Linus Torvalds |
| ML/AI | 🧠 Andrew Ng |

**마스크 로테이션**: 같은 에러가 반복되면 다른 관점의 마스크로 교체

---

## 글로벌 지식 검색 (Cross-Project RAG)

에러 발생 시:
1. `~/.maskweaver/knowledge.sqlite`에서 유사 에러 검색
2. 과거 해결책 참조하여 수정 시도
3. 성공적으로 해결되면 새 솔루션 기록

```
에러 발생
    ↓
글로벌 지식베이스 검색 🔍
    ↓
유사 솔루션 발견?
    ├─ YES → 솔루션 적용 → 검증
    └─ NO → 직접 해결 시도
              ↓
         해결 성공 → 솔루션 기록 📝
```

---

## 진행 상황 출력

```markdown
### Task 진행 상황

#### Task 1: EmotionButton 컴포넌트
- [x] 마스크 선택: 🧪 Kent Beck
- [x] 테스트 작성
- [x] 구현
- [x] 검증 ✅

#### Task 2: 선택 상태 관리
- [x] 마스크 선택: ⚛️ Dan Abramov
- [x] 테스트 작성
- [x] 구현
- [ ] 검증 🔄 (재시도 2/5)
  - 💡 유사 솔루션 발견: "React state 업데이트 타이밍 이슈"
  - 수정: useEffect 의존성 배열 추가
```

---

## 유저 핸드오프

모든 Task 통과 후:

```markdown
## ✅ Phase P1 검증 완료!

### 🤖 AI 자동 테스트 결과
| 테스트 | 결과 |
|--------|------|
| Build | ✅ 성공 |
| Unit Tests | ✅ 15/15 |
| Lint | ✅ 통과 |

### 🎭 사용된 마스크
- Kent Beck (테스트)
- Dan Abramov (React 컴포넌트)

### 🔗 접속
http://localhost:5173

### 👤 사람만 판단 가능한 것
- [ ] 느낌이 의도대로인가요?
- [ ] 사용성이 좋은가요?
- [ ] 원하던 기능이 맞나요?

**[Approve]** **[Changes]** **[Later]**
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

### 시도한 마스크
- Kent Beck → 실패
- Martin Fowler → 실패 (관점 전환 시도)

### 제안
- [제안 1]
- [제안 2]

어떻게 할까요?
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
