/**
 * Embedding Providers Module
 * 
 * Clean public API following the Dependency Inversion Principle.
 * Clients depend on abstractions (IEmbeddingProvider), not implementations.
 * 
 * @example Basic usage
 * ```typescript
 * import { createProvider } from "./providers";
 * 
 * const provider = createProvider({
 *   type: "voyage",
 *   model: "voyage-code-3"
 * });
 * 
 * const embeddings = await provider.embed(["hello world"]);
 * ```
 * 
 * @example Auto-selection with graceful degradation
 * ```typescript
 * import { selectBestProvider, getDefaultConfigs } from "./providers";
 * 
 * const provider = await selectBestProvider(getDefaultConfigs());
 * // Will try providers in order and fallback to text-only if needed
 * ```
 */

// Core abstractions
export type {
  Embedding,
  ProviderType,
  HealthCheckResult,
  ProviderConfig,
  IEmbeddingProvider
} from "./types.js";

// Concrete implementations (export for advanced use cases)
export { OllamaProvider } from "./ollama.js";
export { OpenAIProvider } from "./openai.js";
export { VoyageProvider } from "./voyage.js";
export { OpenRouterProvider } from "./openrouter.js";
export { TextOnlyProvider } from "./text-only.js";

// Factory functions (recommended API)
export {
  createProvider,
  selectBestProvider,
  getDefaultConfigs
} from "./factory.js";
