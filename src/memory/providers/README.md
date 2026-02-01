# Embedding Providers

Enterprise-grade embedding provider system with **graceful degradation** and **clean abstractions**.

## Architecture Principles

This implementation follows Martin Fowler's enterprise patterns:

1. **Strategy Pattern** - Each provider implements `IEmbeddingProvider`
2. **Factory Pattern** - Centralized provider creation
3. **Dependency Inversion** - Depend on abstractions, not implementations
4. **Graceful Degradation** - Auto-fallback when services are unavailable
5. **Interface Segregation** - Clean, focused interfaces

## Quick Start

### Auto-selection (Recommended)

The system will try providers in priority order and select the first healthy one:

```typescript
import { selectBestProvider, getDefaultConfigs } from "./providers";

// Auto-select best available provider
const provider = await selectBestProvider(getDefaultConfigs());

// Use it
const embeddings = await provider.embed([
  "Hello world",
  "Good programmers write code that humans can understand"
]);
```

**Default priority:**
1. Voyage (code-specialized) 🎯
2. Ollama (local, free) 🏠
3. OpenAI (reliable) ☁️
4. OpenRouter (gateway) 🌐
5. Text-only (fallback) 📝

### Manual Provider Selection

```typescript
import { createProvider } from "./providers";

// For code embedding
const codeProvider = createProvider({
  type: "voyage",
  model: "voyage-code-3",
  apiKey: process.env.VOYAGE_API_KEY,
  dimensions: 1024
});

// For local development
const localProvider = createProvider({
  type: "ollama",
  model: "nomic-embed-text",
  baseUrl: "http://localhost:11434"
});

// For production
const prodProvider = createProvider({
  type: "openai",
  model: "text-embedding-3-small",
  dimensions: 1536
});
```

## Provider Details

### 🎯 Voyage AI (Code-Specialized)

**Best for:** Code search, technical documentation

```typescript
const provider = createProvider({
  type: "voyage",
  model: "voyage-code-3",      // Code-optimized
  // model: "voyage-4-lite",   // General purpose (default)
  // model: "voyage-4-large",  // High quality
  dimensions: 1024,             // 256 | 512 | 1024 | 2048
  apiKey: process.env.VOYAGE_API_KEY
});

// Code-specific embedding
const codeEmbeddings = await provider.embedCode([
  "function fibonacci(n: number): number { ... }"
]);

// Query-optimized for search
const queryEmbedding = await provider.embedQuery("how to implement fibonacci");
```

**Features:**
- ✅ `embedCode()` - Code-specialized model
- ✅ `embedQuery()` - Asymmetric search (query vs document)
- ✅ Configurable dimensions

**Environment:**
```bash
VOYAGE_API_KEY=your-api-key
```

### 🏠 Ollama (Local)

**Best for:** Privacy, zero-cost, offline

```typescript
const provider = createProvider({
  type: "ollama",
  model: "nomic-embed-text",    // Default
  baseUrl: "http://localhost:11434"
});
```

**Setup:**
```bash
# Install Ollama
curl -fsSL https://ollama.ai/install.sh | sh

# Pull embedding model
ollama pull nomic-embed-text

# Start server
ollama serve
```

**Features:**
- ✅ 100% local (no API calls)
- ✅ Free and open-source
- ✅ Privacy-first

### ☁️ OpenAI (Industry Standard)

**Best for:** Production reliability

```typescript
const provider = createProvider({
  type: "openai",
  model: "text-embedding-3-small",  // or text-embedding-3-large
  dimensions: 1536,                  // 256 | 512 | 1536 | 3072
  apiKey: process.env.OPENAI_API_KEY
});
```

**Environment:**
```bash
OPENAI_API_KEY=sk-...
```

**Features:**
- ✅ Highly reliable
- ✅ Flexible dimensions
- ✅ Industry standard

### 🌐 OpenRouter (Multi-Model Gateway)

