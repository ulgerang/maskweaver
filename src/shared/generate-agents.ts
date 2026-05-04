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
// Subscription Detection & Auto-Config
// ============================================================================

import { spawnSync } from 'node:child_process';

export type DetectedSubscription = 'opencode-go' | 'zai-coding-plan';

export interface SubscriptionDetectionResult {
    subscriptions: DetectedSubscription[];
    primary: DetectedSubscription;
    evidence: string[];
    allProviders: ProviderInfo[];
}

export interface ProviderInfo {
    name: string;
    subscription: DetectedSubscription | null;
    authType: string;
    active: boolean;
}

function readOpencodeConfig(basePath: string): Record<string, any> | null {
    const candidates = [
        path.join(basePath, 'opencode.json'),
        path.join(basePath, 'opencode.jsonc'),
        path.join(os.homedir(), '.config', 'opencode', 'opencode.json'),
        path.join(os.homedir(), '.config', 'opencode', 'opencode.jsonc'),
    ];

    for (const candidate of candidates) {
        if (!fs.existsSync(candidate)) continue;
        try {
            let content = fs.readFileSync(candidate, 'utf-8');
            content = content.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
            const parsed = JSON.parse(content);
            if (parsed && typeof parsed === 'object') return parsed;
        } catch { continue; }
    }

    return null;
}

function runCli(command: string, args: string[]): string | null {
    try {
        const result = spawnSync(command, args, {
            encoding: 'utf-8',
            stdio: ['pipe', 'pipe', 'pipe'],
            timeout: 8000,
            windowsHide: true,
        });
        if (result.error || result.status !== 0) return null;
        return result.stdout || null;
    } catch {
        return null;
    }
}

const PROVIDER_MAP: Record<string, DetectedSubscription> = {
    'opencode go': 'opencode-go',
    'opencode-go': 'opencode-go',
    'z.ai coding plan': 'zai-coding-plan',
    'zai-coding-plan': 'zai-coding-plan',
    'z.ai': 'zai-coding-plan',
};

