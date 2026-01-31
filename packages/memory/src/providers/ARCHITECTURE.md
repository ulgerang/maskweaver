# Architecture Design Document

## Embedding Provider System

**Author**: Martin Fowler-style Enterprise Architect  
**Date**: 2026-01-31  
**Status**: ✅ Complete

---

## Design Philosophy

> "Any fool can write code that a computer can understand.  
> Good programmers write code that humans can understand."

This system embodies:

1. **Clean Architecture** - Clear separation of concerns
2. **SOLID Principles** - Especially ISP and DIP
3. **Pattern Language** - Strategy + Factory + Null Object
4. **Graceful Degradation** - Never fail completely

---

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                    Memory System Client                      │
│                  (Depends on Abstractions)                   │
└────────────────────────┬────────────────────────────────────┘
                         │
                         │ depends on
                         ↓
         ┌───────────────────────────────┐
         │   IEmbeddingProvider          │  ← Core Abstraction
         │   (Interface)                 │
         ├───────────────────────────────┤
         │ + healthCheck()               │
         │ + embed(texts[])              │
         │ + embedCode?(texts[])         │
         │ + embedQuery?(text)           │
         └───────────────┬───────────────┘
                         │
                         │ implemented by
         ┌───────────────┴───────────────────────────┐
         │                                           │
    ┌────▼─────┐  ┌────────┐  ┌────────┐  ┌────────┐  ┌──────────┐
    │  Voyage  │  │ Ollama │  │ OpenAI │  │OpenRtr │  │Text-Only │
    │ Provider │  │Provider│  │Provider│  │Provider│  │ Provider │
    └──────────┘  └────────┘  └────────┘  └────────┘  └──────────┘
         │             │           │           │            │
    [Code-specialized] [Local]  [Cloud]   [Gateway]   [Fallback]


┌─────────────────────────────────────────────────────────────┐
│                     Factory Layer                            │
├─────────────────────────────────────────────────────────────┤
│  createProvider(config)      → Single provider              │
│  selectBestProvider(configs) → Auto-selection + fallback    │
│  getDefaultConfigs()         → Sensible defaults            │
└─────────────────────────────────────────────────────────────┘
```

---

## Design Patterns Applied

### 1. Strategy Pattern

**Intent**: Define a family of algorithms, encapsulate each one, and make them interchangeable.

**Application**:
- `IEmbeddingProvider` = Strategy interface
- Each provider = Concrete strategy
- Factory = Strategy selector

**Benefits**:
- Swap providers at runtime
- Easy to add new providers
- Testable through mocking

```typescript
// Client depends on interface, not implementation
async function getEmbedding(provider: IEmbeddingProvider, text: string) {
  return provider.embed([text]);
}

// Can use ANY provider
await getEmbedding(new VoyageProvider(config), "hello");
await getEmbedding(new OllamaProvider(config), "hello");
await getEmbedding(new MockProvider(), "hello");  // Testing!
```

### 2. Factory Pattern

**Intent**: Centralize object creation logic.

**Application**:
- `createProvider()` = Simple factory
- `selectBestProvider()` = Factory with selection logic
- `getDefaultConfigs()` = Configuration provider

**Benefits**:
- Type-safe construction
- Centralized validation
- Easier refactoring

```typescript
// Before: Manual construction (error-prone)
const provider = new VoyageProvider({
  type: "voyage",
  apiKey: process.env.VOYAGE_API_KEY,
  model: "voyage-code-3"
});

// After: Factory handles complexity
const provider = createProvider({
  type: "voyage",
  model: "voyage-code-3"
});
```

### 3. Null Object Pattern

**Intent**: Provide a default object that does nothing.

**Application**:
- `TextOnlyProvider` = Null object
- Always available
- Returns zero vectors

**Benefits**:
- No null checks needed
- System never fails completely
- Graceful degradation

```typescript
// Never returns null!
const provider = await selectBestProvider(configs);
// Even if all fail, returns TextOnlyProvider

// Safe to use
await provider.embed(texts);  // No null check needed
```

---

## SOLID Principles

### Single Responsibility Principle (SRP)

Each class has ONE reason to change:

- `OllamaProvider` - Changes when Ollama API changes
- `VoyageProvider` - Changes when Voyage API changes
- `Factory` - Changes when creation logic changes
- `types.ts` - Changes when contract changes

### Open/Closed Principle (OCP)

**Open for extension**, closed for modification:

```typescript
// Adding a new provider doesn't modify existing code
class CoherceProvider implements IEmbeddingProvider {
  // Just implement the interface!
}

