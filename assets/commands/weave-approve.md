---
description: Plan 승인 게이트 통과 (구현 전 필수)
---

# /weave-approve - Plan 승인 게이트

## 개요

구현 전 **반드시 통과해야 하는 승인 게이트**입니다. Plan을 검토하고 승인하거나, 이미 craft 완료된 Phase를 최종 확정(finalize)합니다.

**이전 명령어**: `approve-plan` (v0.9까지 alias로 동작)

---

## 사용법

```bash
# Plan 승인 (가장 일반적)
/weave-approve

# Craft 완료된 Phase 최종 확정
/weave-approve P1
```

---

## 입력

```yaml
phaseId: "P1"          # (선택) 최종 확정할 Phase ID. 미지정 시 Plan 승인
planReview: "..."      # (선택) Plan 검토 요약
applyNotes: true       # (선택) plan-notes 자동 반영 여부 (기본: true)
```

---

## 동작 흐름

```
1. 활성 Plan 로드
2. phaseId 미지정 → Plan 승인
   └─ applyNotes=true → plan-notes 자동 반영 후 승인
3. phaseId 지정 → Phase 최종 확정 (finalize)
   └─ verify → 통과 시 완료 처리
```

---

## 출력 예시

### Plan 승인

```markdown
## ✅ Plan Approved

- Plan: `.opencode/weave/plans/emotion-diary.yaml`
- Approved at: 2025-04-28T10:30:00.000Z
- Review note: Approved without additional notes.

다음 단계: `weave command=craft phaseId="P1"`
```
