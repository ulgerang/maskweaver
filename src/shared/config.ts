import type { LogLevel } from "./types.js";
import * as fs from "node:fs";
import * as path from "node:path";

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

// ============================================================================
// Runtime Configuration (maskweaver.config.json)
// ============================================================================

/**
 * Runtime memory configuration from maskweaver.config.json
 */
export interface RuntimeMemoryConfig {
  provider: MemoryProviderType;
  model?: string;
  dimensions?: number;
  enabled?: boolean;
  baseUrl?: string;
}

/**
 * Runtime configuration from maskweaver.config.json
 */
export interface RuntimeConfig {
  dummyHumans?: Record<string, string>;
  memory?: RuntimeMemoryConfig;
  language?: string;
}

let cachedRuntimeConfig: RuntimeConfig | null = null;
let cachedConfigPath: string | null = null;

/**
 * Load maskweaver.config.json from project root
 * 
 * Searches in order:
 * 1. {basePath}/maskweaver.config.json
 * 2. {basePath}/.opencode/maskweaver.config.json
 */
export function loadRuntimeConfig(basePath: string = process.cwd()): RuntimeConfig {
  // Return cached config if same path
  if (cachedRuntimeConfig && cachedConfigPath === basePath) {
    return cachedRuntimeConfig;
  }
  
  const locations = [
    path.join(basePath, "maskweaver.config.json"),
    path.join(basePath, ".opencode", "maskweaver.config.json"),
  ];
  
  for (const location of locations) {
    if (fs.existsSync(location)) {
      try {
        const content = fs.readFileSync(location, "utf-8");
        const config = JSON.parse(content) as RuntimeConfig;
        
        cachedRuntimeConfig = config;
        cachedConfigPath = basePath;
        
        return config;
      } catch (error) {
        console.warn(`Failed to parse ${location}: ${error}`);
      }
    }
  }
  
  // Return empty config if not found
  cachedRuntimeConfig = {};
  cachedConfigPath = basePath;
  
  return {};
}

/**
 * Get memory provider configuration from runtime config
 */
export function getMemoryProviderConfig(basePath: string = process.cwd()): RuntimeMemoryConfig | undefined {
  const config = loadRuntimeConfig(basePath);
  return config.memory;
}

/**
 * Clear cached runtime config (for testing)
 */
export function clearRuntimeConfigCache(): void {
  cachedRuntimeConfig = null;
  cachedConfigPath = null;
}
