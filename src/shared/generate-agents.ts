/**
 * Generate Agent Files from Pool Configuration
 * 
 * Shared utility to create/update dummy-human agent .md files from
 * maskweaver.config.json pool entries. Used by both:
 * - Plugin startup (auto-generate if not exists)
 * - `weave sync-agents` command (force overwrite from user config)
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import type { ModelPoolEntry } from './config.js';
import { loadRuntimeConfig, normalizeDummyHumansConfig } from './config.js';

// ============================================================================
// Types
// ============================================================================

export interface GenerateAgentsResult {
  /** Files that were created (did not exist before) */
  created: string[];
  /** Files that were updated (existed and were overwritten) */
  updated: string[];
  /** Files that were skipped (existed and force was false) */
  skipped: string[];
  /** Error messages */
  errors: string[];
}

export interface GenerateAgentsOptions {
  /** Force overwrite existing files (default: false) */
  force?: boolean;
  /** Base project directory */
  projectDir?: string;
  /** Custom agents output directory (default: {projectDir}/.opencode/agents) */
  agentsDir?: string;
  /** Custom pool entries (if not provided, reads from config) */
  pool?: ModelPoolEntry[];
}

// ============================================================================
// Agent File Template
// ============================================================================

/**
 * Generate the content for a dummy-human agent .md file
 */
function buildAgentFileContent(entry: ModelPoolEntry): string {
  const lines: string[] = [
    '---',
    `description: "Dummy-Human (${entry.id}) - ${entry.description || 'Auto-generated from maskweaver.config.json pool'}"`,
    `model: ${entry.model}`,
    'mode: subagent',
    'temperature: 0.2',
    'permission:',
    '  edit: allow',
    '  bash: allow',
    '  webfetch: allow',
    '---',
    '',
    'Faithfully executes instructions from Mask Weaver.',
    '',
  ];
  return lines.join('\n');
}

// ============================================================================
// Agent File Generation
// ============================================================================

/**
 * Generate agent files from a ModelPoolEntry array.
 * 
 * @param pool - Array of model pool entries
 * @param agentsDir - Output directory for agent .md files
 * @param options - Force overwrite option
 * @returns Result summary
 */
export function generatePoolAgentFiles(
  pool: ModelPoolEntry[],
  agentsDir: string,
  options: { force?: boolean } = {}
): GenerateAgentsResult {
  const result: GenerateAgentsResult = {
    created: [],
    updated: [],
    skipped: [],
    errors: [],
  };

  if (!pool || pool.length === 0) {
    result.errors.push('Pool is empty or undefined. No agents to generate.');
    return result;
  }

  // Ensure agents directory exists
  if (!fs.existsSync(agentsDir)) {
    try {
      fs.mkdirSync(agentsDir, { recursive: true });
    } catch (e) {
      result.errors.push(`Failed to create agents directory "${agentsDir}": ${e}`);
      return result;
    }
  }

  for (const entry of pool) {
    const agentName = `dummy-${entry.id}`;
    const agentPath = path.join(agentsDir, `${agentName}.md`);

    const exists = fs.existsSync(agentPath);
    if (exists && !options.force) {
      result.skipped.push(agentPath);
      continue;
    }

    // Validate: model must not be empty
    if (!entry.model || entry.model.trim() === '') {
      result.errors.push(`Entry "${entry.id}" has no model configured. Skipping.`);
      continue;
    }

    const content = buildAgentFileContent(entry);

    try {
      fs.writeFileSync(agentPath, content, 'utf-8');
      if (exists) {
        result.updated.push(agentPath);
      } else {
        result.created.push(agentPath);
      }
    } catch (e) {
      result.errors.push(`Failed to write ${agentName}.md: ${e}`);
    }
  }

  return result;
}

// ============================================================================
// Config-Based Agent Generation
// ============================================================================

/**
 * Read maskweaver.config.json (project or global) and generate agent files.
 * 
 * Search order:
 * 1. {projectDir}/maskweaver.config.json
 * 2. {projectDir}/.opencode/maskweaver.config.json
 * 3. ~/.config/opencode/maskweaver.config.json (user global)
 * 
 * @param projectDir - Project base directory
 * @param agentsDir - Output directory for agent .md files
 * @param options - Force overwrite and other options
 * @returns Result summary
 */
export function generatePoolAgentFilesFromConfig(
  projectDir: string,
  agentsDir: string,
  options: { force?: boolean } = {}
): GenerateAgentsResult {
  // Try project config first
  const projectConfig = loadRuntimeConfig(projectDir);
  if (projectConfig.dummyHumans) {
    const pool = normalizeDummyHumansConfig(projectConfig.dummyHumans);
    if (pool.length > 0) {
      return generatePoolAgentFiles(pool, agentsDir, options);
    }
  }

  // Try user global config (~/.config/opencode/maskweaver.config.json)
  const homeDir = os.homedir();
  const globalConfigPath = path.join(homeDir, '.config', 'opencode', 'maskweaver.config.json');
  
  if (fs.existsSync(globalConfigPath)) {
    try {
      const content = fs.readFileSync(globalConfigPath, 'utf-8');
      const parsed = JSON.parse(content);
      if (parsed.dummyHumans) {
        const pool = normalizeDummyHumansConfig(parsed.dummyHumans);
        if (pool.length > 0) {
          return generatePoolAgentFiles(pool, agentsDir, options);
        }
      }
    } catch (e) {
      return { created: [], updated: [], skipped: [], errors: [`Failed to parse global config: ${e}`] };
    }
  }

  return {
    created: [],
    updated: [],
    skipped: [],
    errors: ['No maskweaver.config.json found with dummyHumans configuration. Create one or run `weave init-config` to generate a default.'],
  };
}

