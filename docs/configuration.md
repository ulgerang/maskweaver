# Configuration Guide

Complete guide to configuring Maskweaver for your needs.

---

## Configuration Files

Maskweaver supports two configuration locations:

1. **Project-specific:** `.opencode/maskweaver.config.ts` or `maskweaver.config.ts`
2. **User-wide:** `~/.config/opencode/maskweaver.config.ts`

Project configuration takes precedence over user configuration.

---

## Basic Configuration

### Minimal Configuration

```json
// maskweaver.config.json
{
  "dummyHumans": {
    "pool": [
      { "id": "flash", "model": "google/gemini-2.0-flash", "tier": "flash", "maxConcurrent": 5, "capabilities": ["search", "simple-coding"], "costTier": "low" },
      { "id": "opus",  "model": "anthropic/claude-opus-4", "tier": "premium", "maxConcurrent": 1, "capabilities": ["reasoning", "complex-coding"], "costTier": "high" }
    ]
  },
  "memory": {
    "provider": "ollama",
    "model": "bge-m3",
    "dimensions": 1024
  }
}
```

### Full Configuration Example

```json
// maskweaver.config.json
{
  // Model pool - each entry becomes a dummy-{id} agent
  "dummyHumans": {
    "pool": [
      { "id": "gemini-flash", "model": "google/gemini-2.0-flash", "tier": "flash", "maxConcurrent": 5, "capabilities": ["search", "formatting", "simple-coding", "file-ops"], "costTier": "low", "description": "Fast, simple tasks" },
      { "id": "claude-sonnet", "model": "anthropic/claude-sonnet-4", "tier": "human", "maxConcurrent": 3, "capabilities": ["coding", "testing", "refactoring"], "costTier": "medium", "description": "Balanced coding" },
      { "id": "claude-opus", "model": "anthropic/claude-opus-4", "tier": "premium", "maxConcurrent": 1, "capabilities": ["architecture", "debugging", "reasoning", "complex-coding"], "costTier": "high", "description": "Complex reasoning" }
    ]
  },

  // Memory and embedding configuration
  "memory": {
    "provider": "voyageai",
    "model": "voyage-code-2",
    "dimensions": 1536
  },

  // Language preference
  "language": "en",

  // Verification configuration
  "verify": {
    "defaultMask": "linus-torvalds",
    "autoVerify": false
  }
}
```

---

## Model Pool (Dummy-Human Agents)

Maskweaver creates AI agents from configured models. Each model becomes a `dummy-{id}` agent that the Mask Weaver can delegate tasks to via the Task tool.

### Pool Configuration (Recommended)

In `maskweaver.config.json`:

```json
{
  "dummyHumans": {
    "pool": [
      {
        "id": "gemini-flash",
        "model": "google/gemini-2.0-flash",
        "tier": "flash",
        "maxConcurrent": 5,
        "capabilities": ["search", "formatting", "simple-coding", "file-ops"],
        "costTier": "low",
        "description": "Fast and cheap. Simple tasks, file ops, search."
      },
      {
        "id": "claude-sonnet",
        "model": "anthropic/claude-sonnet-4",
        "tier": "human",
        "maxConcurrent": 3,
        "capabilities": ["coding", "testing", "refactoring"],
        "costTier": "medium",
        "description": "Balanced. General coding, tests, reviews."
      },
      {
        "id": "claude-opus",
        "model": "anthropic/claude-opus-4",
        "tier": "premium",
        "maxConcurrent": 1,
        "capabilities": ["architecture", "debugging", "reasoning", "complex-coding"],
        "costTier": "high",
        "description": "Most powerful. Architecture, complex debugging."
      }
    ]
  }
}
```

This generates the following agents at startup:

| Agent Name | Model | Tier |
|------------|-------|------|
| `dummy-gemini-flash` | google/gemini-2.0-flash | flash |
| `dummy-claude-sonnet` | anthropic/claude-sonnet-4 | human |
| `dummy-claude-opus` | anthropic/claude-opus-4 | premium |
| `dummy-flash` | (alias for first flash entry) | flash |
| `dummy-human` | (updated with first human entry) | human |
| `dummy-premium` | (alias for first premium entry) | premium |

### Pool Entry Fields