// Update factory (one place)
export function createProvider(config: ProviderConfig) {
  switch (config.type) {
    case "coherence": return new CoherceProvider(config);
    // ...
  }
}
```

### Liskov Substitution Principle (LSP)

Any `IEmbeddingProvider` can replace another:

```typescript
function processText(provider: IEmbeddingProvider, text: string) {
  // Works with ANY provider
  return provider.embed([text]);
}

// All valid!
processText(new OllamaProvider(config), text);
processText(new VoyageProvider(config), text);
processText(new TextOnlyProvider(config), text);
```

### Interface Segregation Principle (ISP)

Clients only depend on methods they use:

- Core methods: `healthCheck()`, `embed()`
- Optional methods: `embedCode?()`, `embedQuery?()`

```typescript
// Client only needs basic embedding
function basicEmbed(provider: IEmbeddingProvider, texts: string[]) {
  return provider.embed(texts);
  // Doesn't need embedCode() or embedQuery()
}

// Client needs code-specific
function codeEmbed(provider: IEmbeddingProvider, code: string[]) {
  if (provider.embedCode) {
    return provider.embedCode(code);  // Use if available
  }
  return provider.embed(code);  // Fallback
}
```

### Dependency Inversion Principle (DIP)

**High-level modules depend on abstractions**, not concrete classes:

```typescript
// ❌ Bad: Depends on concrete class
class MemoryStore {
  private provider = new VoyageProvider(config);  // Coupled!
}

// ✅ Good: Depends on abstraction
class MemoryStore {
  constructor(private provider: IEmbeddingProvider) {}
  // Can use ANY provider
}

// Inject dependency
const store = new MemoryStore(
  await selectBestProvider(getDefaultConfigs())
);
```

---

## Graceful Degradation Strategy

**Philosophy**: "It's better to do something than to do nothing."

### Priority Cascade

```
1. Voyage (voyage-code-3)     ← Code-specialized, best quality
   ↓ if unavailable
2. Ollama (local)              ← Privacy, zero cost
   ↓ if unavailable
3. OpenAI (cloud)              ← Reliable, industry standard
   ↓ if unavailable
4. OpenRouter (gateway)        ← Multi-provider fallback
   ↓ if unavailable
5. Text-Only                   ← ALWAYS works (null object)
```

### Implementation

```typescript
export async function selectBestProvider(
  configs: ProviderConfig[]
): Promise<IEmbeddingProvider> {
  for (const config of configs) {
    try {
      const provider = createProvider(config);
      const health = await provider.healthCheck();
      
      if (health.ok) {
        return provider;  // First healthy provider wins
      }
      
      console.warn(`${provider.name} unavailable: ${health.reason}`);
    } catch (error) {
      console.warn(`Failed to initialize ${config.type}`);
    }
  }
  
  // Ultimate fallback - NEVER fails
  return new TextOnlyProvider({ type: "text-only" });
}
```

**Key insight**: The system **never throws** during provider selection. It always returns a usable provider.

---

## Testing Strategy

### Unit Testing

Each provider can be tested in isolation:

```typescript
describe("VoyageProvider", () => {
  it("should embed text", async () => {
    const provider = new VoyageProvider({
      type: "voyage",
      apiKey: "test-key",
      model: "voyage-code-3"
    });
    
    const embeddings = await provider.embed(["test"]);
    expect(embeddings).toHaveLength(1);
    expect(embeddings[0]).toHaveLength(1024);
  });
});
```

### Integration Testing

Use text-only provider for fast tests:

```typescript
const testProvider = new TextOnlyProvider({ type: "text-only" });

// Fast, no API calls
const result = await memoryStore.search("query", testProvider);
```

### Mock Testing

Easy to mock the interface:

```typescript
class MockProvider implements IEmbeddingProvider {
  readonly name = "Mock";
  readonly type = "text-only" as const;
  readonly dimensions = 1536;
  
  async healthCheck() { return { ok: true }; }
  async embed(texts: string[]) {
    return texts.map(() => new Array(1536).fill(0.5));
  }
}
```

---

## Extension Points

### Adding a New Provider

1. Implement `IEmbeddingProvider`
2. Add to factory
3. Update type union

```typescript
// 1. Implement
export class CoherceProvider implements IEmbeddingProvider {
  readonly name = "Coherence";
  readonly type = "coherence" as const;
  readonly dimensions = 1024;
  
  async healthCheck() { /* ... */ }
  async embed(texts: string[]) { /* ... */ }
}

