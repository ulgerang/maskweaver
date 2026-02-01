# 🎭 Maskweaver: Expert Persona Framework for OpenCode

<div align="center">

<img src="docs/images/hero.png" width="800" alt="Maskweaver Hero Image">

> **The npm for AI personas** — Level up your OpenCode assistant with expert personalities

[![GitHub Release](https://img.shields.io/github/v/release/ulgerang/maskweaver?color=369eff&labelColor=black&logo=github&style=flat-square)](https://github.com/ulgerang/maskweaver/releases)
[![License](https://img.shields.io/badge/license-MIT-white?labelColor=black&style=flat-square)](LICENSE)
[![npm](https://img.shields.io/npm/v/maskweaver?color=ff6b35&labelColor=black&style=flat-square)](https://www.npmjs.com/package/maskweaver)

[English](README.md) | [한국어](README.ko.md)

</div>

---

## 🔌 OpenCode Plugin

**Maskweaver is a handy plugin for [OpenCode](https://github.com/sst/opencode).**

While it can be used as a standalone library, it works great with OpenCode to add expert personas to your coding workflow:
- **Expert Personas (Masks)**: Standardized YAML profiles for legendary developers.
- **Smart Delegation**: Multi-agent workflows optimized for OpenCode.
- **Project Memory**: Hybrid semantic search for your entire codebase.

---

## Why Maskweaver?

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

## Installation

### For Humans

Copy and paste this prompt to your LLM agent (Claude Code, AmpCode, Cursor, etc.):

```
Install and configure maskweaver by following the instructions here:
https://raw.githubusercontent.com/ulgerang/maskweaver/master/docs/installation.md
```

Or read the [Installation Guide](docs/installation.md) directly—but **we strongly recommend letting an agent handle it. Humans make mistakes.**

### For LLM Agents

Fetch the installation guide and follow it:

```bash
curl -s https://raw.githubusercontent.com/ulgerang/maskweaver/master/docs/installation.md
```

### Quick Install

```bash
# npm
npm install maskweaver

# bun
bun add maskweaver
```

### OpenCode Plugin Setup

Add to your OpenCode config - that's it!

**Global** (`~/.config/opencode/opencode.json`):
```json
{
  "plugin": ["maskweaver"]
}
```

**Or per-project** (`opencode.json` in project root):
```json
{
  "plugin": ["maskweaver"]
}
```

OpenCode automatically installs the plugin to `~/.cache/opencode/node_modules/` on startup.

**Windows:** `%USERPROFILE%\.config\opencode\opencode.json`

---

## Quick Start

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

## Features

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
- 🏗️ **Martin Fowler** - Architecture, refactoring, patterns
- 🧪 **Kent Beck** - TDD, XP, testing
- 🧠 **Andrew Ng** - ML/AI systems
- ⚛️ **Dan Abramov** - React, frontend architecture

### 🤖 Dummy-Human System

Smart subagents for cost-efficient multi-agent workflows:

| Agent | Model Tier | Cost | Best For |
|-------|-----------|------|----------|
| `@dummy-flash` | Fast | 💰 | File search, summaries, simple tasks |
| `@dummy-human` | Balanced | 💰💰 | Code writing, reviews, general work |
| `@dummy-premium` | Powerful | 💰💰💰 | Architecture, complex debugging |

### 🧠 Memory System

Remember past conversations, decisions, and mask effectiveness:

```typescript
import { memory } from 'maskweaver';

// Index your project knowledge
await memory.indexFile('./docs/architecture.md', embedFn);

// Semantic search with multiple providers:
const results = await memory.hybridSearch(
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

# Check status
@context status

# Mark as done
@context done
```

### 🔄 Retrospect System

Evaluate mask effectiveness after each session:

```typescript
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
  "lessons": ["Linus mask excels at concurrency reviews"]
}
```

---

## 📦 Package Structure

Maskweaver is a single npm package with modular exports:

```typescript
// Default export - OpenCode plugin
import maskweaver from 'maskweaver';

// Named exports - module namespaces
import { core, memory, context, retrospect, verify } from 'maskweaver';

// Subpath imports - direct module access
import { hybridSearch } from 'maskweaver/memory';
import { createFeature } from 'maskweaver/context';
import { MaskLoader } from 'maskweaver/core';
```

**Modules:**
- `maskweaver/core` - Mask loading, validation (YAML/JSON)
- `maskweaver/memory` - Embeddings + vector search (5 providers)
- `maskweaver/context` - Feature-based work tracking
- `maskweaver/verify` - Cross-mask code review
- `maskweaver/retrospect` - Session effectiveness analysis
- `maskweaver/plugin` - OpenCode plugin entry point

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

### Report Bugs

Open an issue with:
1. What you tried
2. What happened
3. What you expected

See [CONTRIBUTING.md](CONTRIBUTING.md) for more details.

---

## 📄 License

MIT - See [LICENSE](LICENSE)

---

<p align="center">
  <sub>Crafted with 🎭 by <a href="https://github.com/ulgerang">ULJI SOFT</a></sub>
</p>
