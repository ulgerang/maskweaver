/**
 * Maskweaver Plugin Configuration Loader
 * 
 * Loads maskweaver.json(c) configuration files with support for:
 * - Project-level configuration (.opencode/maskweaver.json)
 * - Global configuration (~/.config/opencode/maskweaver.json)
 * - JSONC format (comments, trailing commas)
 * 
 * Based on oh-my-opencode pattern for plugin configuration management.
 */

import { parse as parseJsonc } from 'jsonc-parser';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';

/**
 * Logger interface for config loading
 */
interface ConfigLoaderContext {
  client: {
    app: {
      log(entry: { service: string; level: string; message: string }): void;
    };
  };
  verbose?: boolean;
}

// ============================================================================
// Configuration Schema
// ============================================================================

/**
 * Agent override configuration
 */
export interface AgentOverride {
  model?: string;
  systemPrompt?: string;
}

/**
 * Mask-specific configuration
 */
export interface MaskConfig {
  /** Default mask ID to activate on session start */
  default?: string;
  /** Automatically activate default mask on session start */
  autoActivate?: boolean;
}

/**
 * Logging configuration
 */
export interface LoggingConfig {
  /** Enable verbose logging */
  verbose?: boolean;
}

/**
 * Maskweaver Plugin Configuration
 */
export interface MaskweaverPluginConfig {
  /** JSON Schema reference (for IDE support) */
  $schema?: string;
  
  /** List of disabled mask IDs */
  disabled_masks?: string[];
  
  /** List of disabled tool names */
  disabled_tools?: string[];
  
  /** Agent overrides (model, system prompt) */
  agents?: Record<string, AgentOverride>;
  
  /** Mask configuration */
  masks?: MaskConfig;
  
  /** Logging configuration */
  logging?: LoggingConfig;
}

// ============================================================================
// Configuration Loader
// ============================================================================

/**
 * Get all possible configuration file locations in priority order
 * 
 * Priority:
 * 1. .opencode/maskweaver.json (project)
 * 2. .opencode/maskweaver.jsonc (project)
 * 3. ~/.config/opencode/maskweaver.json (global)
 * 4. ~/.config/opencode/maskweaver.jsonc (global)
 */
function getConfigLocations(directory: string): string[] {
  const homeDir = os.homedir();
  
  return [
    // Project-level configurations (highest priority)
    path.join(directory, '.opencode', 'maskweaver.json'),
    path.join(directory, '.opencode', 'maskweaver.jsonc'),
    
    // Global configurations
    path.join(homeDir, '.config', 'opencode', 'maskweaver.json'),
    path.join(homeDir, '.config', 'opencode', 'maskweaver.jsonc'),
  ];
}

/**
 * Parse JSONC content (JSON with comments and trailing commas)
 */
function parseJsoncContent(content: string): MaskweaverPluginConfig {
  try {
    // Use jsonc-parser for robust JSONC parsing
    return parseJsonc(content) as MaskweaverPluginConfig;
  } catch (error) {
    throw new Error(`Failed to parse JSONC: ${error}`);
  }
}

/**
 * Load plugin configuration from directory
 * 
 * Searches for configuration files in priority order and returns
 * the first found configuration. Returns empty object if no config found.
 * 
 * @param directory - Project directory to search for config
 * @param ctx - Optional plugin context (for logging)
 * @returns Parsed configuration object
 */