| Field | Required | Description |
|-------|----------|-------------|
| `id` | Yes | Unique name. Becomes the agent name: `dummy-{id}` |
| `model` | Yes | Full model identifier (e.g., `google/gemini-2.0-flash`) |
| `tier` | Yes | `flash`, `human`, or `premium` |
| `maxConcurrent` | Yes | Max parallel uses (API/subscription limit) |
| `capabilities` | Yes | Task tags this model excels at |
| `costTier` | Yes | `low`, `medium`, or `high` |
| `description` | No | Human-readable summary |

### Adding Multiple Models per Tier

You can add as many models as you want. Each gets its own agent:

```json
{
  "dummyHumans": {
    "pool": [
      { "id": "gemini-flash",  "model": "google/gemini-2.0-flash",    "tier": "flash",   "maxConcurrent": 5, "capabilities": ["search", "formatting"], "costTier": "low" },
      { "id": "gemini-pro",    "model": "google/gemini-2.5-pro",      "tier": "flash",   "maxConcurrent": 3, "capabilities": ["coding", "search"],    "costTier": "low" },
      { "id": "claude-sonnet", "model": "anthropic/claude-sonnet-4",  "tier": "human",   "maxConcurrent": 3, "capabilities": ["coding", "testing"],    "costTier": "medium" },
      { "id": "gpt-4o",        "model": "openai/gpt-4o",             "tier": "human",   "maxConcurrent": 3, "capabilities": ["coding", "frontend"],   "costTier": "medium" },
      { "id": "claude-opus",   "model": "anthropic/claude-opus-4",   "tier": "premium", "maxConcurrent": 1, "capabilities": ["architecture", "reasoning"], "costTier": "high" },
      { "id": "o3",            "model": "openai/o3",                 "tier": "premium", "maxConcurrent": 1, "capabilities": ["reasoning", "debugging"],    "costTier": "high" }
    ]
  }
}
```

Generated agents: `dummy-gemini-flash`, `dummy-gemini-pro`, `dummy-claude-sonnet`, `dummy-gpt-4o`, `dummy-claude-opus`, `dummy-o3`

All callable via `Task(dummy-gemini-pro)`, `Task(dummy-o3)`, etc.

### Tier and Weave Integration

When `weave craft` runs, tasks are automatically assigned an agent tier based on complexity:

| Complexity | Agent Tier | Example Tasks |
|-----------|------------|---------------|
| simple | `dummy-flash` | File renames, import fixes, config changes |
| standard | `dummy-human` | Component implementation, API endpoints, tests |
| complex | `dummy-premium` | Architecture refactoring, auth, state management |

The legacy aliases (`dummy-flash`, `dummy-human`, `dummy-premium`) always point to the first pool entry of each tier.

### Capabilities

Capabilities are tags used for smart model selection. Built-in tags:

| Category | Tags |
|----------|------|
| Simple | `search`, `formatting`, `simple-coding`, `file-ops` |
| Standard | `coding`, `testing`, `refactoring` |
| Complex | `architecture`, `debugging`, `reasoning`, `complex-coding` |
| Domain | `frontend`, `backend`, `database`, `devops`, `ml` |

You can also use custom tags (any string).

### Legacy Format (Backward Compatible)

The simple 3-model format still works:

```json
{
  "dummyHumans": {
    "flash": "google/gemini-2.0-flash",
    "human": "anthropic/claude-sonnet-4",
    "premium": "anthropic/claude-opus-4"
  }
}
```

This is automatically converted to pool entries with default capabilities.
If no configuration exists, hardcoded defaults are used (gemini-flash + gemini-pro).

---

## Memory Configuration

### Embedding Providers

#### Ollama (Local, Free)

```typescript
memory: {
  provider: 'ollama',
  model: 'bge-m3',  // or 'nomic-embed-text'
  dimensions: 1024,
  options: {
    baseURL: 'http://localhost:11434'
  }
}
```

**Pros:**
- ✅ Free
- ✅ Private (local processing)
- ✅ No API limits

**Cons:**
- ❌ Requires local setup
- ❌ Slower than cloud providers
- ❌ Lower quality embeddings

#### OpenAI

```typescript
memory: {
  provider: 'openai',
  model: 'text-embedding-3-large',
  dimensions: 3072,
  options: {
    apiKey: process.env.OPENAI_API_KEY
  }
}
```

