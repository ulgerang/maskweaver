/**
 * @maskweaver/shared
 * 
 * Common types, errors, and configuration for Maskweaver
 */

// Types
export type {
  Result,
  HealthCheckResult,
  LogLevel,
  FeatureStatus,
} from "./types.js";

// Errors
export {
  MaskweaverError,
  ConfigError,
  ProviderError,
  StorageError,
  ValidationError,
} from "./errors.js";

// Configuration
export type {
  MemoryProviderType,
  VerifyMode,
  ReviewerType,
  RetrospectDepth,
  ContextConfig,
  MemoryConfig,
  RetrospectConfig,
  VerifyConfig,
  FeaturesConfig,
  MemoryProviderConfigs,
  VerifyConfigOptions,
  LoggingConfig,
  MaskweaverConfig,
} from "./config.js";

export { DEFAULT_CONFIG } from "./config.js";

// Image normalization (LLM Vision API compatibility)
export type {
  ImageNormalizeOptions,
  NormalizedImage,
  ImageInfo,
} from "./image.js";

export {
  normalizeImage,
  normalizeImageToFile,
  getImageInfo,
  isSupported,
  needsConversion,
  isLLMCompatible,
  createImageDataUrl,
} from "./image.js";

// Agent generation from pool config
export {
  generatePoolAgentFiles,
  generatePoolAgentFilesFromConfig,
  writeDefaultRuntimeConfig,
  writeDefaultPluginConfig,
  findUserGlobalConfig,
  DEFAULT_RUNTIME_CONFIG_TEMPLATE,
  DEFAULT_PLUGIN_CONFIG_TEMPLATE,
} from "./generate-agents.js";
export type {
  GenerateAgentsResult,
  GenerateAgentsOptions,
} from "./generate-agents.js";
