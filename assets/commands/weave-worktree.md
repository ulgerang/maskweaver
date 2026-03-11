---
description: git worktree 기반 병렬 작업(기능/Phase) 관리
---

# /weave-worktree - 병렬 작업용 worktree

## 개요

`git worktree`를 이용해 **작업 디렉토리를 분리**하고, 여러 기능/Phase를 병렬로 진행할 수 있게 합니다.

- 각 worktree는 서로 다른 브랜치 + 파일 시스템 분리
- 충돌/오염을 줄이고, 동시에 여러 기능을 안전하게 개발할 수 있습니다

Weave는 worktree 생성 시 `.opencode/weave` 아티팩트를 자동 bootstrap(복사/생성)하여,
"weave init은 프로젝트당 1회" 원칙을 유지합니다.

---

## 사용법

### 1) worktree 생성

```txt
weave command=worktree worktreeAction=create name="feature-login"
```

### 2) 목록 보기

```txt
weave command=worktree worktreeAction=list
```

### 3) 경로 확인(열기)

```txt
weave command=worktree worktreeAction=open name="feature-login"
```

해당 폴더로 이동한 뒤, 평소처럼 진행하면 됩니다:

```txt
/weave-prepare docs/
weave craft P1
```

### 4) 병합 가이드

```txt
weave command=worktree worktreeAction=merge name="feature-login"
```

### 5) worktree 제거

```txt
weave command=worktree worktreeAction=remove name="feature-login"
```

브랜치까지 삭제하려면:

```txt
weave command=worktree worktreeAction=remove name="feature-login" deleteBranch=true
```

---

## 주의(권장 정책)

- 같은 파일/설정(package-lock, tsconfig 등)을 동시에 바꾸는 작업은 병렬 worktree라도 merge conflict 가능성이 큽니다
- DB 마이그레이션/스키마 변경은 원칙적으로 순차 진행을 권장합니다
