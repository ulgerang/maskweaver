# @maskweaver/memory

Simple memory system with embeddings and vector search.

## Features

- **Text Chunking**: Break long documents into overlapping chunks
- **SQLite Storage**: Fast local storage with FTS5 full-text search
- **Vector Search**: Cosine similarity search over embeddings
- **Hybrid Search**: Combine vector and text search
- **Multiple Providers**: Ollama, OpenAI, Voyage, OpenRouter

## Usage

```typescript
import {
  initDatabase,
  getDbPath,
  indexFile,
  hybridSearch,
} from '@maskweaver/memory';
import { OllamaProvider } from '@maskweaver/memory';

// Initialize database
initDatabase(getDbPath());

// Create embedding provider
const provider = new OllamaProvider({
  model: 'bge-m3',
  baseUrl: 'http://localhost:11434',
  dimensions: 1024,
});

// Index a file
await indexFile(
  './memory/MEMORY.md',
  (text) => provider.embed([text]).then(e => e[0])
);

// Search
const results = await hybridSearch(
  'Rob Pike system programming',
  await provider.embed(['Rob Pike system programming']).then(e => e[0]),
  { limit: 5, minScore: 0.3 }
);

console.log(results);
```

## Architecture

```
core.ts          # Basic utilities (hash, similarity, paths)
chunking.ts      # Text chunking with overlap
store/sqlite.ts  # SQLite storage with FTS5
search/hybrid.ts # Vector + text hybrid search
indexer.ts       # File indexing pipeline
providers/       # Embedding providers
```

## Design Principles

Following Rob Pike's philosophy:

- **Clear is better than clever** - Simple, readable code
- **Errors are explicit** - No silent failures
- **Minimal dependencies** - Only what we need
- **Single responsibility** - Each module does one thing well

## Dependencies

- `better-sqlite3` - Fast SQLite library
- Embedding providers (optional)

## License

MIT