function parseProvidersList(output: string): ProviderInfo[] {
    const providers: ProviderInfo[] = [];
    const lines = output.split('\n');

    for (const line of lines) {
        const stripped = line.replace(/\x1b\[[0-9;]*m/g, '').trim();
        if (!stripped || stripped.startsWith('┌') || stripped.startsWith('└') || stripped.startsWith('│') || stripped.includes('credentials') || stripped.includes('environment')) continue;

        const match = stripped.match(/[●○◉◘]\s+(.+?)\s+(api|oauth|env)$/i);
        if (match) {
            const name = match[1].trim();
            const authType = match[2].trim();

            let subscription: DetectedSubscription | null = null;
            const nameLower = name.toLowerCase();
            for (const [key, sub] of Object.entries(PROVIDER_MAP)) {
                if (nameLower.includes(key)) {
                    subscription = sub;
                    break;
                }
            }

            providers.push({
                name,
                subscription,
                authType,
                active: stripped.includes('●'),
            });
        }
    }

    return providers;
}

function detectFromModels(output: string): DetectedSubscription[] {
    const subs = new Set<DetectedSubscription>();
    for (const line of output.split('\n')) {
        const trimmed = line.trim();
        if (trimmed.startsWith('opencode-go/')) subs.add('opencode-go');
        if (trimmed.startsWith('zai-coding-plan/')) subs.add('zai-coding-plan');
    }
    return Array.from(subs);
}

export function detectSubscriptionsFromCli(): SubscriptionDetectionResult {
    const evidence: string[] = [];
    const allProviders: ProviderInfo[] = [];
    const subs = new Set<DetectedSubscription>();

    const providersOutput = runCli('opencode', ['providers', 'list']);
    if (providersOutput) {
        const providers = parseProvidersList(providersOutput);
        allProviders.push(...providers);

        for (const p of providers) {
            if (p.subscription) {
                subs.add(p.subscription);
                evidence.push(`provider: ${p.name} (${p.authType})`);
            }
        }
    }

    const modelsOutput = runCli('opencode', ['models']);
    if (modelsOutput) {
        const modelSubs = detectFromModels(modelsOutput);
        for (const sub of modelSubs) {
            if (!subs.has(sub)) {
                subs.add(sub);
                evidence.push(`models: ${sub}/* models available`);
            }
        }
    }

    if (subs.size === 0) {
        subs.add('opencode-go');
        evidence.push('No subscription detected via CLI, defaulting to opencode-go');
    }

    const primary = subs.has('zai-coding-plan') ? 'zai-coding-plan' : 'opencode-go';

    return {
        subscriptions: Array.from(subs),
        primary,
        evidence,
        allProviders,
    };
}

export function detectSubscriptionsFromConfig(opencodeConfig: Record<string, any>): SubscriptionDetectionResult {
    const subs = new Set<DetectedSubscription>();
    const evidence: string[] = [];

    const modelFields = ['model', 'small_model', 'large_model'];
    const configs = [opencodeConfig];

    if (opencodeConfig.agent) {
        for (const agentConfig of Object.values(opencodeConfig.agent) as any[]) {
            if (agentConfig && typeof agentConfig === 'object') configs.push(agentConfig);
        }
    }

    for (const cfg of configs) {
        for (const field of modelFields) {
            const val = cfg[field];
            if (typeof val !== 'string' || !val) continue;

            if (val.startsWith('opencode-go/')) {
                subs.add('opencode-go');
                evidence.push(`${field}: ${val}`);
            } else if (val.startsWith('zai-coding-plan/')) {
                subs.add('zai-coding-plan');
                evidence.push(`${field}: ${val}`);
            }
        }
    }

    if (subs.size === 0) {
        subs.add('opencode-go');
        evidence.push('No provider detected in config, defaulting to opencode-go');
    }

    const primary = subs.has('zai-coding-plan') ? 'zai-coding-plan' : 'opencode-go';

    return {
        subscriptions: Array.from(subs),
        primary,
        evidence,
        allProviders: [],
    };
}

function buildZaiPool() {
    return [
        {
            id: 'glm-flash',
            model: 'zai-coding-plan/glm-5-turbo',
            tier: 'flash',
            maxConcurrent: 1,
            capabilities: ['search', 'formatting', 'simple-coding', 'file-ops'],
            costTier: 'low',
            priority: 1,
            description: 'GLM-5 Turbo - 빠름. 단순 검색/포매팅/파일작업',
        },
        {
            id: 'glm-general',
            model: 'zai-coding-plan/glm-5.1',
            tier: 'human',
            maxConcurrent: 10,
            capabilities: ['coding', 'testing', 'refactoring', 'backend'],
            costTier: 'medium',
            priority: 1,
            description: 'GLM-5.1 - 일반. 코딩/리팩토링/백엔드',
        },
        {
            id: 'glm-premium',
            model: 'zai-coding-plan/glm-5.1',
            tier: 'premium',
            maxConcurrent: 10,
            capabilities: ['architecture', 'debugging', 'reasoning', 'complex-coding', 'refactoring'],
            costTier: 'high',
            priority: 1,
            description: 'GLM-5.1 - 고급 추론. 아키텍처/복잡 디버깅',
        },
    ];
}

function buildOpencodeGoPool() {
    return [
        {
            id: 'deepseek-flash',
            model: 'opencode-go/deepseek-v4-flash',
            tier: 'flash',
            maxConcurrent: 5,
            capabilities: ['search', 'formatting', 'simple-coding', 'file-ops'],
            costTier: 'low',
            priority: 1,
            description: 'DeepSeek V4 Flash - 빠름. 단순 검색/포매팅/파일작업',
        },
        {
            id: 'deepseek-general',
            model: 'opencode-go/deepseek-v4-flash',
            tier: 'human',
            maxConcurrent: 3,
            capabilities: ['coding', 'testing', 'refactoring', 'backend'],
            costTier: 'medium',
            priority: 2,
            description: 'DeepSeek V4 Flash - 일반. 코딩/리팩토링/백엔드',
        },
        {
            id: 'qwen-vision',
            model: 'opencode-go/qwen3.6-plus',
            tier: 'human',
            maxConcurrent: 3,
            capabilities: ['vision', 'frontend', 'testing'],
            costTier: 'medium',
            priority: 1,
            description: 'Qwen 3.6 Plus - 비전. 이미지 분석/프론트엔드/테스트',
        },
        {
            id: 'deepseek-pro',
            model: 'opencode-go/deepseek-v4-pro',
            tier: 'premium',
            maxConcurrent: 2,
            capabilities: ['architecture', 'debugging', 'reasoning', 'complex-coding', 'refactoring'],
            costTier: 'high',
            priority: 2,
            description: 'DeepSeek V4 Pro - 고급 추론. 아키텍처/복잡 디버깅',
        },
        {
            id: 'kimi-vision',
            model: 'opencode-go/kimi-k2.6',
            tier: 'premium',
            maxConcurrent: 2,
            capabilities: ['vision', 'reasoning', 'complex-coding', 'architecture', 'debugging'],
            costTier: 'high',
            priority: 1,
            description: 'Kimi K2.6 - 비전 고급. 이미지 분석/복잡 추론',
        },
    ];
}

function buildOperatorModel(primary: DetectedSubscription): { model: string; maxConcurrent: number; description: string } {
    switch (primary) {
        case 'zai-coding-plan':
            return {
                model: 'zai-coding-plan/glm-5.1',
                maxConcurrent: 10,
                description: 'Squad Operator model - 작업 오케스트레이션 및 고급 추론',
            };
        default:
            return {
                model: 'opencode-go/deepseek-v4-pro',
                maxConcurrent: 2,
                description: 'Squad Operator model - 작업 오케스트레이션 및 고급 추론',
            };
    }
}

export function buildPoolFromDetection(detection: SubscriptionDetectionResult): any[] {
    const pool: any[] = [];

    if (detection.subscriptions.includes('opencode-go')) {
        pool.push(...buildOpencodeGoPool());
    }
    if (detection.subscriptions.includes('zai-coding-plan')) {
        pool.push(...buildZaiPool());
    }

    if (pool.length === 0) {
        pool.push(...buildOpencodeGoPool());
    }

    return pool;
}

export function buildConfigFromDetection(detection: SubscriptionDetectionResult): Record<string, any> {
    const pool = buildPoolFromDetection(detection);
    const operator = buildOperatorModel(detection.primary);

    return {
        dummyHumans: { pool },
        operator,
        memory: { provider: 'text-only', enabled: false },
        gdc: { enabled: 'auto', strictVerify: false, autoSyncOnPrepare: true },
        language: 'ko',
    };
}

export function formatProviderChecklist(detection: SubscriptionDetectionResult): string {
    const lines: string[] = ['감지된 프로바이더:'];
    lines.push('');

    if (detection.allProviders.length > 0) {
        for (const p of detection.allProviders) {
            const marker = p.subscription && detection.subscriptions.includes(p.subscription) ? '[x]' : '[ ]';
            const sub = p.subscription ? ` → ${p.subscription}` : '';
            lines.push(`  ${marker} ${p.name} (${p.authType})${sub}`);
        }
    } else {
        for (const sub of detection.subscriptions) {
            lines.push(`  [x] ${sub}`);
        }
        lines.push(`  [ ] (다른 구독이 있다면 maskweaver.config.json에서 추가하세요)`);
    }

    lines.push('');
    lines.push(`선택된 구독: ${detection.subscriptions.join(', ')}`);
    lines.push(`기본 구독: ${detection.primary}`);
    lines.push('');
    lines.push('구독을 변경하려면 maskweaver.config.json의 dummyHumans.pool을 편집하세요.');

    return lines.join('\n');
}

export function writeAutoDetectedConfig(projectDir: string, force?: boolean): { path: string; detection: SubscriptionDetectionResult } | null {
    let detection: SubscriptionDetectionResult;

    try {
        detection = detectSubscriptionsFromCli();
    } catch {
        const opencodeConfig = readOpencodeConfig(projectDir);
        if (!opencodeConfig) return null;
        detection = detectSubscriptionsFromConfig(opencodeConfig);
    }

    const targetPath = path.join(projectDir, 'maskweaver.config.json');
    const existingConfig = fs.existsSync(targetPath)
        ? (() => { try { return JSON.parse(fs.readFileSync(targetPath, 'utf-8')); } catch { return null; } })()
        : null;

    if (!force && existingConfig?.dummyHumans?.pool?.length > 0) {
        return null;
    }

    const newConfig = buildConfigFromDetection(detection);

    try {
        fs.writeFileSync(targetPath, JSON.stringify(newConfig, null, 2) + '\n', 'utf-8');
        return { path: targetPath, detection };
    } catch {
        return null;
    }
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
        priority: 1,
        description: 'DeepSeek V4 Flash - 빠름. 단순 검색/포매팅/파일작업',
      },
      {
        id: 'deepseek-general',
        model: 'opencode-go/deepseek-v4-flash',
        tier: 'human',
        maxConcurrent: 3,
        capabilities: ['coding', 'testing', 'refactoring', 'backend'],
        costTier: 'medium',
        priority: 2,
        description: 'DeepSeek V4 Flash - 일반. 코딩/리팩토링/백엔드',
      },
      {
        id: 'qwen-vision',
        model: 'opencode-go/qwen3.6-plus',
        tier: 'human',
        maxConcurrent: 3,
        capabilities: ['vision', 'frontend', 'testing'],
        costTier: 'medium',
        priority: 1,
        description: 'Qwen 3.6 Plus - 비전. 이미지 분석/프론트엔드/테스트',
      },
      {
        id: 'deepseek-pro',
        model: 'opencode-go/deepseek-v4-pro',
        tier: 'premium',
        maxConcurrent: 2,
        capabilities: ['architecture', 'debugging', 'reasoning', 'complex-coding', 'refactoring'],
        costTier: 'high',
        priority: 2,
        description: 'DeepSeek V4 Pro - 고급 추론. 아키텍처/복잡 디버깅',
      },
      {
        id: 'kimi-vision',
        model: 'opencode-go/kimi-k2.6',
        tier: 'premium',
        maxConcurrent: 2,
        capabilities: ['vision', 'reasoning', 'complex-coding', 'architecture', 'debugging'],
        costTier: 'high',
        priority: 1,
        description: 'Kimi K2.6 - 비전 고급. 이미지 분석/복잡 추론',
      },
    ],
  },
  operator: {
    model: 'opencode-go/deepseek-v4-pro',
    maxConcurrent: 2,
    description: 'Squad Operator model - 작업 오케스트레이션 및 고급 추론',
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
    return null;
  }

  const autoResult = writeAutoDetectedConfig(projectDir);
  if (autoResult) {
    return autoResult.path;
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
