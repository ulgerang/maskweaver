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

```typescript
// maskweaver.config.ts
export default {
  // Dummy-human models (optional)
  dummyHumans: {
    flash: 'anthropic/claude-haiku-4',
    human: 'anthropic/claude-sonnet-4',
    premium: 'anthropic/claude-opus-4'
  },
  
  // Memory provider (optional)
  memory: {
    provider: 'voyageai',
    model: 'voyage-code-2',
    dimensions: 1536
  }
};
```

### Full Configuration Example

```typescript
// maskweaver.config.ts
export default {
  // Model configuration for dummy-humans
  dummyHumans: {
    flash: 'anthropic/claude-haiku-4',      // Fast, cheap tasks
    human: 'anthropic/claude-sonnet-4',     // Balanced
    premium: 'anthropic/claude-opus-4'      // Complex tasks
  },
  
  // Memory and embedding configuration
  memory: {
    provider: 'voyageai',  // ollama | openai | voyageai | openrouter | text
    model: 'voyage-code-2',
    dimensions: 1536,
    
    // Optional: Provider-specific settings
    options: {
      baseURL: 'https://api.voyageai.com/v1',
      timeout: 30000
    }
  },
  
  // Mask directory configuration
  maskDir: './masks',
  
  // Language preference
  language: 'en',  // en | ko | zh | ja
  
  // Context system configuration
  context: {
    dataDir: './.opencode/context',
    maxFeatures: 10
  },
  
  // Retrospect configuration
  retrospect: {
    enabled: true,
    autoTrigger: true,  // Auto-trigger on session end
    depth: 'standard'   // quick | standard | deep
  },
  
  // Verification configuration
  verify: {
    defaultMask: 'linus-torvalds',
    autoVerify: false
  }
};
```

---

## Dummy-Human Models

Configure AI models for different task tiers:

### Tier Selection

```typescript
dummyHumans: {
  // Flash: Fast, cheap operations
  flash: 'anthropic/claude-haiku-4',
  // - File searches
  // - Simple summaries
  // - Quick formatting
  
  // Human: Balanced performance
  human: 'anthropic/claude-sonnet-4',
  // - Code writing
  // - Code reviews
  // - General tasks
  
  // Premium: Maximum capability
  premium: 'anthropic/claude-opus-4'
  // - Architecture design
  // - Complex debugging
  // - Critical decisions
}
```

### Provider Options

Maskweaver supports multiple model providers through OpenRouter:

```typescript
dummyHumans: {
  // Anthropic
  flash: 'anthropic/claude-haiku-4',
  human: 'anthropic/claude-sonnet-4',
  premium: 'anthropic/claude-opus-4',
  
  // OpenAI
  // flash: 'openai/gpt-4o-mini',
  // human: 'openai/gpt-4o',
  // premium: 'openai/o1',
  
  // Google
  // flash: 'google/gemini-flash-2.0',
  // human: 'google/gemini-pro-2.0',
  // premium: 'google/gemini-pro-2.5',
  
  // Mix and match!
  // flash: 'anthropic/claude-haiku-4',
  // human: 'google/gemini-pro-2.0',
  // premium: 'openai/o1'
}
```

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

```typescript
export default {
  dummyHumans: {
    flash: 'anthropic/claude-haiku-4',
    human: 'anthropic/claude-sonnet-4',
    premium: 'anthropic/claude-sonnet-4'  // Save costs
  },
  
  memory: {
    provider: 'ollama',  // Free and local
    model: 'bge-m3',
    dimensions: 1024
  },
  
  language: 'en'
};
```

### For Team

```typescript
export default {
  dummyHumans: {
    flash: 'anthropic/claude-haiku-4',
    human: 'anthropic/claude-sonnet-4',
    premium: 'anthropic/claude-opus-4'
  },
  
  memory: {
    provider: 'voyageai',  // Best quality
    model: 'voyage-code-2',
    dimensions: 1536
  },
  
  context: {
    autoInclude: true,
    maxFeatures: 20
  },
  
  retrospect: {
    enabled: true,
    autoTrigger: true,
    depth: 'deep'  // Learn from sessions
  },
  
  language: 'en'
};
```

### For Cost Optimization

```typescript
export default {
  dummyHumans: {
    flash: 'anthropic/claude-haiku-4',
    human: 'anthropic/claude-sonnet-4',
    premium: 'anthropic/claude-sonnet-4'  // Skip Opus
  },
  
  memory: {
    provider: 'ollama',  // Free
    model: 'bge-m3',
    dimensions: 1024
  },
  
  retrospect: {
    depth: 'quick'  // Faster, cheaper
  }
};
```

---

## Troubleshooting

### "Configuration not found"

**Solution:** Create `maskweaver.config.ts` in your project root or `~/.config/opencode/`.

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
1. Check file location
2. Verify syntax (valid TypeScript)
3. Run: `bun run validate-config`

---

## Next Steps

- 📖 [Masks Guide](masks.md) - Learn about creating expert personas
- 🚀 [Installation Guide](installation.md) - Get started with Maskweaver
- 💬 [Ask questions](https://github.com/ulgerang/maskweaver/discussions)

---

<p align="center">
  <sub>Configure Maskweaver your way! 🎭</sub>
</p>
