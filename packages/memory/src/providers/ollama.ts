/**
 * Ollama Embedding Provider
 * 
 * Local-first embedding using Ollama's API.
 * Prioritizes privacy and zero-cost operation.
 */

import type { Embedding, HealthCheckResult, IEmbeddingProvider, ProviderConfig } from "./types.js";

export class OllamaProvider implements IEmbeddingProvider {
  readonly name = "Ollama";
  readonly type = "ollama" as const;
  readonly dimensions: number;
  
  private readonly baseUrl: string;
  private readonly model: string;

  constructor(config: ProviderConfig) {
    this.baseUrl = config.baseUrl || "http://localhost:11434";
    this.model = config.model || "nomic-embed-text";
    this.dimensions = config.dimensions || 768; // nomic-embed-text default
  }

  async healthCheck(): Promise<HealthCheckResult> {
    try {
      const response = await fetch(`${this.baseUrl}/api/tags`);
      
      if (!response.ok) {
        return {
          ok: false,
          reason: `Ollama API returned ${response.status}`,
          hint: "Is Ollama running? Try: ollama serve"
        };
      }

      const data = await response.json() as { models?: Array<{ name: string }> };
      const hasModel = data.models?.some((m) => m.name.includes(this.model));
      
      if (!hasModel) {
        return {
          ok: false,
          reason: `Model '${this.model}' not found`,
          hint: `Pull it with: ollama pull ${this.model}`
        };
      }

      return { ok: true };
    } catch (error) {
      return {
        ok: false,
        reason: error instanceof Error ? error.message : "Unknown error",
        hint: "Ensure Ollama is installed and running on port 11434"
      };
    }
  }

  async embed(texts: string[]): Promise<Embedding[]> {
    const embeddings: Embedding[] = [];

    // Ollama API processes one text at a time
    for (const text of texts) {
      const response = await fetch(`${this.baseUrl}/api/embeddings`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: this.model,
          prompt: text
        })
      });

      if (!response.ok) {
        throw new Error(`Ollama embedding failed: ${response.statusText}`);
      }

      const data = await response.json() as { embedding: number[] };
      embeddings.push(data.embedding);
    }

    return embeddings;
  }
}