// 2. Update types
export type ProviderType = 
  | "ollama" 
  | "openai" 
  | "voyage" 
  | "openrouter" 
  | "coherence"  // ← New
  | "text-only";

// 3. Update factory
export function createProvider(config: ProviderConfig) {
  switch (config.type) {
    case "coherence": return new CoherenceProvider(config);
    // ...
  }
}
```

### Custom Health Checks

Override for specific needs:

```typescript
class CustomOllamaProvider extends OllamaProvider {
  async healthCheck() {
    const baseHealth = await super.healthCheck();
    
    if (!baseHealth.ok) return baseHealth;
    
    // Additional check: verify disk space
    const hasSpace = await checkDiskSpace();
    if (!hasSpace) {
      return {
        ok: false,
        reason: "Insufficient disk space",
        hint: "Free up at least 1GB for model cache"
      };
    }
    
    return { ok: true };
  }
}
```

---

## Performance Considerations

### Batch Processing

All providers support batch embedding:

```typescript
// Efficient: Single API call
await provider.embed(["text1", "text2", "text3"]);

// Inefficient: Multiple API calls
for (const text of texts) {
  await provider.embed([text]);  // Don't do this!
}
```

**Exception**: Ollama processes one at a time (API limitation).

### Caching Strategy

Consider caching at the client level:

```typescript
class CachedProvider implements IEmbeddingProvider {
  private cache = new Map<string, Embedding>();
  
  constructor(private provider: IEmbeddingProvider) {}
  
  async embed(texts: string[]): Promise<Embedding[]> {
    const results: Embedding[] = [];
    const toEmbed: string[] = [];
    
    for (const text of texts) {
      const cached = this.cache.get(text);
      if (cached) {
        results.push(cached);
      } else {
        toEmbed.push(text);
      }
    }
    
    if (toEmbed.length > 0) {
      const embeddings = await this.provider.embed(toEmbed);
      embeddings.forEach((emb, i) => {
        this.cache.set(toEmbed[i], emb);
        results.push(emb);
      });
    }
    
    return results;
  }
  
  // Delegate other methods...
}
```

---

## Security Considerations

### API Key Management

✅ **Good practices**:
- Use environment variables
- Never commit keys to git
- Validate keys at construction
- Clear error messages

```typescript
constructor(config: ProviderConfig) {
  const apiKey = config.apiKey || process.env.VOYAGE_API_KEY;
  if (!apiKey) {
    throw new Error(
      "Voyage API key is required (config.apiKey or VOYAGE_API_KEY)"
    );
  }
  this.apiKey = apiKey;
}
```

### Network Security

- Always use HTTPS (enforced in baseUrl defaults)
- No credentials in URLs
- Proper error handling (don't leak keys in errors)

---

## Code Metrics

| File | Lines | Purpose |
|------|-------|---------|
| `types.ts` | 72 | Core abstractions |
| `ollama.ts` | 81 | Local provider |
| `openai.ts` | 111 | Cloud provider |
| `voyage.ts` | 158 | Code-specialized provider |
| `openrouter.ts` | 105 | Gateway provider |
| `text-only.ts` | 42 | Fallback provider |
| `factory.ts` | 137 | Creation logic |
| `index.ts` | 49 | Public API |
| **Total** | **755** | **Complete system** |

**Code-to-comment ratio**: ~40% (well-documented)

---

## Future Enhancements

### Potential Additions

1. **Streaming embeddings** for large documents
2. **Rate limiting** and retry logic
3. **Embedding similarity** utilities
4. **Provider benchmarking** tools
5. **Multi-provider fallback** (try multiple if first fails)

### Backward Compatibility

All enhancements will:
- Maintain `IEmbeddingProvider` contract
- Add optional methods (not break existing)
- Follow semantic versioning

---

## Conclusion

This implementation demonstrates **enterprise-grade software design**:

✅ **Clean abstractions** - Interface-driven design  
✅ **SOLID principles** - Maintainable, extensible  
✅ **Design patterns** - Strategy, Factory, Null Object  
✅ **Graceful degradation** - Never fails completely  
✅ **Well-documented** - Code that humans can understand  
✅ **Testable** - Easy to mock and verify  
✅ **Extensible** - New providers in minutes  

**"Make the right things easy and the wrong things hard."**

This architecture makes it **easy** to:
- Add new providers
- Swap providers
- Test code
- Handle failures gracefully

And **hard** to:
- Create tight coupling
- Violate contracts
- Break existing code
- Miss errors

---

*Implemented by: Martin Fowler-style Enterprise Architect*  
*"Code should read like a well-written essay."*