**Pros:**
- ✅ High quality
- ✅ Fast
- ✅ Easy setup

**Cons:**
- ❌ Costs money
- ❌ Requires API key
- ❌ Internet required

#### VoyageAI (Best for Code)

```typescript
memory: {
  provider: 'voyageai',
  model: 'voyage-code-2',
  dimensions: 1536,
  options: {
    apiKey: process.env.VOYAGEAI_API_KEY
  }
}
```

**Pros:**
- ✅ Code-specialized embeddings
- ✅ Excellent for technical content
- ✅ Good performance/cost ratio

**Cons:**
- ❌ Costs money
- ❌ Requires API key

#### OpenRouter

```typescript
memory: {
  provider: 'openrouter',
  model: 'openai/text-embedding-3-large',
  dimensions: 3072,
  options: {
    apiKey: process.env.OPENROUTER_API_KEY
  }
}
```

**Pros:**
- ✅ Access to multiple providers
- ✅ Flexible model selection
- ✅ Unified billing

**Cons:**
- ❌ Costs money
- ❌ Requires API key

#### Text-only (No Embeddings)

```typescript
memory: {
  provider: 'text',
  model: 'fts5',
  dimensions: 0
}
```

**Pros:**
- ✅ Free
- ✅ No API needed
- ✅ Fast for exact matches

**Cons:**
- ❌ No semantic search
- ❌ Keyword-based only
- ❌ Less intelligent

### Memory Storage

```typescript
memory: {
  // ... provider config
  
  // Storage location
  dataDir: './.opencode/memory',
  
  // Database file
  dbPath: './.opencode/memory/chunks.db',
  
  // Chunking configuration
  chunkSize: 1000,        // Max tokens per chunk
  chunkOverlap: 200,      // Overlap between chunks
  
  // Search configuration
  searchLimit: 10,        // Max results
  minScore: 0.7          // Minimum similarity score
}
```

---

## Context System

Track long-running features:

```typescript
context: {
  // Where to store context data
  dataDir: './.opencode/context',
  
  // Maximum active features
  maxFeatures: 10,
  
  // Auto-cleanup completed features after N days
  cleanupAfterDays: 30,
  
  // Include in AI context automatically
  autoInclude: true
}
```

### Using Context

```bash
# Start a feature
@context start name="oauth-login" goal="Implement OAuth2 flow"

# Add files
@context add file="src/auth/oauth.ts"
@context add file="src/middleware/session.ts"

# Check status
@context status

# Mark as done
@context done
```

---

## Retrospect System

Evaluate mask and session effectiveness:

```typescript
retrospect: {
  // Enable retrospect system
  enabled: true,
  
  // Auto-trigger on session end
  autoTrigger: true,
  
  // Retrospect depth
  depth: 'standard',  // quick | standard | deep
  
  // Where to store retrospect data
  dataDir: './.opencode/retrospect',
  
  // Include in memory for future sessions
  feedIntoMemory: true
}
```

### Depth Levels

**Quick:**
- Summary only
- No detailed analysis
- Fast

**Standard:**
- Summary
- What went well
- What to improve

**Deep:**
- Full analysis
- Detailed lessons learned
- Mask effectiveness ratings
- Recommendations

---

## Verification System

Cross-check code with different masks:

```typescript
verify: {
  // Default mask for verification
  defaultMask: 'linus-torvalds',
  
  // Auto-verify after code generation
  autoVerify: false,
  
  // Verification strictness
  strictness: 'balanced',  // lenient | balanced | strict
  
  // Which aspects to verify
  aspects: [
    'correctness',
    'performance',
    'maintainability',
    'security'
  ]
}
```

---

## Weave Workflow

Configure the phase-driven development workflow:

