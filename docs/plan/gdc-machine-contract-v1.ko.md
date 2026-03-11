---
title: GDC Machine Contract v1
status: draft
owner: gdc + maskweaver
last_updated: 2026-03-03
---

# GDC Machine Contract v1

이 문서는 Weave 연동을 위한 **선행 권장(M0)** 이행 문서다.
목표는 GDC CLI 출력의 안정적인 머신 파싱 계약을 제공하는 것이다.

## 1) 배경

현재 GDC는 사람 친화 출력 중심이며, 일부 명령만 JSON 출력을 제공한다.
Weave가 안정적으로 연동되려면 명령별 포맷 편차를 줄이고 공통 envelope를 가져야 한다.

## 2) 공통 계약

## 2.1 플래그

- `--machine`: 안정 계약 JSON 출력 모드 (신규)
- `--json`: 기존 JSON 출력 호환 모드 (유지)

권장 규칙:

- `--machine` 사용 시 stdout에는 JSON 객체 1개만 출력
- 로그/진행 텍스트는 stderr로 출력
- exit code는 오류 종류에 따라 표준화

## 2.2 공통 Envelope

```json
{
  "ok": true,
  "contractVersion": "1.0",
  "command": "check",
  "timestamp": "2026-03-03T10:30:00Z",
  "data": {},
  "warnings": [],
  "errors": [],
  "meta": {
    "durationMs": 183,
    "projectRoot": "E:/works/my-project",
    "gdcVersion": "1.0.0"
  }
}
```

### `errors[]` 규격

```json
{
  "code": "CONFIG_NOT_FOUND",
  "message": "config file not found",
  "hint": "run gdc init first"
}
```

## 2.3 Exit Code 계약

- `0`: 성공 (검증 이슈가 있어도 명령 자체 실행은 성공)
- `2`: 검증 실패/정책 위반(예: check에서 error 존재, strict 모드)
- `3`: 사용자 입력/설정 오류
- `4`: 내부 예외/복구 불가 오류

## 3) 명령별 `data` 스키마 초안

## 3.1 `gdc version --machine`

```json
{
  "version": "1.0.0",
  "buildDate": "2026-03-03",
  "contractVersion": "1.0"
}
```

## 3.2 `gdc stats --machine`

```json
{
  "nodes": {
    "total": 41,
    "byType": {"class": 20, "interface": 12, "service": 9},
    "byStatus": {"draft": 5, "specified": 18, "implemented": 15, "tested": 3}
  },
  "edges": {
    "total": 67,
    "interface": 49,
    "class": 18
  },
  "health": {
    "orphanNodes": 2
  }
}
```

## 3.3 `gdc graph --format json --machine`

```json
{
  "nodes": [
    {"id": "PlayerController", "type": "class", "layer": "application", "status": "implemented"}
  ],
  "edges": [
    {"from": "PlayerController", "to": "IInputManager", "type": "interface", "optional": false}
  ]
}
```

## 3.4 `gdc check --machine`

```json
{
  "summary": {
    "error": 1,
    "warning": 3,
    "info": 5
  },
  "issues": [
    {
      "severity": "error",
      "category": "missing_ref",
      "sourceNode": "A",
      "targetNode": "B",
      "message": "B.yaml not found",
      "suggestion": "create node B"
    }
  ]
}
```

## 3.5 `gdc sync --machine`

```json
{
  "direction": "yaml",
  "created": 3,
  "updated": 2,
  "deleted": 0,
  "dryRun": false
}
```

## 3.6 `gdc show <node> --machine`

```json
{
  "node": {
    "id": "PlayerController",
    "type": "class",
    "layer": "application",
    "summary": "플레이어 입력 처리"
  },
  "interface": {
    "methods": ["Move(Vector2)", "Jump()"]
  },
  "dependencies": ["IInputManager", "IPhysicsEngine"],
  "references": ["GameService"]
}
```

## 3.7 `gdc trace <node> --machine`

```json
{
  "start": "PlayerController",
  "direction": "both",
  "paths": [
    ["PlayerController", "IInputManager"],
    ["GameService", "PlayerController"]
  ]
}
```

## 3.8 `gdc extract <node> --machine`

```json
{
  "node": "PlayerController",
  "template": "implement",
  "includes": {
    "impl": true,
    "tests": true,
    "callers": true
  },
  "output": {
    "path": "tasks/context/P1-T1-PlayerController.md",
    "bytes": 12452
  }
}
```

## 4) 버전 협상 정책

- Weave는 시작 시 `gdc version --machine`을 호출한다.
- `contractVersion`이 `1.x`면 연동 허용, `2.x` 이상이면 경고 후 강등 모드.
- 강등 모드에서는 `graph/check/sync`만 최소 사용하고 세부 파싱은 비활성.

## 5) 구현 우선순위

1. `version`, `check`, `sync`, `graph`, `stats`
2. `show`, `trace`
3. `extract`, `query`, `list`, `search`

## 6) 테스트 기준

- 각 명령의 `--machine` 출력이 JSON 스키마 검증을 통과한다.
- stderr 노이즈가 stdout으로 섞이지 않는다.
- 오류 케이스에서 `ok=false`, `errors[]`, exit code가 일관된다.

## 7) Weave 연동 체크리스트

- `weave init`에서 `version` 계약 확인
- `weave research`에서 `stats/graph/check` 파싱
- `weave verify`에서 `sync/check` 선행 게이트
- 계약 버전 불일치 시 graceful fallback
