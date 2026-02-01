/**
 * Embedding Provider Types
 * 
 * Clean interface design following Interface Segregation Principle.
 * Each provider implements the IEmbeddingProvider contract while maintaining
 * flexibility for provider-specific optimizations.
 */

export type Embedding = number[];
export type ProviderType = "ollama" | "openai" | "voyage" | "openrouter" | "text-only";

/**
 * Health check result with actionable feedback
 */
export interface HealthCheckResult {
  ok: boolean;
  reason?: string;
  hint?: string;
}

/**
 * Provider configuration - immutable after construction
 */
export interface ProviderConfig {
  type: ProviderType;
  apiKey?: string;
  model?: string;
  baseUrl?: string;
  dimensions?: number;
}

/**
 * Core embedding provider interface
 * 
 * Design principle: "Program to an interface, not an implementation"
 * This enables Strategy Pattern for swappable embedding backends.
 */
export interface IEmbeddingProvider {
  /** Provider identifier */
  readonly name: string;
  
  /** Provider type for factory selection */
  readonly type: ProviderType;
  
  /** Output vector dimensions */
  readonly dimensions: number;
  
  /**
   * Verify provider is ready and reachable
   * Should be fast and non-destructive
   */
  healthCheck(): Promise<HealthCheckResult>;
  
  /**
   * Generate embeddings for multiple texts
   * @param texts - Array of text strings to embed
   * @returns Array of embedding vectors
   */
  embed(texts: string[]): Promise<Embedding[]>;
  
  /**
   * Optional: Generate code-optimized embeddings
   * Some providers (like Voyage) have specialized code models
   */
  embedCode?(texts: string[]): Promise<Embedding[]>;
  
  /**
   * Optional: Generate query-optimized embedding
   * For asymmetric search (query vs document)
   */
  embedQuery?(text: string): Promise<Embedding>;
}
