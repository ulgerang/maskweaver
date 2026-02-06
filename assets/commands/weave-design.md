---
name: weave-design
description: 요구사항 분석 및 Phase 계획 수립
usage: /weave design [문서 위치 또는 설명]
examples:
  - /weave design docs/
  - /weave design wiki/requirements.md
  - /weave design 기획 폴더
  - /weave design README에 있는 요구사항
  - /weave design 아까 만든 스펙 문서
  - /weave design 어제 정리해둔 기능 목록
---

# /weave design - 요구사항 분석 및 계획 수립

## 개요

유저의 요구사항 문서를 분석하고, Phase별 실행 계획을 수립합니다.

**입력 방식**: 
- ✅ 정확한 경로: `docs/`, `wiki/spec.md`
- ✅ 자연어 힌트: `기획 폴더`, `README`, `아까 만든 문서`

> AI가 자동으로 프로젝트를 탐색하여 관련 문서를 찾습니다.

**Maskweaver 통합**:
- 📚 **Memory**: 과거 유사 프로젝트 검색하여 계획 참조
- 🎭 **Masks**: 아키텍처 분석에 Martin Fowler 마스크 자동 선택

---

## 실행 흐름

```
0. RESOLVE (입력 해석 → 실제 경로 찾기)
   ↓
1. INTAKE (문서 분석)
   ↓
2. CLARIFY (불명확한 부분 질문)
   ↓
3. PLAN (계획서 제시)
   ↓
4. FEEDBACK (유저 피드백 → 수정)
   ↓
5. APPROVE (승인 시 PLAN.yaml 생성)
```

---

## 단계별 상세

### Step 0: RESOLVE (경로 해석)

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

**출력 (후보가 여러 개일 때)**:
```markdown
## 🔍 문서를 찾고 있습니다

"기획 폴더"로 검색한 결과:

1. 📁 `docs/` - 5개 파일 (가장 유력)
2. 📁 `wiki/planning/` - 3개 파일
3. 📄 `SPEC.md` - 루트에 있는 스펙 문서

어떤 것을 분석할까요? (번호 또는 "전부")
```

---

### Step 1: INTAKE

**수행 작업**:
1. **해석된 경로**의 모든 문서 읽기 (md, yaml, txt)
2. 핵심 기능 추출
3. 도메인 용어 파악
4. 기술적 요구사항 식별
5. **과거 유사 프로젝트 검색** (Memory 시스템)

**출력 형식**:
```markdown
## 📄 문서 분석 결과

### 핵심 기능
1. [기능 1]
2. [기능 2]

### 기술적 요구사항
- Frontend: [...]
- Backend: [...]
- Database: [...]

### 유사 프로젝트 (Memory에서 검색)
- [과거 프로젝트 1]: [참고할 점]
```

---

### Step 2: CLARIFY

**수행 작업**:
1. 불명확한 부분 식별
2. 선택지가 있는 경우 옵션 제시
3. 누락된 정보 요청

**출력 형식**:
```markdown
## ❓ 확인이 필요합니다

### 1. [질문 제목]
- Option A: [...]
- Option B: [...]

---
답변해주시면 계획서를 만들겠습니다.
```

---

### Step 3: PLAN

**Phase 크기 기준**:
- 한 Phase = 반나절 ~ 하루 작업량
- 끝나면 유저가 뭔가 "해볼 수 있어야" 함

**출력 형식**:
```markdown
## 📋 실행 계획서

### 비전
[전체 목표 요약]

### 아키텍처 (변경 가능)
- Frontend: [...]
- Backend: [...]
- Note: 진행하면서 조정될 수 있습니다

### Phase 계획

| Phase | 이름 | 완료 조건 | 예상 시간 |
|-------|------|----------|----------|
| P1 | [...] | [...] | 2-3시간 |
| P2 | [...] | [...] | 2-3시간 |

---
이 계획이 괜찮으세요? 수정이 필요하면 말씀해주세요.
```

---

### Step 4: APPROVE

**생성 파일**: `.opencode/weave/PLAN.yaml`

```yaml
project_name: "[프로젝트명]"
created_at: "2026-02-06"

vision: |
  [전체 비전]

architecture:
  frontend: "[...]"
  backend: "[...]"
  database: "[...]"

phases:
  - id: "P1"
    name: "[Phase 이름]"
    status: "pending"
    done_when: "[완료 조건]"
    checklist:
      - "[체크 항목 1]"
      - "[체크 항목 2]"
    tasks: []
```

**완료 메시지**:
```markdown
✅ 계획이 승인되었습니다!

📁 생성된 파일: `.opencode/weave/PLAN.yaml`

### 다음 단계
Phase 1을 시작하려면:
/weave craft P1
```

---

## 주의사항

1. **Phase는 작게**: 큰 Phase는 분할
2. **테스트 가능해야**: 각 Phase 끝에 유저가 확인할 수 있어야
3. **아키텍처는 유연하게**: "변경 가능"을 명시