**Best for:** Model flexibility, fallback

```typescript
const provider = createProvider({
  type: "openrouter",
  model: "openai/text-embedding-3-small",
  apiKey: process.env.OPENROUTER_API_KEY
});
```

**Environment:**
```bash
OPENROUTER_API_KEY=sk-or-...
OPENROUTER_REFERER=https://your-app.com  # Optional
OPENROUTER_TITLE=YourAppName             # Optional
```

**Features:**
- ✅ Access to multiple providers
- ✅ Unified API
- ✅ Pay-per-use

### 📝 Text-Only (Fallback)

**Best for:** Testing, development without embeddings

```typescript
const provider = createProvider({
  type: "text-only"
});
```

**Features:**
- ✅ Always available
- ✅ Zero dependencies
- ✅ Graceful degradation
- ⚠️ No semantic search (keyword only)

## Advanced Usage

### Custom Provider Priority

```typescript
const provider = await selectBestProvider([
  // Try local first
  { type: "ollama" },
  
  // Then specialized code model
  { type: "voyage", model: "voyage-code-3" },
  
  // Fallback to cloud
  { type: "openai" }
]);
```

### Health Checks

```typescript
const provider = createProvider({ type: "ollama" });

const health = await provider.healthCheck();

if (!health.ok) {
  console.error(health.reason);
  console.log(health.hint);  // Actionable suggestion
}
```

### Batch Embedding

```typescript
const texts = [
  "// Calculate fibonacci number",
  "function fib(n) { return n < 2 ? n : fib(n-1) + fib(n-2); }",
  "// Recursive implementation"
];

const embeddings = await provider.embed(texts);
// Returns: number[][] (one vector per text)
```

## Testing Strategy

```typescript
// Use text-only provider in tests
const testProvider = createProvider({ type: "text-only" });

// Or mock the interface
class MockProvider implements IEmbeddingProvider {
  readonly name = "Mock";
  readonly type = "text-only" as const;
  readonly dimensions = 1536;
  
  async healthCheck() {
    return { ok: true };
  }
  
  async embed(texts: string[]) {
    return texts.map(() => new Array(1536).fill(0));
  }
}
```

## Design Rationale

### Why Strategy Pattern?

- **Testability**: Easy to mock `IEmbeddingProvider`
- **Flexibility**: Swap providers without changing client code
- **Extensibility**: Add new providers by implementing interface

### Why Factory Pattern?

- **Encapsulation**: Hide provider construction complexity
- **Type Safety**: Centralized validation
- **Consistency**: Single point of configuration

### Why Graceful Degradation?

> "It's better to do something than to do nothing while waiting for perfection."

The system prioritizes **availability over perfection**:

1. Try best provider (Voyage)
2. Fall back to local (Ollama)
3. Fall back to cloud (OpenAI)
4. Ultimate fallback (text-only)

This ensures the memory system **never fails completely**.

## Environment Variables Summary

```bash
# Voyage AI
VOYAGE_API_KEY=your-key

# OpenAI
OPENAI_API_KEY=sk-...

# OpenRouter
OPENROUTER_API_KEY=sk-or-...
OPENROUTER_REFERER=https://your-app.com
OPENROUTER_TITLE=YourAppName
```

## Type Reference

```typescript
interface IEmbeddingProvider {
  readonly name: string;
  readonly type: ProviderType;
  readonly dimensions: number;
  
  healthCheck(): Promise<HealthCheckResult>;
  embed(texts: string[]): Promise<Embedding[]>;
  embedCode?(texts: string[]): Promise<Embedding[]>;
  embedQuery?(text: string): Promise<Embedding>;
}

type ProviderType = "ollama" | "openai" | "voyage" | "openrouter" | "text-only";
type Embedding = number[];
```

---

**"Any fool can write code that a computer can understand. Good programmers write code that humans can understand."**  
— Martin Fowler
