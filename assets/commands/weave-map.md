---
description: 코드베이스 구조를 분석하고 지식 그래프(knowledge graph) 생성
---

# /weave-map - 코드베이스 맵 분석

## 개요

현재 프로젝트의 코드베이스 구조를 분석하여 **기술 스택 자동 감지**, **디렉토리 구조 분석**, **GDC 그래프 연동** 결과를 생성합니다.  
`deep` 옵션 사용 시 `graphify-windows` 스킬을 활용한 딥 그래프 분석도 수행합니다.

**사용법**:
- `/weave-map` — 기본 코드베이스 분석
- `/weave-map --deep` — 심층 그래프 분석 (graphify-windows)

---

## 데이터 로드 방법 (필수)

```
1. 프로젝트 루트의 package.json, tsconfig.json, Cargo.toml, go.mod 등 탐지
2. GDC 설정 확인 (.gdc/config.yaml 또는 .opencode/gdc/)
3. GDC 활성화 시: gdc graph + gdc stats 명령 실행
4. deep 옵션 시: graphify-windows 스킬 실행
```

---

## 입력

```yaml
deep: false      # (선택) true 시 graphify-windows 딥 분석 실행
```

---

## 출력 예시

### 기본 분석

```markdown
## 🗺️ Codebase Map

**프로젝트 타입**: TypeScript / Node.js
**기술 스택**: React, Next.js, Prisma, Tailwind

### 디렉토리 구조
```
src/
├── app/           # Next.js App Router
├── components/    # React 컴포넌트
├── lib/           # 유틸리티
└── db/            # Prisma 스키마
```

### GDC 그래프
- **노드**: 42개
- **엣지**: 78개
- **커버리지**: 85% 구현, 60% 테스트

### 주요 의존성
- next: ^14.0
- react: ^18.2
- @prisma/client: ^5.0
```

### 심층 분석 (deep)

```markdown
## 🗺️ Codebase Map (Deep)

**그래프 분석 완료**

### 커뮤니티 클러스터
| 클러스터 | 파일 수 | 핵심 엔티티 |
|----------|--------|------------|
| C1 | 12 | User, Auth, Session |
| C2 | 8 | Post, Comment, Feed |
| C3 | 6 | Payment, Subscription |

### 구조적 이슈
- ⚠️ 순환 의존성: `src/lib/api.ts` ↔ `src/lib/auth.ts`
- ⚠️ 고립 노드: `src/utils/legacy-helpers.ts` (참조 없음)

### 추천 리팩토링
1. `api.ts`와 `auth.ts` 순환 의존성 해소
2. `legacy-helpers.ts` 제거 또는 통합
```

---

## 아티팩트 저장 위치

분석 결과는 `.opencode/weave/maps/`에 저장됩니다:

```
.opencode/weave/maps/
├── map-report.yaml          # 구조 분석 요약
├── map-result.yaml          # GDC 연동 결과
└── graphify-report.html     # deep 분석 시 생성
```

---

## 관련 명령어

- `/weave-interview` — 맵 결과를 바탕으로 사용자 인터뷰
- `/weave-design` — 분석 결과를 바탕으로 계획 수립
- `/weave-init` — weave 워크스페이스 초기화
