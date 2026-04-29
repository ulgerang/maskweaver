# Weave 명령어 통합 정리 계획 — 피드백

> **작성일**: 2026-04-29  
> **대상 문서**: `docs/plan/weave-command-unification-plan.ko.md` v1.0

---

## 1. 총평

문제 진단이 명확하고, 실행 계획이 Phase로 잘 구조화되어 있습니다. 명령어 과잉 문제를 실질적으로 해결할 수 있는 방향이며, Single Source of Truth 접근은 유지보수 비용 절감에 큰 도움이 될 것입니다. 아래는 보완했을 때 더 탄탄한 계획이 될 부분입니다.

---

## 2. 칭찬할 점

- **2.1 문제 진단이 데이터 기반**: 기능 중복을 표로 정리하고, 4중 문서 중복의 구체적인 파일/라인을 지목한 점이 좋습니다.
- **2.2 `build` 통합 설계가 실용적**: 12개의 명령어를 하나로 합치면서도 기존 handler를 재사용하는 전략은 리스크가 낮습니다.
- **2.3 마이그레이션 가이드**: 기존 사용자에게 변경사항을 표로 제공하는 부분이 친절합니다.
- **2.4 Phase 분할**: 독립 커밋/롤백이 가능하도록 Phase를 나눈 점이 운영적으로 안전합니다.

---

## 3. 우려사항 및 보완 제안

### 3.1 `prepare` 과도한 통합 위험

`research` + `spec` + `design` + `prepare`를 단일 `prepare`로 통합하면, **"부분적인 재실행"** 이 어려워집니다. 예를 들어 `research`만 다시 돌리고 싶은 사용자는 불편할 수 있습니다.

**제안**: `prepare` 내부에 `--only-research`, `--only-spec`, `--only-design` 플래그를 추가하거나, `prepare`가 각 단계의 캐시를 개별적으로 인식하여 변경된 부분만 재실행하는 incremental 모드를 고려하세요.

### 3.2 `flow` 제거에 대한 사용자 영향

`flow`는 `prepare → approve → craft`를 한 번에 실행하는 원커맨드입니다. 초보 사용자나 빠른 PoC에 유용한데, 제거 시 UX가 저하될 수 있습니다.

**제안**: `prepare --auto-approve` 또는 `prepare --flow` 플래그를 추가하여 `flow`의 원커맨드 경험을 보존하는 것을 고려하세요. 1~2버전 동안 `flow`를 `prepare --flow`로 변환하는 alias로 유지하는 것도 방법입니다.

### 3.3 `--` 옵션과 slash command의 괴리

`build --status`, `build --sync` 등의 `--` 옵션 방식이 slash command 환경(`/weave build --status`)과 툴 명령어 환경(`weave command=build action=status`)에서 일관되게 동작할지 설계가 명확하지 않습니다.

**제안**: `commands.json`에 `args` 스키마를 정의하고, slash command와 tool command가 동일한 인자 명세를 공유하도록 `meta/commands.json`의 설계를 먼저 확정하는 것이 좋습니다. Phase 1에서 `commands.json` 예시를 포함시키는 것이 바람직합니다.

### 3.4 하위 호환성 구체화 부족

마이그레이션 가이드에서는 "명확한 에러 메시지로 안내"라고만 되어 있고, 8장 위험도에서는 "1~2버전 alias 임시 지원"이 모순됩니다.

**제안**: 하위 호환성 정책을 단일화하세요. 추천 방안:
- **v0.9**: 기존 명령어는 alias로 유지, deprecated 경고 출력
- **v0.10**: alias 제거, 친절한 에러 메시지로 안내
- `commands.json`에 `deprecated`, `removedIn`, `migration` 필드를 추가해 자동화

### 3.5 `loop-*` 통합 시 `loop.ts` 영향 분석 누락

Phase 2에서 `loop.ts`는 "참조만, 변경 없음"이라고 되어 있지만, `loop-*` handler가 `weave.ts`에서만 호출되는지, 아니면 다른 곳에서 직접 import/호출되는지 확인이 필요합니다.

**제안**: Phase 2 시작 전에 `loop.ts`의 export 함수들이 어디서 참조되고 있는지 grep/import 분석을 추가하세요.

### 3.6 동적 `.md` 로딩의 엣지 케이스

- **파일 I/O 실패 시**: 파일시스템 오류, 권한 문제, 패키징 후 경로 변경 등으로 `.md` 파일을 읽지 못하면 전체 명령어가 등록되지 않을 수 있습니다.
- **핫 리로드**: OpenCode 플러그인은 서버 재시작 없이 리로드될 수 있는데, 이때 파일 시스템 변경이 즉시 반영되지 않을 수 있습니다.

**제안**:
- `commands.json`을 fail-safe default로 내장(`__DEFAULT_COMMANDS__`)하고, 파일 I/O 실패 시 fallback
- `meta/commands.json`에 리비전 해시를 포함하여 변경 감지 및 캐시 무효화
- slash command 등록 로직에 file watch 추가 검토

