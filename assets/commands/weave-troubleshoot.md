---
description: 글로벌 지식 검색 및 솔루션 기록
---

# /weave-troubleshoot - 트러블슈팅

## 개요

글로벌 지식베이스에서 유사한 문제의 해결책을 검색하거나, 새로운 해결책을 기록합니다.

**이전 명령어**: `record` (v0.9까지 deprecated alias, `--record` 플래그로 대체)

---

## 사용법

```bash
# 해결책 검색
/weave-troubleshoot "Cannot find module 'xyz'"

# 새 해결책 기록
/weave-troubleshoot --record error="..." solution="..."
```

---

## 입력

```yaml
error: "..."        # (검색 시 필수) 검색할 에러 메시지
record: true        # (선택) 기록 모드 활성화
solution: "..."     # (record 시 필수) 기록할 해결책
context: "..."      # (선택) 추가 맥락
```

---

## 출력 예시

### 검색

```markdown
## 💡 유사한 해결책 발견

### 1. (exact, 점수: 95%)
**상황**: Cannot find module 'react'
**해결책**: npm install react react-dom
**효과성**: ⭐⭐⭐⭐⭐
```

### 기록

```markdown
✅ 트러블슈팅 솔루션이 기록되었습니다 (ID: 42)

다음에 비슷한 에러가 발생하면 자동으로 이 해결책을 제안합니다.
```
