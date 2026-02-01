/**
 * Provider Factory with Graceful Degradation
 * 
 * "Make the right things easy and the wrong things hard."
 * 
 * This factory implements:
 * 1. Strategy Pattern - swappable providers
 * 2. Factory Pattern - centralized creation
 * 3. Graceful Degradation - automatic fallback to working providers
 */

import type { IEmbeddingProvider, ProviderConfig } from "./types.js";
import { OllamaProvider } from "./ollama.js";
import { OpenAIProvider } from "./openai.js";
import { VoyageProvider } from "./voyage.js";
import { OpenRouterProvider } from "./openrouter.js";
import { TextOnlyProvider } from "./text-only.js";

/**
 * Create a provider from configuration
 * 
 * @throws Error if provider type is invalid or required credentials are missing
 */
export function createProvider(config: ProviderConfig): IEmbeddingProvider {
  switch (config.type) {
    case "ollama":
      return new OllamaProvider(config);
    
    case "openai":
      return new OpenAIProvider(config);
    
    case "voyage":
      return new VoyageProvider(config);
    
    case "openrouter":
      return new OpenRouterProvider(config);
    
    case "text-only":
      return new TextOnlyProvider(config);
    
    default:
      throw new Error(`Unknown provider type: ${(config as ProviderConfig).type}`);
  }
}

/**
 * Select the best working provider from a list
 * 
 * Implements graceful degradation:
 * - Tries each provider in order
 * - Returns first healthy provider
 * - Falls back to text-only if all fail
 * 
 * @param configs - Array of provider configurations in priority order
 * @returns The first healthy provider or text-only fallback
 * 
 * @example
 * ```typescript
 * const provider = await selectBestProvider([
 *   { type: "voyage", model: "voyage-code-3" },
 *   { type: "ollama" },
 *   { type: "openai" }
 * ]);
 * ```
 */
export async function selectBestProvider(
  configs: ProviderConfig[]
): Promise<IEmbeddingProvider> {
  const results: Array<{
    provider: IEmbeddingProvider;
    health: Awaited<ReturnType<IEmbeddingProvider["healthCheck"]>>;
  }> = [];

  // Try each provider
  for (const config of configs) {
    try {
      const provider = createProvider(config);
      const health = await provider.healthCheck();
      
      results.push({ provider, health });
      
      if (health.ok) {
        console.log(`✓ Selected provider: ${provider.name}`);
        return provider;
      }
      
      console.warn(
        `✗ ${provider.name} unavailable: ${health.reason}${
          health.hint ? `\n  Hint: ${health.hint}` : ""
        }`
      );
    } catch (error) {
      console.warn(
        `✗ Failed to initialize ${config.type}:`,
        error instanceof Error ? error.message : error
      );
    }
  }

  // Fallback to text-only
  console.warn("⚠️  All embedding providers failed. Falling back to text-only mode.");
  console.warn("   Semantic search will be limited to keyword matching.");
  
  return new TextOnlyProvider({ type: "text-only" });
}

/**
 * Get default provider configurations
 * 
 * Priority order:
 * 1. Voyage (code-specialized)
 * 2. Ollama (local, free)
 * 3. OpenAI (reliable)
 * 4. OpenRouter (fallback)
 */
export function getDefaultConfigs(): ProviderConfig[] {
  return [
    {
      type: "voyage",
      model: "voyage-code-3",
      dimensions: 1024
    },
    {
      type: "ollama",
      model: "nomic-embed-text"
    },
    {
      type: "openai",
      model: "text-embedding-3-small",
      dimensions: 1536
    },
    {
      type: "openrouter",
      model: "openai/text-embedding-3-small"
    }
  ];
}
