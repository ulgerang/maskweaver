---
description: 프로젝트 유형 자동 감지 기반 검증 실행 (build/test)
---

# /weave-verify - 검증 실행

## 개요

현재 worktree(프로젝트 루트)에서 **빌드/테스트 검증**을 실행합니다.

Weave는 특정 생태계(npm)만 가정하지 않고, 프로젝트 루트의 증거를 기반으로 검증 커맨드를 추천/실행합니다.

- Node: `package.json scripts` 기반(`npm|pnpm|yarn|bun` 자동 감지)
- Go: `go build ./...`, `go test ./...`
- Rust: `cargo check`, `cargo test`
- Python: `pytest` 또는 `python -m unittest` (+ optional ruff/mypy)
- .NET: `dotnet build`, `dotnet test`

---

## 실행

```txt
weave command=verify
```

프로젝트 타입 힌트를 주고 싶으면:

```txt
weave command=verify projectType="go"
```

빠르게(typecheck+tests만) 돌리려면:

```txt
weave command=verify verifyMode="quick"
```

---

## 결과

- PASS면 `✅ Verification passed.`
- FAIL이면 실패한 레이어와 로그(tail)를 출력합니다