export function loadPluginConfig(
  directory: string,
  ctx?: ConfigLoaderContext
): MaskweaverPluginConfig {
  const locations = getConfigLocations(directory);
  
  for (const location of locations) {
    if (fs.existsSync(location)) {
      try {
        const content = fs.readFileSync(location, 'utf-8');
        const config = parseJsoncContent(content);
        
        // Log successful config load
        if (ctx?.verbose) {
          ctx.client.app.log({
            service: 'maskweaver',
            level: 'info',
            message: `Loaded config from: ${location}`,
          });
        }
        
        return config;
      } catch (error) {
        // Log error but continue searching
        if (ctx) {
          ctx.client.app.log({
            service: 'maskweaver',
            level: 'warn',
            message: `Failed to load config from ${location}: ${error}`,
          });
        }
      }
    }
  }
  
  // No configuration found - return empty config
  if (ctx?.verbose) {
    ctx.client.app.log({
      service: 'maskweaver',
      level: 'info',
      message: 'No maskweaver.json found, using defaults',
    });
  }
  
  return {};
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Check if a tool is enabled in the configuration
 * 
 * A tool is considered enabled if:
 * - No disabled_tools list exists, OR
 * - disabled_tools list exists but doesn't include the tool name
 * 
 * @param config - Plugin configuration
 * @param toolName - Name of the tool to check
 * @returns true if tool is enabled, false otherwise
 */
export function isToolEnabled(
  config: MaskweaverPluginConfig,
  toolName: string
): boolean {
  if (!config.disabled_tools || config.disabled_tools.length === 0) {
    return true;
  }
  
  return !config.disabled_tools.includes(toolName);
}

/**
 * Check if a mask is enabled in the configuration
 * 
 * A mask is considered enabled if:
 * - No disabled_masks list exists, OR
 * - disabled_masks list exists but doesn't include the mask ID
 * 
 * @param config - Plugin configuration
 * @param maskId - ID of the mask to check
 * @returns true if mask is enabled, false otherwise
 */
export function isMaskEnabled(
  config: MaskweaverPluginConfig,
  maskId: string
): boolean {
  if (!config.disabled_masks || config.disabled_masks.length === 0) {
    return true;
  }
  
  return !config.disabled_masks.includes(maskId);
}

/**
 * Get the default mask ID from configuration
 * 
 * @param config - Plugin configuration
 * @returns Default mask ID if configured, undefined otherwise
 */
export function getDefaultMask(config: MaskweaverPluginConfig): string | undefined {
  return config.masks?.default;
}

/**
 * Check if auto-activation is enabled for the default mask
 * 
 * @param config - Plugin configuration
 * @returns true if auto-activation is enabled, false otherwise
 */
export function isAutoActivateEnabled(config: MaskweaverPluginConfig): boolean {
  return config.masks?.autoActivate ?? false;
}

/**
 * Get agent override for a specific agent
 * 
 * @param config - Plugin configuration
 * @param agentName - Name of the agent
 * @returns Agent override config if exists, undefined otherwise
 */
export function getAgentOverride(
  config: MaskweaverPluginConfig,
  agentName: string
): AgentOverride | undefined {
  return config.agents?.[agentName];
}

/**
 * Check if verbose logging is enabled
 * 
 * @param config - Plugin configuration
 * @returns true if verbose logging is enabled, false otherwise
 */
export function isVerboseLoggingEnabled(config: MaskweaverPluginConfig): boolean {
  return config.logging?.verbose ?? false;
}

// ============================================================================
// Configuration Validation
// ============================================================================

/**
 * Validate configuration structure
 * 
 * @param config - Configuration to validate
 * @returns Array of validation error messages (empty if valid)
 */
export function validateConfig(config: MaskweaverPluginConfig): string[] {
  const errors: string[] = [];
  
  // Validate disabled_masks
  if (config.disabled_masks && !Array.isArray(config.disabled_masks)) {
    errors.push('disabled_masks must be an array of strings');
  }
  
  // Validate disabled_tools
  if (config.disabled_tools && !Array.isArray(config.disabled_tools)) {
    errors.push('disabled_tools must be an array of strings');
  }
  
  // Validate agents
  if (config.agents && typeof config.agents !== 'object') {
    errors.push('agents must be an object');
  }
  
  // Validate masks config
  if (config.masks) {
    if (typeof config.masks !== 'object') {
      errors.push('masks must be an object');
    } else {
      if (config.masks.default && typeof config.masks.default !== 'string') {
        errors.push('masks.default must be a string');
      }
      if (config.masks.autoActivate !== undefined && typeof config.masks.autoActivate !== 'boolean') {
        errors.push('masks.autoActivate must be a boolean');
      }
    }
  }
  
  // Validate logging
  if (config.logging) {
    if (typeof config.logging !== 'object') {
      errors.push('logging must be an object');
    } else {
      if (config.logging.verbose !== undefined && typeof config.logging.verbose !== 'boolean') {
        errors.push('logging.verbose must be a boolean');
      }
    }
  }
  
  return errors;
}

// ============================================================================
// Export default for convenience
// ============================================================================

export default {
  loadPluginConfig,
  isToolEnabled,
  isMaskEnabled,
  getDefaultMask,
  isAutoActivateEnabled,
  getAgentOverride,
  isVerboseLoggingEnabled,
  validateConfig,
};
