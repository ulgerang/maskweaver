# 🎭 Maskweaver

<div align="center">

**Give your AI coding assistant expert personalities**

Transform your AI into Linus Torvalds for code review, Martin Fowler for architecture, or Kent Beck for TDD.

[Quick Start](#-quick-start) • [Features](#-features) • [Packages](#-packages) • [한국어](#한국어)

</div>

---

## 💡 Why?

You're stuck debugging a race condition. Wouldn't it be great if **Linus Torvalds** could review your code?

```typescript
// Instead of generic AI response...
"You have a potential race condition in your code."

// Get Linus-level insight:
"This is stupid. You're not even using memory barriers. Read the 
assembly - the compiler reordered your loads. Use smp_rmb() or 
better yet, redesign this without the stupid lock."
```

**Maskweaver makes this real.** It gives AI assistants expert personas (masks) with deep domain knowledge and distinct thinking styles.

---

## 🚀 Quick Start

### Installation

```bash
git clone https://github.com/maskweaver/maskweaver.git
cd maskweaver
bun install
bun run setup
```

The setup wizard will:
- ✅ Configure your preferred AI models
- ✅ Set up embedding providers (for memory)
- ✅ Copy agent files to `.opencode/agents/`
- ✅ Generate `maskweaver.config.ts`

### First Use

```bash
# In your AI assistant chat:
@maskweaver Use Linus Torvalds mask to review this C code

# Or delegate to dummy-humans:
@dummy-human Linus mask: review my multithreading code
@dummy-flash Find all files with "unsafe" in them
@dummy-premium Design microservices architecture for this monolith
```

---

## ✨ Features

### 🎭 Expert Personas (Masks)

Apply legendary developer personalities to your AI assistant:

```yaml
# masks/software-engineering/linus-torvalds.yaml
profile:
  name: Linus Torvalds
  expertise:
    - Kernel-level systems programming
    - Performance optimization
    - Memory management and concurrency
  
  thinkingStyle: |
    Bottom-up, pragmatic. Starts with code, not theory.
    Ruthlessly eliminates complexity.
```

**Current Masks:**
- 🐧 **Linus Torvalds** - Systems, C, Linux, performance
- 🏗️ **Martin Fowler** - Architecture, refactoring, patterns *(coming soon)*
- 🧪 **Kent Beck** - TDD, XP, testing *(coming soon)*
- 🧠 **Andrew Ng** - ML/AI systems *(coming soon)*
- 📐 **Robert Martin** - Clean code, SOLID *(coming soon)*

### 🤖 Dummy-Human System

Smart subagents for cost-efficient multi-agent workflows:

| Agent | Model Tier | Cost | Best For |
|-------|-----------|------|----------|
| `@dummy-flash` | Fast | 💰 | File search, summaries, simple tasks |
| `@dummy-human` | Balanced | 💰💰 | Code writing, reviews, general work |
| `@dummy-premium` | Powerful | 💰💰💰 | Architecture, complex debugging |

**Example workflow:**
```typescript
// @dummy-flash: Find files (cheap, fast)
@dummy-flash Find all TypeScript files importing React

// @dummy-human: Review code (balanced)
@dummy-human Review these components for accessibility

// @dummy-premium: Architecture design (powerful)
@dummy-premium Design a scalable state management system
```

### 🧠 Memory System

Remember past conversations, decisions, and mask effectiveness:

```typescript
// @maskweaver/memory
import { hybridSearch, indexFile } from '@maskweaver/memory';

// Index your project knowledge
await indexFile('./docs/architecture.md', embedFn);

// Semantic search with 5 providers:
const results = await hybridSearch(
  'How does authentication work?',
  embedding,
  { limit: 5, minScore: 0.7 }
);
```

**Embedding Providers:**
- 🦙 **Ollama** - Local, private (bge-m3, nomic-embed)
- 🤖 **OpenAI** - text-embedding-3-large
- 🚀 **VoyageAI** - Code-specialized embeddings!
- 🔀 **OpenRouter** - Access to multiple providers
- 📝 **Text-only** - No embeddings, pure FTS5

### 🗂️ Context System

Track long-running features with file associations:

```bash
# Start a feature
@context start name="oauth-login" goal="Implement OAuth2 flow"

# Add files to feature context
@context add file="src/auth/oauth.ts"
@context add file="src/middleware/session.ts"

# Check status
@context status

# Mark as done
@context done
```

Perfect for multi-day troubleshooting or large refactors.

### ✅ Verification System

Get code reviews from a different AI perspective:

```typescript
// @maskweaver/verify
import { verifyWithMask } from '@maskweaver/verify';

// Dummy-human writes code with Linus mask
const code = await dummyHuman.generate('Create async queue');

// Verify with different mask (e.g., Rob Pike for simplicity)
const review = await verifyWithMask(code, 'rob-pike');

// Output:
// "This is overcomplicated. Why do you need 5 classes for a queue?
//  Just use a channel and a goroutine. 12 lines, done."
```

### 🔄 Retrospect System

Evaluate mask effectiveness after each session:

```typescript
// Automatically triggered on session end
{
  "trigger": "session_end",
  "masksUsed": [
    {
      "name": "linus-torvalds",
      "task": "Review multithreading code",
      "effectiveness": 9.5
    }
  ],
  "wellDone": ["Found 3 critical race conditions"],
  "improvements": ["Took too long on minor style issues"],
  "lessons": ["Linus mask excels at concurrency reviews"]
}
```

Data feeds back into memory for smarter mask selection.

---

## 📦 Packages

Maskweaver is a modular monorepo:

```
packages/
├── @maskweaver/core        # Mask loading, validation (YAML/JSON)
├── @maskweaver/memory      # Embeddings + vector search (5 providers)
├── @maskweaver/context     # Feature-based work tracking
├── @maskweaver/verify      # Cross-mask code review
├── @maskweaver/retrospect  # Session effectiveness analysis
├── @maskweaver/plugin      # Opencode integration
├── @maskweaver/i18n        # Multilingual support
└── @maskweaver/shared      # Common types and utilities
```

Install individually:
```bash
npm install @maskweaver/memory
npm install @maskweaver/context
```

Or use the full system via the plugin.

---

## 🎭 Creating Masks

Masks are simple YAML files:

```yaml
# masks/my-expert.yaml
metadata:
  id: my-expert
  version: '1.0'
  language: en

profile:
  name: Ada Lovelace
  tagline: Pioneer of Computing - First Programmer
  
  expertise:
    - Algorithm design
    - Mathematical thinking
    - Analytical engines
  
  thinkingStyle: |
    Combines mathematical rigor with poetic imagination.
    Sees patterns others miss.

behavior:
  systemPrompt: |
    You are Ada Lovelace, the first computer programmer.
    
    You see algorithms as poetry - elegant, precise, beautiful.
    You think in terms of mathematical transformations and 
    logical flows.
    
    When reviewing code:
    - Look for algorithmic elegance
    - Question assumptions
    - Suggest mathematical optimizations
  
  communicationStyle:
    tone: thoughtful
    verbosity: moderate
    technicalDepth: expert

usage:
  suitableFor:
    - Algorithm design and optimization
    - Mathematical problem-solving
    - Pattern recognition in code
```

See [CONTRIBUTING.md](CONTRIBUTING.md) for the full schema.

---

## 🔧 Configuration

After running `bun run setup`, you'll have:

```typescript
// maskweaver.config.ts
export default {
  // Dummy-human models
  dummyHumans: {
    flash: 'anthropic/claude-haiku-4',
    human: 'anthropic/claude-sonnet-4',
    premium: 'anthropic/claude-opus-4'
  },
  
  // Memory/embedding provider
  memory: {
    provider: 'voyageai',  // Best for code!
    model: 'voyage-code-2',
    dimensions: 1536
  },
  
  // Mask directory
  maskDir: './masks',
  
  // Language preference
  language: 'en'
};
```

---

## 🌍 Multilingual

Infrastructure ready for:
- 🇺🇸 English
- 🇰🇷 Korean
- 🇨🇳 Chinese *(coming soon)*
- 🇯🇵 Japanese *(coming soon)*

Masks can have multiple language versions:
```
masks/
├── linus-torvalds.en.yaml
├── linus-torvalds.ko.yaml
└── linus-torvalds.zh.yaml
```

---

## 🤝 Contributing

We need your help!

### Add a Mask

Create a YAML file in `masks/` and submit a PR:
- ✅ Real expertise (domain knowledge)
- ✅ Distinct personality (thinking style)
- ✅ Clear use cases (when to use)
- ✅ Examples (expected behavior)

### Add a Provider

Implement the `EmbeddingProvider` interface:

```typescript
// packages/memory/src/providers/my-provider.ts
import { EmbeddingProvider } from '../types';

export class MyProvider implements EmbeddingProvider {
  async embed(texts: string[]): Promise<number[][]> {
    // Your implementation
  }
}
```

### Report Bugs

Open an issue with:
1. What you tried
2. What happened
3. What you expected

---

## 📄 License

MIT - See [LICENSE](LICENSE)

---

## 🙏 Acknowledgments

Inspired by:
- **Rob Pike** - Simplicity in design
- **TJ Holowaychuk** - Beautiful CLIs and tools
- **Sindre Sorhus** - npm ecosystem excellence

Built with 💜 by the Maskweaver Community

---

# 한국어

<div align="center">

**AI 코딩 어시스턴트에게 전문가 페르소나를 부여하세요**

린 토발즈의 코드 리뷰, 마틴 파울러의 아키텍처 조언, 켄트 벡의 TDD 가이드를 받아보세요.

</div>

---

## 💡 왜 필요한가요?

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

## 🚀 빠른 시작

### 설치

```bash
git clone https://github.com/maskweaver/maskweaver.git
cd maskweaver
bun install
bun run setup
```

설정 마법사가 다음을 처리합니다:
- ✅ 선호하는 AI 모델 설정
- ✅ 임베딩 프로바이더 설정 (메모리용)
- ✅ 에이전트 파일을 `.opencode/agents/`에 복사
- ✅ `maskweaver.config.ts` 생성

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

## ✨ 기능

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
- 🏗️ **마틴 파울러** - 아키텍처, 리팩토링 *(준비중)*
- 🧪 **켄트 벡** - TDD, XP *(준비중)*

### 🤖 더미인간 시스템

비용 효율적인 멀티 에이전트:

| 에이전트 | 모델 | 비용 | 용도 |
|---------|------|------|------|
| `@dummy-flash` | 빠름 | 💰 | 파일 검색, 요약, 간단한 작업 |
| `@dummy-human` | 균형 | 💰💰 | 코드 작성, 리뷰, 일반 작업 |
| `@dummy-premium` | 강력 | 💰💰💰 | 아키텍처, 복잡한 디버깅 |

### 🧠 메모리 시스템

과거 대화, 결정, 가면 효과를 기억:

```typescript
import { hybridSearch } from '@maskweaver/memory';

// 프로젝트 지식 인덱싱
await indexFile('./docs/architecture.md', embedFn);

// 5개 프로바이더로 의미론적 검색:
// Ollama, OpenAI, VoyageAI (코드 특화!), OpenRouter, Text-only
const results = await hybridSearch('인증 어떻게 작동?', embedding);
```

### 🗂️ 컨텍스트 시스템

장기 피처 개발 추적:

```bash
@context start name="oauth-login" goal="OAuth2 구현"
@context add file="src/auth/oauth.ts"
@context status
@context done
```

### ✅ 검증 시스템

다른 AI 관점에서 코드 리뷰:

```typescript
// dummy-human이 린 토발즈 가면으로 코드 작성
const code = await dummyHuman.generate('비동기 큐 만들기');

// 다른 가면(롭 파이크)으로 검증
const review = await verifyWithMask(code, 'rob-pike');
// "너무 복잡해. 큐에 왜 클래스가 5개야? 채널 하나면 끝."
```

### 🔄 회고 시스템

세션 종료 시 가면 효과 평가:

```json
{
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

## 📦 패키지

```
packages/
├── @maskweaver/core        # 가면 로딩, 검증
├── @maskweaver/memory      # 임베딩 + 벡터 검색 (5개 프로바이더)
├── @maskweaver/context     # 피처 기반 작업 추적
├── @maskweaver/verify      # 교차 가면 리뷰
├── @maskweaver/retrospect  # 세션 효과 분석
└── @maskweaver/plugin      # Opencode 통합
```

---

## 🎭 가면 만들기

YAML 파일로 간단히:

```yaml
metadata:
  id: ada-lovelace
  version: '1.0'

profile:
  name: Ada Lovelace
  tagline: 최초의 프로그래머
  
  expertise:
    - 알고리즘 설계
    - 수학적 사고

behavior:
  systemPrompt: |
    당신은 최초의 프로그래머 에이다 러브레이스입니다.
    알고리즘을 시처럼 우아하게 봅니다.
```

---

## 🤝 기여하기

도움이 필요합니다!

- 🎭 **새 가면 추가** - 전문가 페르소나 YAML 작성
- 🌍 **번역** - 가면을 한국어로 번역
- 🐛 **버그 리포트** - 이슈 등록
- 📦 **프로바이더 추가** - 새 임베딩 프로바이더 구현

[CONTRIBUTING.md](CONTRIBUTING.md) 참고

---

## 📄 라이선스

MIT - [LICENSE](LICENSE) 참고

---

<p align="center">
  <sub>Crafted with 🎭 by <a href="https://github.com/ulgerang">ULJI SOFT</a></sub>
</p>