// ============================================================================
// Default Config File Creator
// ============================================================================

/**
 * Default runtime config template (maskweaver.config.json).
 * 
 * This is a minimal template with the standard tier entries but WITHOUT
 * model names — users must fill in their actual model IDs.
 */
export const DEFAULT_RUNTIME_CONFIG_TEMPLATE = {
  dummyHumans: {
    pool: [
      {
        id: 'deepseek-flash',
        model: 'opencode-go/deepseek-v4-flash',
        tier: 'flash',
        maxConcurrent: 5,
        capabilities: ['search', 'formatting', 'simple-coding', 'file-ops'],
        costTier: 'low',
        description: 'DeepSeek V4 Flash - 빠름. 단순 검색/포매팅/파일작업',
      },
      {
        id: 'deepseek-general',
        model: 'opencode-go/deepseek-v4-flash',
        tier: 'human',
        maxConcurrent: 3,
        capabilities: ['coding', 'testing', 'refactoring', 'backend'],
        costTier: 'medium',
        description: 'DeepSeek V4 Flash - 일반. 코딩/리팩토링/백엔드',
      },
      {
        id: 'qwen-vision',
        model: 'opencode-go/qwen3.6-plus',
        tier: 'human',
        maxConcurrent: 3,
        capabilities: ['vision', 'frontend', 'testing'],
        costTier: 'medium',
        description: 'Qwen 3.6 Plus - 비전. 이미지 분석/프론트엔드/테스트',
      },
      {
        id: 'deepseek-pro',
        model: 'opencode-go/deepseek-v4-pro',
        tier: 'premium',
        maxConcurrent: 2,
        capabilities: ['architecture', 'debugging', 'reasoning', 'complex-coding', 'refactoring'],
        costTier: 'high',
        description: 'DeepSeek V4 Pro - 고급 추론. 아키텍처/복잡 디버깅',
      },
      {
        id: 'kimi-vision',
        model: 'opencode-go/kimi-k2.6',
        tier: 'premium',
        maxConcurrent: 2,
        capabilities: ['vision', 'reasoning', 'complex-coding', 'architecture', 'debugging'],
        costTier: 'high',
        description: 'Kimi K2.6 - 비전 고급. 이미지 분석/복잡 추론',
      },
    ],
  },
  memory: {
    provider: 'text-only',
    enabled: false,
  },
  gdc: {
    enabled: 'auto',
    strictVerify: false,
    autoSyncOnPrepare: true,
  },
  language: 'ko',
} as const;

/**
 * Default plugin config template (.opencode/maskweaver.json).
 */
export const DEFAULT_PLUGIN_CONFIG_TEMPLATE = {
  $schema: 'https://raw.githubusercontent.com/ulgerang/maskweaver/master/schemas/plugin-config.json',
  masks: {
    autoActivate: false,
  },
  logging: {
    verbose: false,
  },
  notifications: {
    completionSound: {
      enabled: false,
    },
  },
};

/**
 * Write a default maskweaver.config.json to the project directory.
 * Does NOT overwrite if the file already exists.
 * 
 * @param projectDir - Project base directory
 * @returns The path to the created file, or null if it already existed
 */
export function writeDefaultRuntimeConfig(projectDir: string): string | null {
  const targetPath = path.join(projectDir, 'maskweaver.config.json');

  if (fs.existsSync(targetPath)) {
    return null; // Already exists, don't overwrite
  }

  try {
    fs.writeFileSync(
      targetPath,
      JSON.stringify(DEFAULT_RUNTIME_CONFIG_TEMPLATE, null, 2) + '\n',
      'utf-8'
    );
    return targetPath;
  } catch {
    return null;
  }
}

/**
 * Write a default .opencode/maskweaver.json (plugin config) to the project.
 * Does NOT overwrite if the file already exists.
 * 
 * @param projectDir - Project base directory
 * @returns The path to the created file, or null if it already existed
 */
export function writeDefaultPluginConfig(projectDir: string): string | null {
  const opencodeDir = path.join(projectDir, '.opencode');
  const targetPath = path.join(opencodeDir, 'maskweaver.json');

  if (fs.existsSync(targetPath)) {
    return null; // Already exists, don't overwrite
  }

  // Ensure .opencode directory exists
  if (!fs.existsSync(opencodeDir)) {
    try {
      fs.mkdirSync(opencodeDir, { recursive: true });
    } catch {
      return null;
    }
  }

  try {
    fs.writeFileSync(
      targetPath,
      JSON.stringify(DEFAULT_PLUGIN_CONFIG_TEMPLATE, null, 2) + '\n',
      'utf-8'
    );
    return targetPath;
  } catch {
    return null;
  }
}

// ============================================================================
// User Config Detection
// ============================================================================

/**
 * Check if a user-level config exists at ~/.config/opencode/ and return it.
 * 
 * Search order:
 * 1. ~/.config/opencode/maskweaver.config.json
 * 2. ~/.config/opencode/maskweaver.json (plugin config with agents)
 * 
 * @returns The config path if found, or null
 */
export function findUserGlobalConfig(): string | null {
  const homeDir = os.homedir();
  const candidates = [
    path.join(homeDir, '.config', 'opencode', 'maskweaver.config.json'),
    path.join(homeDir, '.config', 'opencode', 'maskweaver.json'),
  ];

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }

  return null;
}