### 3.7 테스트 전략 불충분

Phase 4 체크리스트에 "기존 테스트 통과"만 있고, 통합된 명령어들이 올바르게 동작하는지 검증할 테스트가 언급되지 않았습니다.

**제안**:
- `build` 통합 시: `--status`, `--stop`, `--list`, `--resume`, `--sync` 각각에 대한 단위 테스트 추가
- `prepare` 통합 시: 기존 `research`, `spec`, `design`의 개별 출력이 `prepare` 내에서도 생성되는지 테스트
- 동적 로딩: `commands.json` 파싱, `.md` 파일 조합 로직 단위 테스트
- E2E: `/weave build --list`와 같은 slash command가 실제로 등록되어 실행되는지 검증

### 3.8 `meta/commands.json` 스키마 누락

Phase 1의 핵심 산출물인 `commands.json`의 스키마 예시가 전혀 없습니다. 이 파일이 전체 동적 로딩의 기반이므로 먼저 확정되어야 합니다.

**제안**: 다음과 같은 스키마 예시를 계획 단계에서 확정하세요:

```json
{
  "$schema": "./commands.schema.json",
  "schemaVersion": "1.0",
  "commands": [
    {
      "name": "build",
      "aliases": ["loop-run", "loop-start"],
      "deprecatedAliases": ["build-resume"],
      "description": "자율 빌드 루프 실행",
      "category": "execution",
      "args": [
        { "name": "action", "type": "enum", "values": ["run", "status", "stop", "list", "resume", "sync"], "default": "run" },
        { "name": "buildId", "type": "string", "required": false }
      ],
      "mdFile": "weave-build.md",
      "handler": "handleBuild"
    }
  ]
}
```

### 3.9 `approve` → `approve-plan` 변경과 하위 호환

Phase 2에서 `approve-plan` → `approve`로 줄이는 것 자체는 좋습니다. 하지만 `approve`라는 단어가 너무 일반적이어서 다른 컨텍스트(PR approve 등)와 혼동될 가능성이 있습니다.

**제안**: `weave approve`를 컨텍스트 내에서는 명확하지만, 글로벌 명령어 목록에서 `approve`만 보면 의미를 알기 어려울 수 있습니다. `help.md`에 설명을 충분히 기재하세요.

---

## 4. 추가 제안

### 4.1 명령어 발견성 (Discoverability)

통합 후에도 사용자가 어떤 명령어가 있는지 쉽게 파악할 수 있어야 합니다. `weave-help.md`를 단순한 목록이 아니라 **워크플로우 다이어그램(텍스트 ASCII)** 으로 표현하면 좋겠습니다.

```
분석 → 요구 → 계획 → 승인 → 실행/자율 → 검증 → 아카이브
map  interview prepare approve craft/build verify archive
```

### 4.2 `config` 명령어의 책임 범위

`config --sync`(에이전트 싱크)가 `config`라는 이름에 적절한지 의문이 듭니다. `config`는 일반적으로 정적 설정을 의미하고, 에이전트 싱크는 동적 리소스 동기화에 가깝습니다.

**제안**: `sync-agents`를 독립된 명령어(`sync`)로 남기거나, `config`의 설명을 "설정 및 환경 동기화"로 명확히 하세요.

### 4.3 도움말 생성 자동화

`weave-help.md`를 수동 관리하는 대신, `commands.json` + 각 명령어의 `.md` 파일 첫 번째 heading을 읽어 자동 생성하는 스크립트를 Phase 1에 포함시키면 유지보수가 더 쉬워집니다.

---

## 5. 우선순위 요약

| 우선순위 | 항목 | 근거 |
|----------|------|------|
| 🔴 상 | `commands.json` 스키마 확정 | 전체 아키텍처의 기반 |
| 🔴 상 | `loop.ts` 참조 분석 | Phase 2 정확성에 영향 |
| 🔴 상 | 동적 로딩 fail-safe | 플러그인 동작 불능 방지 |
| 🟡 중 | `prepare` partial 재실행 | 사용자 유연성 |
| 🟡 중 | `flow` 대체 방안 | 기존 사용자 마이그레이션 |
| 🟡 중 | 하위 호환성 정책 단일화 | 혼선 방지 |
| 🟢 하 | `config` 범위 검토 | 명명 일관성 |
| 🟢 하 | help.md 자동 생성 | 유지보수 효율 |

---

## 6. 결론

이 계획은 방향이 옳고 실행 가능성이 높습니다. 위 피드백은 계획의 완성도를 높이기 위한 보완 제안이며, 특히 **`commands.json` 스키마 확정**, **동적 로딩 fail-safe**, **하위 호환성 정책 명확화** 세 가지는 Phase 1 시작 전에 확정되면 좋겠습니다.

전반적으로 **승인(Approved with Suggestions)** 입니다.
