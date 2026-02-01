/**
 * Text-Only Provider (Null Object Pattern)
 * 
 * Graceful degradation when no embedding service is available.
 * Returns empty vectors, allowing the system to function in text-only mode.
 * 
 * Use case: Development, testing, or when embedding APIs are unavailable.
 */

import type { Embedding, HealthCheckResult, IEmbeddingProvider, ProviderConfig } from "./types.js";

export class TextOnlyProvider implements IEmbeddingProvider {
  readonly name = "Text-Only (No Embeddings)";
  readonly type = "text-only" as const;
  readonly dimensions: number;

  constructor(config: ProviderConfig) {
    // Minimal dimensions for compatibility
    this.dimensions = config.dimensions || 1;
  }

  async healthCheck(): Promise<HealthCheckResult> {
    // Always healthy - it's a fallback
    return {
      ok: true,
      hint: "Text-only mode: semantic search will be limited to keyword matching"
    };
  }

  async embed(texts: string[]): Promise<Embedding[]> {
    // Return zero vectors
    return texts.map(() => new Array(this.dimensions).fill(0));
  }

  async embedQuery(text: string): Promise<Embedding> {
    return new Array(this.dimensions).fill(0);
  }

  async embedCode(texts: string[]): Promise<Embedding[]> {
    return this.embed(texts);
  }
}
