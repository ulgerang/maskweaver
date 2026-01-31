# 🎭 Maskweaver (가면술사)

> Give your AI coding assistant expert personalities

**Maskweaver** is an [opencode](https://opencode.ai) plugin that applies expert personas (masks) to AI assistants. Get code reviews from Linus Torvalds, architecture advice from Martin Fowler, or TDD guidance from Kent Beck.

[English](#features) | [한국어](#한국어)

---

## 🚀 Quick Install

### For Humans (Interactive Setup)

```bash
# Clone and run setup wizard
git clone https://github.com/maskweaver/maskweaver.git
cd maskweaver
bun run setup
```

### For AI Agents (Copy & Paste)

Just paste this in your opencode chat:

```
Install Maskweaver from https://github.com/maskweaver/maskweaver - add the plugin to opencode.json and copy agents to .opencode/agents/
```

### Manual Installation

```json
// opencode.json
{
  "$schema": "https://opencode.ai/config.json",
  "plugin": ["@maskweaver/plugin"]
}
```

Then copy agents:
```bash
mkdir -p .opencode/agents
cp maskweaver/agents/*.md .opencode/agents/
```

---

## Features

- 🎭 **Expert Personas**: Transform your AI with legendary developer personalities
- 🤖 **Dummy-Humans**: Smart subagents (Flash/Human/Premium) for cost-efficient multi-agent workflows
- 📚 **Mask Library**: Pre-built masks for systems, architecture, TDD, and more
- 🔧 **Custom Masks**: Create and share your own expert personas (YAML/JSON)
- 🌍 **i18n Ready**: Infrastructure for multilingual support (EN, KO, ZH, JA)
- 🧠 **Smart Prompts**: Optimized system prompts for each persona

---

## Dummy-Human System

Maskweaver includes a tiered agent system for cost-efficient AI orchestration:

| Agent | Speed | Cost | Best For |
|-------|-------|------|----------|
| `@dummy-flash` | ⚡⚡⚡ | 💰 | File search, summaries, simple queries |
| `@dummy-human` | ⚡⚡ | 💰💰 | Code writing, reviews, general tasks |
| `@dummy-premium` | ⚡ | 💰💰💰 | Architecture, complex debugging |

### Usage

```bash
# In opencode chat:
@dummy-human Review this code with Linus Torvalds mask

@dummy-flash Find all TypeScript files with "async"

@dummy-premium Design a microservices architecture for this app
```

### Configure Models

After setup, you can customize which models each dummy-human uses:

```json
// opencode.json
{
  "agent": {
    "dummy-flash": {
      "model": "anthropic/claude-haiku-4-20250514"
    },
    "dummy-human": {
      "model": "anthropic/claude-sonnet-4-20250514"
    },
    "dummy-premium": {
      "model": "openai/gpt-5"
    }
  }
}
```

By default, all agents inherit your opencode default model.

---

## Available Masks

| Mask | Expertise | Best For |
|------|-----------|----------|
| 🐧 **Linus Torvalds** | Systems, C, Linux, Git | Code review, performance |
| 🏗️ **Martin Fowler** | Architecture, Refactoring | Design patterns, clean code |
| 🧪 **Kent Beck** | TDD, XP, Testing | Test-driven development |
| 🧠 **Andrew Ng** | ML, Deep Learning | AI/ML guidance |
| 📐 **Robert Martin** | Clean Code, SOLID | Software principles |

---

## Creating Custom Masks

Create a YAML file in `masks/` directory:

```yaml
metadata:
  id: my-expert
  version: '1.0'
  language: en

profile:
  name: My Expert
  tagline: One-line description
  expertise:
    - Area 1
    - Area 2

behavior:
  systemPrompt: |
    You are My Expert...
  communicationStyle:
    tone: friendly
    verbosity: moderate
    technicalDepth: intermediate
```

See [CONTRIBUTING.md](CONTRIBUTING.md) for the full schema.

---

## Project Structure

```
maskweaver/
├── packages/
│   ├── core/       # Core mask loading and validation
│   ├── plugin/     # opencode plugin integration
│   └── i18n/       # Internationalization (infrastructure)
├── agents/         # Dummy-human agent definitions
├── masks/          # Mask library (YAML definitions)
├── scripts/        # Setup wizard and utilities
└── docs/           # Documentation
```

---

## Contributing

We welcome contributions! See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

### Ways to contribute:
- 🎭 Add new expert masks
- 🌍 Translate masks to other languages
- 🐛 Report bugs and suggest features
- 📖 Improve documentation

---

## License

MIT License - See [LICENSE](LICENSE)

---

# 한국어

## 가면술사란?

**가면술사**는 AI 코딩 어시스턴트에 전문가 페르소나(가면)를 적용하는 opencode 플러그인입니다.

린 토발즈에게 코드 리뷰를 받고, 마틴 파울러에게 아키텍처 조언을 받으세요!

### 🚀 빠른 설치

**인간용 (대화형 설정)**
```bash
git clone https://github.com/maskweaver/maskweaver.git
cd maskweaver
bun run setup
```

**AI 에이전트용 (복사 & 붙여넣기)**

opencode 채팅창에 이것만 붙여넣으세요:
```
https://github.com/maskweaver/maskweaver 에서 Maskweaver를 설치해줘 - opencode.json에 플러그인 추가하고 agents를 .opencode/agents/에 복사해줘
```

### 더미인간 시스템

가면술사는 비용 효율적인 멀티 에이전트 시스템을 제공합니다:

| 에이전트 | 속도 | 비용 | 용도 |
|---------|------|------|------|
| `@dummy-flash` | ⚡⚡⚡ | 💰 | 파일 검색, 요약, 간단한 질의 |
| `@dummy-human` | ⚡⚡ | 💰💰 | 코드 작성, 리뷰, 일반 작업 |
| `@dummy-premium` | ⚡ | 💰💰💰 | 아키텍처, 복잡한 디버깅 |

### 사용법

```bash
# opencode 채팅창에서:
@dummy-human 린 토발즈 가면으로 이 코드 리뷰해줘

@dummy-flash TypeScript 파일 중 "async" 포함된 것 찾아줘

@dummy-premium 이 앱의 마이크로서비스 아키텍처 설계해줘
```

### 기여하기

- 🎭 새로운 전문가 가면 추가
- 🌍 가면을 한국어로 번역
- 🐛 버그 제보 및 기능 제안

---

Made with 💜 by the Maskweaver Community
