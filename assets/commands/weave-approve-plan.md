---
description: 구현 전 계획 승인 게이트 통과
---

# /weave-approve-plan - 계획 승인

## 개요

`/weave-approve-plan`은 **구현 시작 전 필수 승인 단계**입니다.

- 현재 active plan을 승인 상태로 전환
- 기본적으로 `tasks/plan-notes.md` 지시문을 먼저 자동 반영(refine) 시도
  - 변경이 반영되면 승인 단계는 일시 중단되고, 검토 후 다시 approve 실행
- 필요 시 plan 메모를 승인 코멘트로 함께 기록
- 승인 전에는 `weave craft`/`weave flow` 실행이 차단됩니다

---

## 사용법

```txt
/weave-approve-plan
```

짧은 리뷰 코멘트를 함께 남기려면:

```txt
weave command=approve-plan planReview="API signature는 변경하지 않는다"
```

자동 note 반영을 끄고 바로 승인하려면:

```txt
weave command=approve-plan applyNotes=false
```

---

## 내부 호출

```txt
weave command=approve-plan
```

---

## 다음 단계

```txt
weave command=craft
```

또는 원커맨드로 이어서 진행:

```txt
weave command=flow
```
