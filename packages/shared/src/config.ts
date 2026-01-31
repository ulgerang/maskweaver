import type { LogLevel } from "./types.js";

/**
 * Memory provider types
 */
export type MemoryProviderType = "ollama" | "openai" | "voyage" | "openrouter" | "text-only";

/**
 * Verify mode
 */
export type VerifyMode = "auto" | "manual" | "off";

/**
 * Reviewer types for verification
 */
export type ReviewerType = "dummy-flash" | "dummy-human" | "dummy-premium";

/**
 * Retrospect depth levels
 */
export type RetrospectDepth = "quick" | "standard" | "deep";

/**
 * Configuration for the Context feature (always enabled)
 */
export interface ContextConfig {
  enabled: true;
}

/**
 * Configuration for the Memory feature
 */
export interface MemoryConfig {
  enabled: boolean;
  provider: MemoryProviderType;
}

/**
 * Configuration for the Retrospect feature
 */
export interface RetrospectConfig {
  enabled: boolean;
}

/**
 * Configuration for the Verify feature
 */
export interface VerifyConfig {
  enabled: boolean;
}

/**
 * Feature configuration map
 */
export interface FeaturesConfig {
  /** Context is always enabled */
  context: ContextConfig;
  /** Memory is optional */
  memory?: MemoryConfig;
  /** Retrospect is optional */
  retrospect?: RetrospectConfig;
  /** Verify is optional */
  verify?: VerifyConfig;
}

/**
 * Memory provider-specific configurations
 */
export interface MemoryProviderConfigs {
  provider: MemoryProviderType;
  
  vectorStore?: {
    type: "sqlite";
    path?: string;
  };
  
  ollama?: {
    host?: string;
    model?: string;
  };
  
  openai?: {
    apiKey?: string;
    model?: string;
    dimensions?: number;
  };
  
  voyage?: {
    apiKey?: string;
    model?: string;
    dimensions?: number;
  };
  
  openrouter?: {
    apiKey?: string;
    model?: string;
  };
  
  hybridSearch?: {
    enabled: boolean;
    vectorWeight: number;
    keywordWeight: number;
  };
}

/**
 * Verification configuration
 */
export interface VerifyConfigOptions {
  mode: VerifyMode;
  reviewer: ReviewerType;
  
  escalation?: {
    onFailure: "dummy-human" | "dummy-premium";
  };
  
  budget?: {
    maxPerSessionUSD: number;
    maxPerCheckUSD: number;
  };
  
  triggers?: {
    onWrite?: boolean;
    onTestFail?: boolean;
  };
}

/**
 * Logging configuration
 */
export interface LoggingConfig {
  level: LogLevel;
}

/**
 * Main Maskweaver configuration
 */
export interface MaskweaverConfig {
  /** Feature toggles */
  features: FeaturesConfig;
  
  /** Memory system configuration */
  memory?: MemoryProviderConfigs;
  
  /** Verification system configuration */
  verify?: VerifyConfigOptions;
  
  /** Logging configuration */
  logging?: LoggingConfig;
}

/**
 * Default configuration
 */
export const DEFAULT_CONFIG: MaskweaverConfig = {
  features: {
    context: { enabled: true },
  },
  logging: {
    level: "info",
  },
};
