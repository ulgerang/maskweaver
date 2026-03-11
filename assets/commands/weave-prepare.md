---
description: research + spec + plan을 한 번에 생성 (vNext 기본 경로)
---

# /weave-prepare - spec + plan 통합

## 개요

`/weave-research` + `/weave-spec` + `/weave-design`을 **한 번에** 이어서 수행합니다.

- 문서를 깊게 읽어 **research.md** 아티팩트를 생성합니다
- 문서에서 요구사항을 추출해 **baseline spec**을 생성합니다
- 같은 입력으로 Phase 기반 **plan**을 생성합니다 (큰 계획은 shard plan 파일로 자동 분할)
- 마지막에 승인 단계(`weave approve-plan`)를 안내합니다

> 목적: 작은 기능마다 spec/plan을 두 번 돌리는 마찰을 줄이고,
> "리서치-계획-승인"을 빠르게 통과할 수 있는 기본 경로(happy path)를 제공합니다.

> 더 단순한 원커맨드가 필요하면 `/weave-flow [docs]`를 사용하세요
> (`prepare -> auto-approve -> craft -> verify -> finalize`를 한 번에 실행).

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

- Research: `tasks/research.md`
- Spec: `.opencode/weave/specs/{planName}.yaml`
- Plan: `.opencode/weave/plans/{planName}.yaml` 또는 `.opencode/weave/plans/{planName}-s*.yaml`

> 주의: `.opencode/`가 gitignore 대상일 수 있으므로, AI 도구가 파일을 읽을 수 있게 `/weave-init`의 `.ignore` 설정을 권장합니다.

---

## 다음 단계

준비가 끝나면:

```txt
weave command=refine-plan   # (선택) plan-notes 반영
weave command=approve-plan
weave craft P1
```
