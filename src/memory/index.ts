/**
 * @maskweaver/memory
 * 
 * Memory system with embeddings and vector search
 */

// Core types and utilities
export type {
  SourceType,
  MemoryType,
  Chunk,
  SearchResult,
} from "./core.js";

export {
  CONFIG,
  hashText,
  estimateTokens,
  determineSource,
  cosineSimilarity,
  cosineSimilarityFloat32,
  toFloat32Array,
  embeddingToBlob,
  blobToEmbedding,
  blobToNumberArray,
  getTodayFileName,
  dateToFileName,
  getMemoryPath,
  getDbPath,
  getDataDir,
  sleep,
  getConfig,
} from "./core.js";

// Provider types and implementations
export type {
  Embedding,
  ProviderType,
  HealthCheckResult,
  ProviderConfig,
  IEmbeddingProvider,
} from "./providers/types.js";

export { OllamaProvider } from "./providers/ollama.js";
export { OpenAIProvider } from "./providers/openai.js";
export { VoyageProvider } from "./providers/voyage.js";
export { OpenRouterProvider } from "./providers/openrouter.js";
export { TextOnlyProvider } from "./providers/text-only.js";

// Provider factory
export {
  createProvider,
  selectBestProvider,
  getDefaultConfigs,
} from "./providers/factory.js";

// Chunking
export { chunkText, parseMarkdownSections, splitIntoSentences } from "./chunking.js";

// Storage
export {
  MemoryDatabase,
  initDatabase,
  getDatabase,
  tryGetDatabase,
  isSqliteAvailable,
  getSqliteUnavailableReason,
  upsertChunk,
  searchByVector,
  searchByText,
  deleteChunksByPath,
  getChunksByPath,
} from "./store/sqlite.js";

export type { SearchOptions } from "./store/sqlite.js";

// Search
export { hybridSearch } from "./search/hybrid.js";

// Indexing
export {
  indexFile,
  reindexFile,
  indexAllMemoryFiles,
  classifySource,
} from "./indexer.js";

export type { MarkdownSection } from "./indexer.js";
