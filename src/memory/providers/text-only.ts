/**
 * Text-Only Provider (Null Object Pattern)
 * 
 * Graceful degradation when no embedding service is available.
 * Returns empty vectors, allowing the system to function in text-only mode.
 * Vector search is skipped; only FTS keyword matching is used.
 * 
 * Use case: Development, testing, or when embedding APIs are unavailable.
 */

import type { Embedding, HealthCheckResult, IEmbeddingProvider, ProviderConfig } from "./types.js";

export class TextOnlyProvider implements IEmbeddingProvider {
  readonly name = "Text-Only (No Embeddings)";
  readonly type = "text-only" as const;
  readonly dimensions: number;

  /**
   * When true, signals that this provider cannot produce meaningful embeddings.
   * Consumers should skip vector search and rely on text/keyword search only.
   */
  readonly isTextOnly = true;

  constructor(config: ProviderConfig) {
    // dimensions = 0 signals "no real embeddings" — consumers should skip vector ops.
    // If an explicit dimension is provided (e.g., for testing), honor it.
    this.dimensions = config.dimensions ?? 0;
  }

  async healthCheck(): Promise<HealthCheckResult> {
    // Always healthy - it's a fallback
    return {
      ok: true,
      hint: "Text-only mode: semantic search will be limited to keyword matching"
    };
  }

  async embed(texts: string[]): Promise<Embedding[]> {
    // Return empty vectors — dimension 0 signals "no real embedding"
    return texts.map(() => []);
  }

  async embedQuery(text: string): Promise<Embedding> {
    return [];
  }

  async embedCode(texts: string[]): Promise<Embedding[]> {
    return this.embed(texts);
  }
}