```typescript
weave: {
  // Enable/disable Weave workflow
  enabled: true,
  
  // Verification layers to run
  verification: {
    layers: [
      'typecheck',   // tsc --noEmit
      'lint',        // eslint
      'build',       // npm run build
      'test',        // jest/vitest
      'e2e',         // Playwright (primary E2E tool)
      'visual',      // Screenshot capture
      'api',         // API health checks
      'a11y'         // axe-core accessibility
    ],
    
    // Maximum retry attempts before escalating to user
    maxRetries: 5,
    
    // Playwright configuration
    playwright: {
      headless: true,
      browser: 'chromium',  // chromium | firefox | webkit
      timeout: 30000,
      screenshotsDir: './.weave/screenshots'
    }
  },
  
  // Autonomous mask selection
  maskSelection: {
    enabled: true,
    rules: {
      'architecture': 'martin-fowler',
      'testing': 'kent-beck',
      'react': 'dan-abramov',
      'performance': 'linus-torvalds',
      'ml': 'andrew-ng'
    },
    
    // Rotate mask if same error occurs
    rotateMaskOnFailure: true
  },
  
  // Global Knowledge Base (RAG)
  globalKnowledge: {
    enabled: true,
    
    // Storage location
    dbPath: '~/.maskweaver/knowledge.sqlite',
    
    // Search configuration
    search: {
      minScore: 0.7,
      limit: 5
    },
    
    // Auto-record successful fixes
    autoRecord: true
  },
  
  // Plan storage
  planDir: './.opencode/weave',
  
  // Phase completion settings
  handoff: {
    // Require all verification layers to pass
    requireAllPassing: true,
    
    // Show human validation checklist
    showValidationChecklist: true
  }
}
```

### Verification Layers

| Layer | Type | Tool | Purpose |
|-------|------|------|---------|
| `typecheck` | Build | `tsc --noEmit` | TypeScript type checking |
| `lint` | Build | `eslint` | Code quality |
| `build` | Build | `npm run build` | Build verification |
| `test` | Test | `jest/vitest` | Unit tests |
| `e2e` | Test | **Playwright** | End-to-end tests |
| `visual` | Visual | Playwright/browser | Screenshot capture |
| `api` | API | `fetch` | API health checks |
| `a11y` | Accessibility | `axe-core` | Accessibility audits |

### Global Knowledge Base

The Global Knowledge Base stores troubleshooting solutions across all projects:

```typescript
globalKnowledge: {
  // Location (shared across projects)
  dbPath: '~/.maskweaver/knowledge.sqlite',
  
  // Custom error signature extraction
  errorSigPatterns: [
    'TS\\d+',           // TypeScript errors
    'ENOENT',           // File not found
    'playwright:.*'     // Playwright errors
  ],
  
  // Enable hybrid search (vector + text)
  hybridSearch: true
}
```

### Playwright Integration

Playwright is the default E2E testing tool for Weave:

```typescript
weave: {
  verification: {
    playwright: {
      // Browser settings
      headless: true,
      browser: 'chromium',
      
      // Timeouts
      timeout: 30000,
      navigationTimeout: 10000,
      
      // Screenshots
      screenshotsDir: './.weave/screenshots',
      fullPage: true,
      
      // Trace recording (for debugging)
      trace: 'retain-on-failure'
    }
  }
}
```

### Mask Auto-Selection Rules

Configure which masks are automatically selected for different task types:

```typescript
weave: {
  maskSelection: {
    rules: {
      // Task patterns mapped to masks
      'architect': 'martin-fowler',
      'design': 'martin-fowler',
      'test': 'kent-beck',
      'tdd': 'kent-beck',
      'react': 'dan-abramov',
      'frontend': 'dan-abramov',
      'performance': 'linus-torvalds',
      'system': 'linus-torvalds',
      'ml': 'andrew-ng',
      'ai': 'andrew-ng'
    },
    
    // Default mask if no pattern matches
    default: 'kent-beck'
  }
}
```

---

## Language Configuration

Multi-language support:

```typescript
// Language preference
language: 'en',  // en | ko | zh | ja

// Fallback language if preferred not available
fallbackLanguage: 'en',

// Language-specific mask directories
maskDirs: {
  en: './masks/en',
  ko: './masks/ko',
  zh: './masks/zh',
  ja: './masks/ja'
}
```

---

## Advanced Configuration

### Custom Mask Loading

```typescript
// Custom mask loader
maskLoader: {
  // Custom mask directory
  customDir: './my-masks',
  
  // Load order (first match wins)
  loadOrder: ['custom', 'project', 'user', 'builtin'],
  
  // Validation strictness
  validation: 'strict',  // none | lenient | strict
  
  // Cache masks for performance
  cache: true
}
```

### Performance Tuning

