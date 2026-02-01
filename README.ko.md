# 🎭 Maskweaver: OpenCode를 위한 전문가 페르소나 프레임워크

<div align="center">

<img src="docs/images/hero.png" width="800" alt="Maskweaver Hero Image">

> **AI 페르소나를 위한 npm** — OpenCode 어시스턴트에게 독보적인 전문가 인격을 더하세요

[![GitHub Release](https://img.shields.io/github/v/release/ulgerang/maskweaver?color=369eff&labelColor=black&logo=github&style=flat-square)](https://github.com/ulgerang/maskweaver/releases)
[![License](https://img.shields.io/badge/license-MIT-white?labelColor=black&style=flat-square)](LICENSE)
[![npm](https://img.shields.io/npm/v/maskweaver?color=ff6b35&labelColor=black&style=flat-square)](https://www.npmjs.com/package/maskweaver)

[English](README.md) | [한국어](README.ko.md)

</div>

---

## 🔌 OpenCode 통합

**Maskweaver는 [OpenCode](https://github.com/sst/opencode) 생태계의 핵심 구성 요소입니다.**

본 프로젝트는 독립적인 라이브러리로도 사용 가능하지만, 기본적으로 OpenCode 에이전트들이 특정 분야의 전문 지식을 갖출 수 있도록 설계되었습니다:
- **전문가 페르소나 (Masks)**: 전설적인 개발자들의 철학을 담은 표준 YAML 프로필.
- **스마트 위임**: OpenCode에 최적화된 멀티 에이전트 워크플로우.
- **프로젝트 메모리**: 코드베이스 전체에 대한 하이브리드 의미론적 검색.

---

## 왜 Maskweaver인가요?

레이스 컨디션 버그로 고생 중이라면, **린 토발즈**가 코드를 봐준다면 얼마나 좋을까요?

```typescript
// 일반 AI 답변 대신...
"코드에 잠재적 레이스 컨디션이 있습니다."

// 린 토발즈 수준의 인사이트:
"이건 멍청한 코드야. 메모리 배리어도 안 썼잖아. 어셈블리 봐봐 - 
컴파일러가 로드 순서 바꿨어. smp_rmb() 쓰든지, 아예 이 멍청한 
락 없이 다시 설계해."
```

**Maskweaver가 이걸 가능하게 합니다.** AI 어시스턴트에 전문가 페르소나(가면)를 씌워 깊은 도메인 지식과 독특한 사고방식을 부여합니다.

---

## 설치

### 빠른 설치

```bash
# npm
npm install maskweaver

# bun
bun add maskweaver
```

### OpenCode 플러그인 설정

OpenCode 설정에 추가하면 끝!

**전역** (`~/.config/opencode/opencode.json`):
```json
{
  "plugin": ["maskweaver"]
}
```

**또는 프로젝트별** (프로젝트 루트의 `opencode.json`):
```json
{
  "plugin": ["maskweaver"]
}
```

OpenCode가 시작 시 자동으로 `~/.cache/opencode/node_modules/`에 플러그인을 설치합니다.

**Windows:** `%USERPROFILE%\.config\opencode\opencode.json`

---

## 빠른 시작

### 첫 사용

```bash
# AI 어시스턴트 채팅에서:
@maskweaver 린 토발즈 가면으로 이 C 코드 리뷰해줘

# 또는 더미인간에게 위임:
@dummy-human 린 토발즈 가면으로 멀티스레딩 코드 리뷰
@dummy-flash "unsafe" 들어간 파일 전부 찾아줘
@dummy-premium 이 모놀리스를 마이크로서비스로 설계해줘
```

---

## 기능

### 🎭 전문가 페르소나 (가면)

전설적인 개발자의 인격을 AI에 적용:

```yaml
# masks/software-engineering/linus-torvalds.yaml
profile:
  name: Linus Torvalds
  expertise:
    - 커널 수준 시스템 프로그래밍
    - 성능 최적화
    - 메모리 관리 및 동시성
  
  thinkingStyle: |
    상향식, 실용적 접근. 이론이 아닌 코드부터.
    복잡함을 무자비하게 제거.
```

**현재 가면:**
- 🐧 **린 토발즈** - 시스템, C, 리눅스, 성능
- 🏗️ **마틴 파울러** - 아키텍처, 리팩토링, 패턴
- 🧪 **켄트 벡** - TDD, XP, 테스팅
- 🧠 **앤드류 응** - ML/AI 시스템
- ⚛️ **댄 아브라모프** - React, 프론트엔드 아키텍처

### 🤖 더미인간 시스템

비용 효율적인 멀티 에이전트 워크플로우를 위한 스마트 서브에이전트:

| 에이전트 | 모델 등급 | 비용 | 최적 용도 |
|---------|----------|------|-----------| 
| `@dummy-flash` | 빠름 | 💰 | 파일 검색, 요약, 간단한 작업 |
| `@dummy-human` | 균형 | 💰💰 | 코드 작성, 리뷰, 일반 작업 |
| `@dummy-premium` | 강력 | 💰💰💰 | 아키텍처, 복잡한 디버깅 |

### 🧠 메모리 시스템

과거 대화, 결정, 가면 효과를 기억:

```typescript
import { memory } from 'maskweaver';

// 프로젝트 지식 인덱싱
await memory.indexFile('./docs/architecture.md', embedFn);

// 여러 프로바이더로 의미론적 검색:
const results = await memory.hybridSearch(
  '인증은 어떻게 작동하나요?',
  embedding,
  { limit: 5, minScore: 0.7 }
);
```

**임베딩 프로바이더:**
- 🦙 **Ollama** - 로컬, 프라이빗 (bge-m3, nomic-embed)
- 🤖 **OpenAI** - text-embedding-3-large
- 🚀 **VoyageAI** - 코드 특화 임베딩!
- 🔀 **OpenRouter** - 여러 프로바이더 접근
- 📝 **Text-only** - 임베딩 없음, 순수 FTS5

### 🗂️ 컨텍스트 시스템

파일 연결로 장기 실행 기능 추적:

```bash
# 기능 시작
@context start name="oauth-login" goal="OAuth2 플로우 구현"

# 기능 컨텍스트에 파일 추가
@context add file="src/auth/oauth.ts"

# 상태 확인
@context status

# 완료 표시
@context done
```

### 🔄 회고 시스템

각 세션 후 가면 효과 평가:

```typescript
{
  "trigger": "session_end",
  "masksUsed": [
    {
      "name": "linus-torvalds",
      "task": "멀티스레딩 코드 리뷰",
      "effectiveness": 9.5
    }
  ],
  "wellDone": ["치명적 레이스 컨디션 3개 발견"],
  "lessons": ["린 토발즈 가면은 동시성 리뷰에 탁월"]
}
```

---

## 📦 패키지 구조

Maskweaver는 모듈식 exports를 가진 단일 npm 패키지입니다:

```typescript
// 기본 export - OpenCode 플러그인
import maskweaver from 'maskweaver';

// Named exports - 모듈 네임스페이스
import { core, memory, context, retrospect, verify } from 'maskweaver';

// 서브경로 imports - 직접 모듈 접근
import { hybridSearch } from 'maskweaver/memory';
import { createFeature } from 'maskweaver/context';
import { MaskLoader } from 'maskweaver/core';
```

**모듈:**
- `maskweaver/core` - 가면 로딩, 검증 (YAML/JSON)
- `maskweaver/memory` - 임베딩 + 벡터 검색 (5개 프로바이더)
- `maskweaver/context` - 기능 기반 작업 추적
- `maskweaver/verify` - 교차 가면 코드 리뷰
- `maskweaver/retrospect` - 세션 효과 분석
- `maskweaver/plugin` - OpenCode 플러그인 엔트리 포인트

---

## 🎭 가면 만들기

가면은 간단한 YAML 파일입니다:

```yaml
# masks/my-expert.yaml
metadata:
  id: my-expert
  version: '1.0'
  language: ko

profile:
  name: 에이다 러브레이스
  tagline: 컴퓨팅의 선구자 - 최초의 프로그래머
  
  expertise:
    - 알고리즘 설계
    - 수학적 사고
    - 해석 기관
  
  thinkingStyle: |
    수학적 엄밀함과 시적 상상력을 결합합니다.
    다른 사람들이 놓치는 패턴을 봅니다.

behavior:
  systemPrompt: |
    당신은 최초의 컴퓨터 프로그래머 에이다 러브레이스입니다.
    
    알고리즘을 시로 봅니다 - 우아하고, 정확하고, 아름답게.
    수학적 변환과 논리적 흐름의 관점에서 생각합니다.
  
  communicationStyle:
    tone: 사려깊은
    verbosity: 적당한
    technicalDepth: 전문가

usage:
  suitableFor:
    - 알고리즘 설계 및 최적화
    - 수학적 문제 해결
    - 코드의 패턴 인식
```

---

## 🌍 다국어

지원 준비 완료:
- 🇺🇸 영어
- 🇰🇷 한국어
- 🇨🇳 중국어 *(준비중)*
- 🇯🇵 일본어 *(준비중)*

가면은 여러 언어 버전을 가질 수 있습니다:
```
masks/
├── linus-torvalds.en.yaml
├── linus-torvalds.ko.yaml
└── linus-torvalds.zh.yaml
```

---

## 🤝 기여하기

도움이 필요합니다!

### 가면 추가

`masks/`에 YAML 파일을 만들고 PR을 제출하세요:
- ✅ 실제 전문성 (도메인 지식)
- ✅ 독특한 인격 (사고 방식)
- ✅ 명확한 사용 사례 (언제 사용할지)
- ✅ 예시 (예상 동작)

### 버그 리포트

다음 내용으로 이슈를 열어주세요:
1. 무엇을 시도했는지
2. 무슨 일이 일어났는지
3. 무엇을 예상했는지

자세한 내용은 [CONTRIBUTING.md](CONTRIBUTING.md)를 참조하세요.

---

## 📄 라이선스

MIT - [LICENSE](LICENSE) 참조

---

<p align="center">
  <sub>🎭와 함께 제작 by <a href="https://github.com/ulgerang">ULJI SOFT</a></sub>
</p>
