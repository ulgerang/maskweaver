---
description: spec + plan을 한 번에 생성 (vNext 기본 경로)
---

# /weave-prepare - spec + plan 통합

## 개요

`/weave-spec`와 `/weave-design`을 **한 번에** 이어서 수행합니다.

- 문서에서 요구사항을 추출해 **baseline spec**을 생성합니다
- 같은 입력으로 Phase 기반 **plan**을 생성합니다
- 마지막에 다음 실행 명령(`weave craft P1`)까지 안내합니다

> 목적: 작은 기능마다 spec/plan을 두 번 돌리는 마찰을 줄이고,
> "바로 craft로 갈 수 있는" 기본 경로(happy path)를 제공합니다.

---

## 사용법

**사용법**: `/weave-prepare $ARGUMENTS`
- `$ARGUMENTS` = 문서 경로 (예: `docs/`, `wiki/spec.md`)

예시:
- `/weave-prepare docs/`
- `/weave-prepare wiki/spec.md`

---

## 실행

아래 weave tool 호출을 수행합니다:

```txt
weave command=prepare docsPath="$ARGUMENTS"
```

옵션(필요 시):

```txt
weave command=prepare docsPath="$ARGUMENTS" projectName="My Project" planName="emotion-diary"
```

---

## 생성되는 산출물(기본)

- Spec: `.opencode/weave/specs/{planName}.yaml`
- Plan: `.opencode/weave/plans/{planName}.yaml` (weave-init 기반 멀티플랜 모드)

> 주의: `.opencode/`가 gitignore 대상일 수 있으므로, AI 도구가 파일을 읽을 수 있게 `/weave-init`의 `.ignore` 설정을 권장합니다.

---

## 다음 단계

준비가 끝나면:

```txt
weave craft P1
```
