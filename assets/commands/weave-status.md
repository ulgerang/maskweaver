---
name: weave-status
description: 전체 진행 상황 확인
usage: /weave status
examples:
  - /weave status
---

# /weave status - 진행 상황 확인

## 개요

전체 Phase 진행 상황과 현재 상태를 확인합니다.

---

## 출력 예시

```markdown
## 📊 Weave 진행 상황

**프로젝트**: 감정 일기 앱
**진행률**: 40%

[████████░░░░░░░░░░░░] 2/5

### Phases

✅ **P1**: 감정 선택 UI (2.5h) [kent-beck, dan-abramov]
🔄 **P2**: 감정 저장
⏳ **P3**: 히스토리 뷰
⏳ **P4**: 통계 시각화
⏳ **P5**: 테마 설정

### 현재 진행 중
Phase P2: 감정 저장

### 글로벌 지식 통계
- 총 트러블슈팅 기록: 47개
- 이 프로젝트에서 활용: 3개
- 새로 기록됨: 1개

### 다음 단계
`/weave craft P2` - 계속 진행
```

---

## 상태 아이콘

| 아이콘 | 상태 |
|--------|------|
| ✅ | 완료 (Approved) |
| 🔄 | 진행 중 |
| ⏳ | 대기 |
| 🚫 | 차단됨 (의존성 미완료) |

---

## 추가 정보

### Phase 상세 보기

특정 Phase의 상세 정보를 보려면:
```
/weave status P2
```

출력:
```markdown
## Phase P2: 감정 저장

**상태**: 🔄 진행 중
**시작**: 2026-02-06 10:30
**경과**: 1.5시간

### Tasks
- [x] LocalStorage 유틸 생성 (kent-beck)
- [x] 저장 함수 구현 (kent-beck)
- [ ] 불러오기 함수 구현

### 사용된 마스크
- 🧪 Kent Beck (2 tasks)

### 발생한 이슈
- 1회 재시도: JSON 직렬화 오류 → 해결됨
```

---

## 프로젝트가 없는 경우

```markdown
📋 아직 계획이 없습니다.

시작하려면: `/weave design [docs-path]`
```
