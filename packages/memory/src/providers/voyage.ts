/**
 * Voyage AI Embedding Provider
 * 
 * Specialized embeddings with code-specific models (voyage-code-3).
 * Supports asymmetric search with input_type distinction.
 * 
 * Key feature: embedCode() method for superior code understanding.
 */

import type { Embedding, HealthCheckResult, IEmbeddingProvider, ProviderConfig } from "./types.js";

const VALID_DIMENSIONS = [256, 512, 1024, 2048] as const;
const CODE_MODELS = ["voyage-code-3"];
const GENERAL_MODELS = ["voyage-4-lite", "voyage-4-large"];

type InputType = "query" | "document";

export class VoyageProvider implements IEmbeddingProvider {
  readonly name = "Voyage AI";
  readonly type = "voyage" as const;
  readonly dimensions: number;
  
  private readonly apiKey: string;
  private readonly model: string;
  private readonly baseUrl: string;

  constructor(config: ProviderConfig) {
    const apiKey = config.apiKey || process.env.VOYAGE_API_KEY;
    if (!apiKey) {
      throw new Error("Voyage API key is required (config.apiKey or VOYAGE_API_KEY)");
    }
    
    this.apiKey = apiKey;
    this.model = config.model || "voyage-4-lite";
    this.baseUrl = config.baseUrl || "https://api.voyageai.com/v1";
    this.dimensions = this.validateDimensions(config.dimensions);
  }

  private validateDimensions(dim?: number): number {
    if (!dim) return 1024; // Default for voyage-4-lite
    
    if (!VALID_DIMENSIONS.includes(dim as typeof VALID_DIMENSIONS[number])) {
      throw new Error(
        `Invalid dimensions ${dim}. Must be one of: ${VALID_DIMENSIONS.join(", ")}`
      );
    }
    
    return dim;
  }

  async healthCheck(): Promise<HealthCheckResult> {
    try {
      // Test with a minimal embedding request
      const response = await fetch(`${this.baseUrl}/embeddings`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${this.apiKey}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          model: this.model,
          input: ["test"],
          input_type: "query"
        })
      });

      if (response.status === 401) {
        return {
          ok: false,
          reason: "Invalid API key",
          hint: "Check your VOYAGE_API_KEY environment variable"
        };
      }

      if (!response.ok) {
        const error = await response.text();
        return {
          ok: false,
          reason: `API returned ${response.status}: ${error}`,
          hint: "Verify your Voyage AI account and model access"
        };
      }

      return { ok: true };
    } catch (error) {
      return {
        ok: false,
        reason: error instanceof Error ? error.message : "Unknown error",
        hint: "Check network connectivity to Voyage AI"
      };
    }
  }

  /**
   * General-purpose embedding (documents)
   */
  async embed(texts: string[]): Promise<Embedding[]> {
    return this.embedWithType(texts, "document");
  }

  /**
   * Code-optimized embedding
   * Use voyage-code-3 model for best results
   */
  async embedCode(texts: string[]): Promise<Embedding[]> {
    const isCodeModel = CODE_MODELS.includes(this.model);
    
    if (!isCodeModel) {
      console.warn(
        `⚠️  Using ${this.model} for code. Consider 'voyage-code-3' for better code understanding.`
      );
    }
    
    return this.embedWithType(texts, "document");
  }

  /**
   * Query-optimized embedding
   * For asymmetric search (query vs document)
   */
  async embedQuery(text: string): Promise<Embedding> {
    const [embedding] = await this.embedWithType([text], "query");
    return embedding;
  }

  /**
   * Core embedding method with input_type specification
   */
  private async embedWithType(
    texts: string[],
    inputType: InputType
  ): Promise<Embedding[]> {
    const response = await fetch(`${this.baseUrl}/embeddings`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${this.apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: this.model,
        input: texts,
        input_type: inputType,
        output_dimension: this.dimensions
      })
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Voyage embedding failed: ${error}`);
    }

    const data = await response.json() as {
      data: Array<{ embedding: number[] }>;
    };

    return data.data.map((item) => item.embedding);
  }
}