```typescript
performance: {
  // Enable caching
  cache: {
    enabled: true,
    ttl: 3600  // Cache TTL in seconds
  },
  
  // Parallel agent execution
  parallelAgents: {
    enabled: true,
    maxConcurrent: 3
  },
  
  // Memory optimization
  memory: {
    indexBatchSize: 100,
    searchBatchSize: 50
  }
}
```

### Logging and Debugging

```typescript
logging: {
  // Log level
  level: 'info',  // debug | info | warn | error
  
  // Log file location
  file: './.opencode/logs/maskweaver.log',
  
  // Enable debug mode
  debug: false,
  
  // Log mask usage statistics
  trackUsage: true
}
```

---

## Environment Variables

Override configuration with environment variables:

```bash
# Memory provider
export MASKWEAVER_MEMORY_PROVIDER=voyageai
export MASKWEAVER_MEMORY_MODEL=voyage-code-2

# API keys
export OPENAI_API_KEY=sk-...
export VOYAGEAI_API_KEY=pa-...
export OPENROUTER_API_KEY=sk-or-...

# Ollama settings
export OLLAMA_BASE_URL=http://localhost:11434

# Debugging
export MASKWEAVER_DEBUG=true
export MASKWEAVER_LOG_LEVEL=debug

# Language
export MASKWEAVER_LANGUAGE=ko
```

### Priority

Configuration is loaded in this order (highest to lowest priority):

1. Environment variables
2. Project configuration (`.opencode/maskweaver.config.ts`)
3. User configuration (`~/.config/opencode/maskweaver.config.ts`)
4. Default configuration

---

## Configuration Templates

### For Solo Developer

```json
{
  "dummyHumans": {
    "flash": "google/gemini-2.0-flash",
    "human": "anthropic/claude-sonnet-4",
    "premium": "anthropic/claude-sonnet-4"
  },
  "memory": { "provider": "ollama", "model": "bge-m3", "dimensions": 1024 },
  "language": "en"
}
```

### For Power User (Multiple Models)

```json
{
  "dummyHumans": {
    "pool": [
      { "id": "gemini-flash", "model": "google/gemini-2.0-flash", "tier": "flash", "maxConcurrent": 5, "capabilities": ["search", "formatting", "simple-coding"], "costTier": "low" },
      { "id": "gemini-pro",   "model": "google/gemini-2.5-pro",   "tier": "human", "maxConcurrent": 3, "capabilities": ["coding", "testing"],  "costTier": "medium" },
      { "id": "claude-sonnet","model": "anthropic/claude-sonnet-4","tier": "human", "maxConcurrent": 3, "capabilities": ["coding", "frontend"], "costTier": "medium" },
      { "id": "claude-opus",  "model": "anthropic/claude-opus-4",  "tier": "premium", "maxConcurrent": 1, "capabilities": ["architecture", "reasoning", "complex-coding"], "costTier": "high" }
    ]
  },
  "memory": { "provider": "voyageai", "model": "voyage-code-2", "dimensions": 1536 },
  "language": "en"
}
```

### For Cost Optimization

```json
{
  "dummyHumans": {
    "flash": "google/gemini-2.0-flash",
    "human": "google/gemini-2.0-flash",
    "premium": "anthropic/claude-sonnet-4"
  },
  "memory": { "provider": "ollama", "model": "bge-m3", "dimensions": 1024 }
}
```

---

## Troubleshooting

### "Configuration not found"

**Solution:** Create `maskweaver.config.json` in your project root.

### "Invalid memory provider"

**Solution:** Check that your provider name matches: `ollama`, `openai`, `voyageai`, `openrouter`, or `text`.

### "API key not set"

**Solution:** Set the appropriate environment variable:
```bash
export OPENAI_API_KEY=...
export VOYAGEAI_API_KEY=...
```

### Configuration not loading

**Solution:**
1. Check file location (`maskweaver.config.json` in project root)
2. Verify syntax (valid JSON)

---

## Next Steps

- 📖 [Masks Guide](masks.md) - Learn about creating expert personas
- 🧵 [Weave Workflow](../README.md#-weave-workflow) - Phase-driven development with AI verification
- 🚀 [Installation Guide](installation.md) - Get started with Maskweaver
- 💬 [Ask questions](https://github.com/ulgerang/maskweaver/discussions)

---

<p align="center">
  <sub>Configure Maskweaver your way! 🎭</sub>
</p>
