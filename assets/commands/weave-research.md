---
description: 문서 + 워크스페이스 맥락을 깊게 조사해 research.md 생성
---

# /weave-research - 리서치 아티팩트 생성

## 개요

`/weave-research`는 요구사항 문서와 현재 워크스페이스를 함께 조사해, 리뷰 가능한 리서치 문서를 생성합니다.

- 입력 문서를 분석해 핵심 기능/기술 신호를 추출
- 워크스페이스에서 관련 구현/중복 신호/재사용 후보를 조사
- 문제 재현 흐름(가능한 범위)과 전/후 맥락을 정리
- 열려 있는 질문과 환경 리스크를 정리
- `tasks/research.md`에 영속 아티팩트로 저장

> 구현 전에 리서치를 먼저 고정해두면, 이후 plan 품질과 수정 비용이 크게 줄어듭니다.

---

## 사용법

```txt
/weave-research $ARGUMENTS
```

`$ARGUMENTS`는 문서 경로입니다.

예시:
- `/weave-research docs/`
- `/weave-research wiki/spec.md`

---

## 내부 호출

```txt
weave command=research docsPath="$ARGUMENTS"
```

---

## 다음 단계

리서치 완료 후 권장 순서:

```txt
weave command=prepare docsPath="$ARGUMENTS"
weave command=approve-plan
weave command=craft
```
