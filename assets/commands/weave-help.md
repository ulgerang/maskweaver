---
name: weave-help
description: Weave 워크플로우 도움말
usage: /weave help
examples:
  - /weave help
  - /weave
---

# /weave help - Weave 워크플로우 도움말

## Weave란?

Maskweaver의 Phase-Driven Development 워크플로우입니다.
"AI가 검증하고, 유저가 확인한다"

---

## 핵심 철학

```
1. 테스트 먼저 (Protect Before Change)
2. 작게 자주 (Small & Often)
3. 동작이 정답 (Working > Perfect)
```

---

## 명령어 목록

| 명령어 | 설명 |
|--------|------|
| `/weave design [docs]` | 요구사항 분석 → Phase 계획 |
| `/weave craft [id]` | Phase 실행 (자동 검증) |
| `/weave status` | 진행 상황 확인 |
| `/weave help` | 이 도움말 |

---

## Maskweaver 통합 기능

### 🎭 마스크 자동 선택

작업 맥락에 따라 전문가 마스크가 자동 선택됩니다:
- 아키텍처 → Martin Fowler
- 테스트 → Kent Beck
- React → Dan Abramov
- 성능 → Linus Torvalds

### 🧠 글로벌 지식 공유

트러블슈팅 경험이 프로젝트 간 공유됩니다:
- 에러 발생 시 → 과거 솔루션 검색
- 해결 시 → 새 솔루션 기록
- 저장 위치: `~/.maskweaver/knowledge.sqlite`

### ✅ 3-Tier 검증

검증 실패 시 에스컬레이션:
1. Flash (빠른 검증)
2. Human (상세 검증)
3. Premium (심층 분석)

### 📝 회고 시스템

Phase 완료 시 자동 분석:
- 어떤 마스크가 효과적이었는지
- 얼마나 시간이 걸렸는지
- 자주 발생한 이슈

---

## 빠른 시작

```bash
# 1. 요구사항 문서로 계획 수립
/weave design wiki/

# 2. 피드백 → 승인
"좋아, 진행해"

# 3. Phase 실행
/weave craft P1

# 4. 테스트 → Approve

# 5. 반복
/weave craft P2 ...
```

---

## 더 알아보기

- Maskweaver: https://github.com/ulgerang/maskweaver
- 전문가 마스크 목록: `/mask list`
- 메모리 검색: `@memory search [query]`
