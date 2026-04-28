import type { LogLevel } from "./types.js";
import * as fs from "node:fs";
import * as os from "node:os";
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
 * Runtime GDC integration configuration from maskweaver.config.json
 */
export interface RuntimeGdcConfig {
  enabled?: boolean | 'auto';
  strictVerify?: boolean;
  binPath?: string;
  autoSyncOnPrepare?: boolean;
  extractContext?: {
    withImpl?: boolean;
    withTests?: boolean;
    withCallers?: boolean;
  };
}

export interface RuntimeOperatorConfig {
  model: string;
  maxConcurrent?: number;
  description?: string;
}

export interface RuntimeConfig {
  dummyHumans?: DummyHumansConfig;
  operator?: RuntimeOperatorConfig;
  memory?: RuntimeMemoryConfig;
  gdc?: RuntimeGdcConfig;
  language?: string;
}

// ============================================================================
// Model Pool Types (for dummyHumans.pool)
// ============================================================================

/** Cost tier for budget-aware scheduling */
export type ModelCostTier = 'low' | 'medium' | 'high';

/** Agent tier mapping */
export type ModelTier = 'flash' | 'human' | 'premium';

/** Known capability tags for task-model matching */
export type ModelCapability =
  | 'search' | 'formatting' | 'simple-coding' | 'file-ops'
  | 'coding' | 'testing' | 'refactoring'
  | 'architecture' | 'debugging' | 'reasoning' | 'complex-coding'
  | 'frontend' | 'backend' | 'database' | 'devops' | 'ml'
  | string; // extensible

/**
 * A single model entry in the pool.
 * Each entry represents one AI model subscription the user has access to.
 */
export interface ModelPoolEntry {
  /** Unique identifier for this model slot (e.g., "gemini-flash", "claude-opus") */
  id: string;
  /** Full model name as used by the provider (e.g., "google/antigravity-gemini-3-flash") */
  model: string;
  /** Which agent tier this model maps to */
  tier: ModelTier;
  /** Maximum concurrent uses allowed (API/subscription limit) */
  maxConcurrent: number;
  /** Task capabilities this model excels at */
  capabilities: ModelCapability[];
  /** Cost tier for budget-aware scheduling */
  costTier: ModelCostTier;
  /** Human-readable description */
  description?: string;
}

/**
 * DummyHumans configuration.
 * Supports two formats:
 * - Legacy: Record<string, string> mapping tier names to model IDs
 * - Pool:   { pool: ModelPoolEntry[] } with detailed model definitions
 */
export type DummyHumansConfig =
  | Record<string, string>                   // Legacy format
  | { pool: ModelPoolEntry[] };              // Pool format

/** Type guard for pool format */
export function isPoolConfig(config: DummyHumansConfig): config is { pool: ModelPoolEntry[] } {
  return 'pool' in config && Array.isArray((config as any).pool);
}

/**
 * Normalize legacy config to pool entries.
 * Converts { flash: "model-a", human: "model-b", premium: "model-c" }
 * into ModelPoolEntry[] with sensible defaults.
 */
export function normalizeDummyHumansConfig(config: DummyHumansConfig): ModelPoolEntry[] {
  // Defensive guard: if called with null/undefined at runtime, return empty
  if (!config || typeof config !== 'object') {
    return [];
  }

  if (isPoolConfig(config)) {
    return config.pool;
  }

  // Legacy format → convert to pool entries
  const tierDefaults: Record<string, { tier: ModelTier; costTier: ModelCostTier; maxConcurrent: number; capabilities: ModelCapability[] }> = {
    flash:   { tier: 'flash',   costTier: 'low',    maxConcurrent: 5, capabilities: ['search', 'formatting', 'simple-coding', 'file-ops'] },
    human:   { tier: 'human',   costTier: 'medium', maxConcurrent: 2, capabilities: ['coding', 'testing', 'refactoring'] },
    premium: { tier: 'premium', costTier: 'high',   maxConcurrent: 1, capabilities: ['architecture', 'debugging', 'reasoning', 'complex-coding'] },
  };

  const entries: ModelPoolEntry[] = [];
  for (const [key, model] of Object.entries(config)) {
    const defaults = tierDefaults[key] ?? { tier: 'human' as ModelTier, costTier: 'medium' as ModelCostTier, maxConcurrent: 2, capabilities: ['coding'] };
    entries.push({
      id: key,
      model,
      ...defaults,
    });
  }
  return entries;
}

/**
 * Runtime configuration from maskweaver.config.json
 */
export interface RuntimeConfig {
  dummyHumans?: DummyHumansConfig;
  memory?: RuntimeMemoryConfig;
  gdc?: RuntimeGdcConfig;
  language?: string;
}

let cachedRuntimeConfig: RuntimeConfig | null = null;
let cachedConfigPath: string | null = null;

/**
 * Load maskweaver.config.json from project root or global config
 * 
 * Searches in order:
 * 1. {basePath}/maskweaver.config.json
 * 2. {basePath}/.opencode/maskweaver.config.json
 * 3. ~/.config/opencode/maskweaver.config.json (global fallback)
 */
export function loadRuntimeConfig(basePath: string = process.cwd()): RuntimeConfig {
  // Return cached config if same path
  if (cachedRuntimeConfig && cachedConfigPath === basePath) {
    return cachedRuntimeConfig;
  }
  
  const locations = [
    path.join(basePath, "maskweaver.config.json"),
    path.join(basePath, ".opencode", "maskweaver.config.json"),
    path.join(os.homedir(), ".config", "opencode", "maskweaver.config.json"),
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
 * Get GDC integration configuration from runtime config
 */
export function getGdcConfig(basePath: string = process.cwd()): RuntimeGdcConfig | undefined {
  const config = loadRuntimeConfig(basePath);
  return config.gdc;
}

/**
 * Get operator model configuration from runtime config
 */
export function getOperatorConfig(basePath: string = process.cwd()): RuntimeOperatorConfig | undefined {
  const config = loadRuntimeConfig(basePath);
  return config.operator;
}

/**
 * Clear cached runtime config (for testing)
 */
export function clearRuntimeConfigCache(): void {
  cachedRuntimeConfig = null;
  cachedConfigPath = null;
}
