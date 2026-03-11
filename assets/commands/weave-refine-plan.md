---
description: plan-notes 지시문을 active plan에 자동 반영
---

# /weave-refine-plan - 계획 정제(Annotation Cycle)

## 개요

`/weave-refine-plan`은 `tasks/plan-notes.md`의 지시문을 읽어서 active plan YAML에 자동 반영합니다.

- 구현 전에 계획을 여러 번 정제하는 annotation cycle용
- 반영이 일어나면 plan 승인 상태를 자동으로 해제
- 반영 후에는 `weave approve-plan`을 다시 실행해야 구현 가능

---

## 기본 사용법

```txt
/weave-refine-plan
```

내부 호출:

```txt
weave command=refine-plan
```

노트 파일 경로를 바꾸려면:

```txt
weave command=refine-plan notesPath="tasks/my-plan-notes.md"
```

---

## 노트 문법 (예시)

`tasks/plan-notes.md`에 아래처럼 작성:

```txt
@plan vision: 로그인 이후 대시보드 흐름을 단순화한다
@arch frontend: React + Vite + TanStack Query

@phase P1 done_when: 유저가 이메일/비밀번호로 로그인할 수 있다
@phase P1 add_checklist: 로그인 실패 메시지가 명확히 보인다

@phase add P4: 운영 모니터링 | done=로그/메트릭 대시보드가 동작한다 | hours=3
@phase remove P7
```

---

## 다음 단계

```txt
weave command=approve-plan
weave command=craft
```
