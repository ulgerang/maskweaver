---
description: 코드베이스 맵 결과를 바탕으로 사용자 요구사항 인터뷰 수행
---

# /weave-interview - 요구사항 인터뷰

## 개요

`/weave-map` 분석 결과를 바탕으로 **사용자와의 멀티스텝 인터뷰**를 수행합니다.  
코드베이스의 현재 상태와 구조적 변경 가능성을 파악하고, 명확해질 때까지 질문을 반복합니다.

**사용법**:
- `/weave-interview` — 기본 인터뷰 (코드베이스 맵 기반)
- `/weave-interview docs/` — 문서 경로를 함께 참조하며 인터뷰

---

## 데이터 로드 방법 (필수)

```
1. .opencode/weave/maps/map-result.yaml 로드 (map 먼저 실행되어 있어야 함)
2. map 결과가 없으면: 자동으로 기본 map 분석 수행 후 진행
3. (선택) docsPath의 문서 로드
4. 코드베이스 기술 스택 및 구조적 이슈 확인
```

---

## 입력

```yaml
docsPath: "docs/"    # (선택) 요구사항 문서 경로
```

---

## 동작 흐름

```
1. 코드베이스 맵 결과 로드 (없으면 자동 생성)
2. 구조적 변경 감지 (structural changes)
   - 현재 상태 vs 제안된 변경
   - Breaking change 여부
   - 영향받는 파일 목록
3. 사용자에게 질문 생성
   - 변경 영역에 대한 의도 확인
   - 우선순위 및 범위 조정
4. 충분한 명확성 달성 시 인터뷰 종료
   - 종료 기준: 모든 structural changes에 대해 agreed 상태
```

---

## 출력 예시

### 인터뷰 진행 중

```markdown
## 🎤 Weave Interview

**기반 맵**: `map-20250428-a1b2`
**프로젝트 타입**: TypeScript / React

### 감지된 구조적 변경

1. **Auth 모듈 분리**
   - 현재: `src/lib/auth.ts` (단일 파일)
   - 제안: `src/auth/` 디렉토리로 분리
   - 영향: 8개 파일
   - Breaking: ❌ 아니오

2. **Prisma → Drizzle 마이그레이션**
   - 현재: Prisma ORM
   - 제안: Drizzle ORM으로 전환
   - 영향: 15개 파일
   - Breaking: ⚠️ 예 (DB 스키마 변경)

---

### 질문

> **Q1**: Auth 모듈 분리는 단순 코드 구조 개선인가요, 아니면 새로운 인증 기능(예: OAuth) 추가를 위한 준비인가요?
>
> 답변 후 다음 질문으로 진행합니다.
```

### 인터뷰 완료

```markdown
## ✅ Interview Complete

**모든 구조적 변경이 명확해졌습니다.**

| 변경 영역 | 상태 | 결정 |
|-----------|------|------|
| Auth 모듈 분리 | ✅ Agreed | 디렉토리 분리 + OAuth 확장 준비 |
| Prisma → Drizzle | ⏳ Pending | Phase 2로 연기 (현재는 Prisma 유지) |

### 다음 단계
- `/weave-design` — 결정사항을 바탕으로 계획 수립
- `/weave-prepare` — research + spec + plan 한 번에 생성
```

---

## 아티팩트 저장 위치

인터뷰 결과는 `.opencode/weave/interviews/`에 저장됩니다:

```
.opencode/weave/interviews/
└── interview-{id}.yaml    # 질문-답변 기록 및 structural changes 상태
```

---

## 관련 명령어

- `/weave-map` — 코드베이스 맵 생성 (인터뷰 선행 조건)
- `/weave-design` — 인터뷰 결과를 바탕으로 계획 수립
- `/weave-prepare` — 전체 워크플로우 한 번에 실행
