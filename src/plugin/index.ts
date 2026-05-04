/**
* Maskweaver Plugin for opencode
* 
* Key features:
* - Configuration-driven tool activation/deactivation
* - Auto-activation of default masks
* - Agent configuration overrides
* - Event-based lifecycle hooks
* - Memory and context management tools
* - Clean plugin architecture
* 
* Based on oh-my-opencode plugin development patterns.
*/

import { z } from 'zod';
import { tool, type Plugin } from '@opencode-ai/plugin';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { VERSION } from '../version.js';
import { fetchNpmDistTags, type NpmDistTags } from '../cli/config-manager/npm-dist-tags.js';
import { checkVersionCompatibility } from '../cli/config-manager/version-compatibility.js';
import {
  loadPluginConfig,
  isMaskEnabled,
  isToolEnabled,
  getDefaultMask,
  isAutoActivateEnabled,
  isVerboseLoggingEnabled,
  isCompletionSoundEnabled,
  validateConfig,
  type MaskweaverPluginConfig,
} from './config/index.js';

// New tool imports
import { createMemorySearchTool } from './tools/memorySearch.js';
import { createMemoryWriteTool } from './tools/memoryWrite.js';
import { createMemoryGetTool } from './tools/memoryGet.js';
import { createMemoryIndexerTool } from './tools/memoryIndexer.js';
import { createContextTool } from './tools/context.js';
import { createRetrospectTool } from './tools/retrospect.js';
import { createMaskSaveTool } from './tools/maskSave.js';
import { createSquadTool } from './tools/squad.js';
import { createWeaveTool } from './tools/weave.js';
import { createSlashcommandTool } from './tools/slashcommand.js';
import { loadRuntimeConfig, normalizeDummyHumansConfig } from '../shared/config.js';
import {
  generatePoolAgentFilesFromConfig,
  writeDefaultRuntimeConfig,
  writeDefaultPluginConfig,
  writeAutoDetectedConfig,
} from '../shared/generate-agents.js';

// ============================================================================
// Asset Installer
// ============================================================================

interface InstallResult {
  installed: string[];
  skipped: string[];
  errors: string[];
}

const BUILD_COMMAND_TEMPLATE = `Use the \`weave\` tool with \`command="build"\`.

Forward the user arguments from \`$ARGUMENTS\` to the build command:

- No arguments: run the default build loop.
- \`status <buildId>\`: call \`weave\` with \`command="build"\`, \`action="status"\`, and \`buildId\`.
- \`stop <buildId>\`: call \`weave\` with \`command="build"\`, \`action="stop"\`, and \`buildId\`.
- \`list\`: call \`weave\` with \`command="build"\` and \`action="list"\`.
- \`resume <buildId>\`: call \`weave\` with \`command="build"\`, \`action="resume"\`, and \`buildId\`.
- \`sync <buildId>\`: call \`weave\` with \`command="build"\`, \`action="sync"\`, and \`buildId\`.
- Otherwise, treat \`$ARGUMENTS\` as phase IDs or build options for \`action="run"\`.

Do not run shell build commands directly unless the \`weave\` tool asks for verification.`;

const REMOVED_WEAVE_COMMAND_FILES = [
  'weave-task.md',
  'weave-task-auto.md',
  'wave-task-auto.md',
  'weave-approve-plan.md',
  'weave-design.md',
  'weave-flow.md',
  'weave-plan.md',
  'weave-research.md',
  'weave-spec.md',
  'weave-switch.md',
];

function getAssetsDir(): string {
  try {
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = path.dirname(__filename);

    // 1. If in dist/plugin/ (production) -> ../../assets
    const distAssets = path.join(__dirname, '..', '..', 'assets');
    if (fs.existsSync(distAssets)) {
      return distAssets;
    }

    // 2. If in src/plugin/ (development) -> ../../assets
    const srcAssets = path.join(__dirname, '..', '..', 'assets');
    if (fs.existsSync(srcAssets)) {
      return srcAssets;
    }

    // 3. Fallback for npm package structure (node_modules/maskweaver/dist/plugin/index.js)
    return distAssets;
  } catch {
    return path.join(process.cwd(), 'assets');
  }
}

function copyDirRecursive(src: string, dest: string, result: InstallResult, overwrite: boolean = false): void {
  if (!fs.existsSync(src)) return;

  if (!fs.existsSync(dest)) {
    fs.mkdirSync(dest, { recursive: true });
  }

  const entries = fs.readdirSync(src, { withFileTypes: true });

  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);

    if (entry.isDirectory()) {
      copyDirRecursive(srcPath, destPath, result, overwrite);
    } else {
      if (overwrite || !fs.existsSync(destPath)) {
        try {
          fs.copyFileSync(srcPath, destPath);
          result.installed.push(destPath);
        } catch (e) {
          result.errors.push(`Failed to copy ${entry.name}: ${e}`);
        }
      } else {
        result.skipped.push(destPath);
      }
    }
  }
}

function installAssets(projectDir: string): InstallResult {
  const result: InstallResult = {
    installed: [],
    skipped: [],
    errors: [],
  };

  const assetsDir = getAssetsDir();
  const homeDir = os.homedir();
  const globalConfigDir = path.join(homeDir, '.config', 'opencode');
  const projectOpencodeDir = path.join(projectDir, '.opencode');

  // Install to both global and project directories to ensure visibility
  const targetDirs = [projectOpencodeDir];
  if (fs.existsSync(globalConfigDir)) {
    targetDirs.push(globalConfigDir);
  }

  for (const targetDir of targetDirs) {
    if (!fs.existsSync(targetDir)) {
      try {
        fs.mkdirSync(targetDir, { recursive: true });
      } catch (e) {
        result.errors.push(`Failed to create directory ${targetDir}: ${e}`);
        continue;
      }
    }

    // Install agents
    const agentsSrc = path.join(assetsDir, 'agents');
    const agentsDest = path.join(targetDir, 'agents');
    copyDirRecursive(agentsSrc, agentsDest, result);

    // Install masks
    const masksSrc = path.join(assetsDir, 'masks');
    const masksDest = path.join(targetDir, 'masks');
    copyDirRecursive(masksSrc, masksDest, result);

    // Install commands (always overwrite to keep commands up-to-date)
    const commandsSrc = path.join(assetsDir, 'commands');
    const commandsDest = path.join(targetDir, 'commands');
    if (fs.existsSync(commandsSrc)) {
      copyDirRecursive(commandsSrc, commandsDest, result, true);
    }

    // Hard-remove deprecated weave commands to keep a craft-centric flow.
    for (const commandFile of REMOVED_WEAVE_COMMAND_FILES) {
      const legacyPath = path.join(commandsDest, commandFile);
      if (!fs.existsSync(legacyPath)) continue;
      try {
        fs.unlinkSync(legacyPath);
      } catch (e) {
        result.errors.push(`Failed to remove deprecated command ${commandFile}: ${e}`);
      }
    }
  }

  return result;
}

// ============================================================================
// Pool Agent Generator
// ============================================================================

/**
 * Generate dummy-human agent .md files from maskweaver.config.json's dummyHumans.pool.
 * 
 * For each pool entry with a non-empty model, creates .opencode/agents/dummy-{id}.md.
 * Skips existing files to protect user customizations — use `weave sync-agents`
 * to force overwrite from the config.
 * 
 * Also skips entries with empty model names (template placeholders) to prevent
 * generating broken agent files.
 */
function generatePoolAgents(projectDir: string): string[] {
  const agentsDir = path.join(projectDir, '.opencode', 'agents');
  
  // Use shared utility — force=false means skip existing
  const result = generatePoolAgentFilesFromConfig(projectDir, agentsDir, { force: false });

  // Extract successfully created files (not skipped, not updated)
  return result.created;
}

// ============================================================================
// Types
// ============================================================================

interface MaskMetadata {
  id: string;
  version: '1.0';
  language: 'en' | 'ko' | 'zh' | 'ja';
  created: string;
  updated: string;
  authors?: string[];
  relatedMasks?: string[];
  tags?: string[];
}

interface MaskProfile {
  name: string;
  tagline: string;
  background: string;
  expertise: string[];
  thinkingStyle: string;
  strengths: string[];
  limitations?: string[];
}

interface MaskBehavior {
  systemPrompt: string;
  communicationStyle: {
    tone: 'direct' | 'friendly' | 'formal' | 'socratic' | 'enthusiastic';
    verbosity: 'concise' | 'moderate' | 'detailed';
    technicalDepth: 'beginner' | 'intermediate' | 'expert';
  };
  approachPatterns: {
    problemSolving: string;
    codeReview: string;
    architecture?: string;
    debugging?: string;
  };
  signaturePhrases?: string[];
}

interface MaskUsage {
  suitableFor: string[];
  notSuitableFor?: string[];
  examples: Array<{ scenario: string; expectedOutcome: string }>;
}

interface MaskConfig {
  priority?: number;
  allowedTools?: string[];
  disallowedTools?: string[];
  maxTokens?: number;
  temperature?: number;
}

interface MaskSchema {
  metadata: MaskMetadata;
  profile: MaskProfile;
  behavior: MaskBehavior;
  usage: MaskUsage;
  config?: MaskConfig;
}

interface MaskCatalogEntry {
  id: string;
  name: string;
  file: string;
  tags: string[];
  category?: string;
}

interface MaskCategory {
  name: string;
  description: string;
  masks: MaskCatalogEntry[];
}

interface MaskCatalog {
  version: string;
  categories: Record<string, MaskCategory>;
}

interface LoadedMask extends MaskSchema {
  category: string;
  filePath: string;
}

// ============================================================================
// Simple YAML Parser
// ============================================================================

function parseSimpleYaml(content: string): unknown {
  const lines = content.split('\n');
  const result: Record<string, unknown> = {};
  const stack: { indent: number; obj: Record<string, unknown>; key?: string }[] = [
    { indent: -2, obj: result },
  ];

  let currentArrayKey: string | undefined = undefined;
  let currentArray: unknown[] = [];
  let multilineKey: string | null = null;
  let multilineValue: string[] = [];
  let multilineIndent = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trimStart();

    if (!trimmed || trimmed.startsWith('#')) {
      if (multilineKey) multilineValue.push('');
      continue;
    }

    const indent = line.length - trimmed.length;

    if (multilineKey) {
      if (indent > multilineIndent || (indent === multilineIndent && !trimmed.includes(':'))) {
        multilineValue.push(trimmed);
        continue;
      } else {
        const parent = stack[stack.length - 1];
        parent.obj[multilineKey] = multilineValue.join('\n').trim();
        multilineKey = null;
        multilineValue = [];
      }
    }

    if (trimmed.startsWith('- ')) {
      const value = trimmed.slice(2).trim();

      while (stack.length > 1 && stack[stack.length - 1].indent >= indent) {
        const popped = stack.pop()!;
        if (popped.key && currentArrayKey === popped.key) {
          const parent = stack[stack.length - 1];
          parent.obj[popped.key] = currentArray;
          currentArrayKey = undefined;
          currentArray = [];
        }
      }

      if (value.includes(':')) {
        const colonIdx = value.indexOf(':');
        const objKey = value.slice(0, colonIdx).trim();
        const objVal = value.slice(colonIdx + 1).trim();
        const arrayItem: Record<string, unknown> = {};

        if (objVal) arrayItem[objKey] = parseValue(objVal);

        let j = i + 1;
        const itemIndent = indent + 2;
        while (j < lines.length) {
          const nextLine = lines[j];
          const nextTrimmed = nextLine.trimStart();
          const nextIndent = nextLine.length - nextTrimmed.length;

          if (!nextTrimmed || nextTrimmed.startsWith('#')) { j++; continue; }
          if (nextIndent < itemIndent || nextTrimmed.startsWith('- ')) break;

          if (nextTrimmed.includes(':')) {
            const nColonIdx = nextTrimmed.indexOf(':');
            const nKey = nextTrimmed.slice(0, nColonIdx).trim();
            const nVal = nextTrimmed.slice(nColonIdx + 1).trim();
            if (nVal) arrayItem[nKey] = parseValue(nVal);
          }
          j++;
        }

        i = j - 1;
        currentArray.push(arrayItem);
      } else {
        currentArray.push(parseValue(value));
      }

      if (!currentArrayKey) {
        for (let s = stack.length - 1; s >= 0; s--) {
          if (stack[s].key) { currentArrayKey = stack[s].key; break; }
        }
      }
      continue;
    }

    if (trimmed.includes(':')) {
      while (stack.length > 1 && stack[stack.length - 1].indent >= indent) {
        const popped = stack.pop()!;
        if (popped.key && currentArrayKey === popped.key) {
          const parent = stack[stack.length - 1];
          parent.obj[popped.key] = currentArray;
          currentArrayKey = undefined;
          currentArray = [];
        }
      }

      if (currentArrayKey) {
        const parent = stack[stack.length - 1];
        parent.obj[currentArrayKey] = currentArray;
        currentArrayKey = undefined;
        currentArray = [];
      }

      const colonIdx = trimmed.indexOf(':');
      const key = trimmed.slice(0, colonIdx).trim();
      const value = trimmed.slice(colonIdx + 1).trim();

      const parent = stack[stack.length - 1];

      if (!value) {
        const nextLine = lines[i + 1];
        if (nextLine && nextLine.trimStart().startsWith('|')) {
          multilineKey = key;
          multilineIndent = indent;
          i++;
          continue;
        }
        const newObj: Record<string, unknown> = {};
        parent.obj[key] = newObj;
        stack.push({ indent, obj: newObj, key });
      } else if (value === '|' || value === '>') {
        multilineKey = key;
        multilineIndent = indent;
      } else {
        parent.obj[key] = parseValue(value);
      }
    }
  }

  if (multilineKey) {
    const parent = stack[stack.length - 1];
    parent.obj[multilineKey] = multilineValue.join('\n').trim();
  }

  if (currentArrayKey) {
    const parent = stack[stack.length - 1];
    parent.obj[currentArrayKey] = currentArray;
  }

  return result;
}

function parseValue(value: string): unknown {
  if (!value) return '';
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
    return value.slice(1, -1);
  }
  if (value === 'true') return true;
  if (value === 'false') return false;
  if (value === 'null' || value === '~') return null;
  const num = Number(value);
  if (!isNaN(num) && value !== '') return num;
  return value;
}

// ============================================================================
// Mask Loader
// ============================================================================

class MaskLoader {
  private masksDir: string;
  private catalog: MaskCatalog | null = null;
  private cache: Map<string, LoadedMask> = new Map();
  private config: MaskweaverPluginConfig;

  constructor(masksDir: string, config: MaskweaverPluginConfig) {
    this.masksDir = masksDir;
    this.config = config;
  }

  async loadCatalog(): Promise<MaskCatalog> {
    if (this.catalog) return this.catalog;
    const indexPath = path.join(this.masksDir, 'index.json');
    if (!fs.existsSync(indexPath)) throw new Error(`Catalog not found: ${indexPath}`);
    const content = fs.readFileSync(indexPath, 'utf-8');
    this.catalog = JSON.parse(content) as MaskCatalog;
    return this.catalog;
  }

  async load(maskId: string): Promise<LoadedMask | null> {
    // Check if mask is disabled in configuration
    if (!isMaskEnabled(this.config, maskId)) {
      return null;
    }

    if (this.cache.has(maskId)) return this.cache.get(maskId)!;

    const catalog = await this.loadCatalog();
    let entry: MaskCatalogEntry | null = null;
    let categoryId: string | null = null;

    for (const [catId, category] of Object.entries(catalog.categories)) {
      const found = category.masks.find(m => m.id === maskId);
      if (found) { entry = found; categoryId = catId; break; }
    }

    if (!entry || !categoryId) return null;

    const filePath = path.join(this.masksDir, entry.file);
    if (!fs.existsSync(filePath)) throw new Error(`File not found: ${filePath}`);

    const content = fs.readFileSync(filePath, 'utf-8');
    const parsed = filePath.endsWith('.yaml') || filePath.endsWith('.yml')
      ? parseSimpleYaml(content) : JSON.parse(content);

    const loadedMask: LoadedMask = { ...(parsed as MaskSchema), category: categoryId, filePath };
    this.cache.set(maskId, loadedMask);
    return loadedMask;
  }

  async listAll(): Promise<Array<MaskCatalogEntry & { category: string }>> {
    const catalog = await this.loadCatalog();
    const result: Array<MaskCatalogEntry & { category: string }> = [];

    for (const [categoryId, category] of Object.entries(catalog.categories)) {
      for (const mask of category.masks) {
        // Filter out disabled masks
        if (isMaskEnabled(this.config, mask.id)) {
          result.push({ ...mask, category: categoryId });
        }
      }
    }

    return result;
  }

  async listCategories(): Promise<Array<{ id: string; name: string; description: string; count: number }>> {
    const catalog = await this.loadCatalog();
    return Object.entries(catalog.categories).map(([id, cat]) => {
      // Count only enabled masks
      const enabledMasks = cat.masks.filter(m => isMaskEnabled(this.config, m.id));
      return {
        id,
        name: cat.name,
        description: cat.description,
        count: enabledMasks.length,
      };
    });
  }
}

// ============================================================================
// Prompt Builder
// ============================================================================

function buildRichPrompt(mask: MaskSchema): string {
  const parts: string[] = [];

  parts.push(`You are ${mask.profile.name}.`);
  parts.push(`${mask.profile.tagline}`);
  parts.push('');
  parts.push('BACKGROUND:');
  parts.push(mask.profile.background.trim());
  parts.push('');
  parts.push('YOUR EXPERTISE:');
  for (const exp of mask.profile.expertise) parts.push(`- ${exp}`);
  parts.push('');
  parts.push('YOUR THINKING STYLE:');
  parts.push(mask.profile.thinkingStyle.trim());
  parts.push('');
  parts.push('INSTRUCTIONS:');
  parts.push(mask.behavior.systemPrompt.trim());
  parts.push('');

  const style = mask.behavior.communicationStyle;
  parts.push('COMMUNICATION STYLE:');
  parts.push(`- Tone: ${style.tone}`);
  parts.push(`- Verbosity: ${style.verbosity}`);
  parts.push(`- Technical depth: ${style.technicalDepth}`);
  parts.push('');
  parts.push('YOUR STRENGTHS:');
  for (const strength of mask.profile.strengths) parts.push(`- ${strength}`);

  if (mask.profile.limitations?.length) {
    parts.push('');
    parts.push('ACKNOWLEDGE YOUR LIMITATIONS:');
    for (const limitation of mask.profile.limitations) parts.push(`- ${limitation}`);
  }

  if (mask.behavior.signaturePhrases?.length) {
    parts.push('');
    parts.push('PHRASES YOU MIGHT USE:');
    for (const phrase of mask.behavior.signaturePhrases) parts.push(`- "${phrase}"`);
  }

  return parts.join('\n');
}

// ============================================================================
// Plugin Logging Helper
// ============================================================================

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

function pluginLog(
  client: unknown,
  level: LogLevel,
  message: string,
): void {
  (client as any).app.log({
    body: {
      service: 'maskweaver',
      level,
      message,
    },
  });
}

// ============================================================================
// Helper functions for tool factories
// ============================================================================

function createListMasksTool(maskLoader: MaskLoader, activeMask: () => LoadedMask | null) {
  return {
    description: 'List all available expert persona masks.',
    args: z.object({
      category: z.string().optional().describe('Filter by category'),
    }),
    async execute(args: { category?: string }) {
      try {
        const masks = await maskLoader.listAll();
        const categories = await maskLoader.listCategories();

        let filtered = masks;
        if (args.category) {
          filtered = masks.filter(m => m.category === args.category);
        }

        const lines: string[] = [];
        lines.push(`Maskweaver v${VERSION} - ${filtered.length} masks available`);
        const active = activeMask();
        lines.push(`Active mask: ${active?.metadata.id || 'none'}`);
        lines.push('');
        lines.push('Categories:');
        for (const cat of categories) {
          lines.push(`  - ${cat.id}: ${cat.name} (${cat.count} masks)`);
        }
        lines.push('');
        lines.push('Masks:');
        for (const mask of filtered) {
          lines.push(`  - ${mask.id}: ${mask.name} [${mask.category}]`);
        }

        return lines.join('\n');
      } catch (e) {
        return `Error: ${e}`;
      }
    },
  };
}

function createSelectMaskTool(
  maskLoader: MaskLoader,
  activeMask: () => LoadedMask | null,
  setActiveMask: (mask: LoadedMask | null) => void
) {
  return {
    description: 'Select and apply an expert persona mask.',
    args: z.object({
      maskId: z.string().describe('Mask ID (e.g., "kent-beck")'),
    }),
    async execute(args: { maskId: string }) {
      try {
        const mask = await maskLoader.load(args.maskId);

        if (!mask) {
          const available = await maskLoader.listAll();
          return `Error: Mask "${args.maskId}" not found.\nAvailable: ${available.map(m => m.id).join(', ')}`;
        }

        setActiveMask(mask);

        return `✓ Mask activated: ${mask.profile.name}

"${mask.profile.tagline}"

Expertise: ${mask.profile.expertise.join(', ')}

The mask prompt will be injected into all future messages.`;
      } catch (e) {
        return `Error: ${e}`;
      }
    },
  };
}

function createDeselectMaskTool(
  activeMask: () => LoadedMask | null,
  setActiveMask: (mask: LoadedMask | null) => void
) {
  return {
    description: 'Remove the current mask and return to default behavior.',
    args: z.object({}),
    async execute() {
      const prev = activeMask();
      setActiveMask(null);

      if (prev) {
        return `✓ Mask removed: ${prev.profile.name}\nReturned to default behavior.`;
      }
      return 'No mask was active.';
    },
  };
}

function createGetMaskPromptTool(
  maskLoader: MaskLoader,
  activeMask: () => LoadedMask | null
) {
  return {
    description: 'View the full system prompt for a mask.',
    args: z.object({
      maskId: z.string().optional().describe('Mask ID (uses active mask if not specified)'),
    }),
    async execute(args: { maskId?: string }) {
      const maskId = args.maskId || activeMask()?.metadata.id;
      if (!maskId) return 'Error: No mask specified and no active mask.';

      try {
        const mask = await maskLoader.load(maskId);
        if (!mask) return `Error: Mask "${maskId}" not found.`;

        return `# ${mask.profile.name}\n\n${buildRichPrompt(mask)}`;
      } catch (e) {
        return `Error: ${e}`;
      }
    },
  };
}

function createMaskweaverStatusTool(
  maskLoader: MaskLoader | null,
  masksDir: string,
  activeMask: () => LoadedMask | null
) {
  return {
    description: 'Check Maskweaver status.',
    args: z.object({}),
    async execute() {
      let masksCount = 0;
      let categoriesCount = 0;

      if (maskLoader) {
        try {
          const masks = await maskLoader.listAll();
          const categories = await maskLoader.listCategories();
          masksCount = masks.length;
          categoriesCount = categories.length;
        } catch (_e) { /* ignore */ }
      }

      const active = activeMask();
      return `Maskweaver v${VERSION}
Masks directory: ${masksDir}
Available: ${maskLoader ? 'yes' : 'no'}
Total masks: ${masksCount}
Categories: ${categoriesCount}
Active mask: ${active ? `${active.profile.name} (${active.metadata.id})` : 'none'}`;
    },
  };
}

function getSessionId(event: { type: string; [key: string]: unknown }): string | null {
  if (typeof event.sessionID === 'string') return event.sessionID;
  if (typeof event.sessionId === 'string') return event.sessionId;
  return null;
}

function runSoundCommand(command: string, args: string[]): boolean {
  try {
    const result = spawnSync(command, args, {
      stdio: 'ignore',
      windowsHide: true,
      timeout: 2500,
    });
    return !result.error && result.status === 0;
  } catch {
    return false;
  }
}

function playCompletionSound(config: MaskweaverPluginConfig): void {
  if (!isCompletionSoundEnabled(config)) return;

  let played = false;

  if (process.platform === 'win32') {
    played = runSoundCommand('powershell', [
      '-NoProfile',
      '-NonInteractive',
      '-Command',
      '[console]::beep(880,220)',
    ]);
  } else if (process.platform === 'darwin') {
    played = runSoundCommand('afplay', ['/System/Library/Sounds/Glass.aiff']);
  } else if (process.platform === 'linux') {
    played = runSoundCommand('canberra-gtk-play', ['-i', 'complete', '-d', 'maskweaver']);
  }

  if (!played) {
    try {
      process.stdout.write('\u0007');
    } catch {
      // Ignore failures - notification sound is best-effort only.
    }
  }
}

// ============================================================================
// Plugin State
// ============================================================================

interface PluginState {
  maskLoader: MaskLoader | null;
  activeMask: LoadedMask | null;
  masksDir: string;
  config: MaskweaverPluginConfig;
  currentSessionID: string | null;
}

let state: PluginState | null = null;

// ============================================================================
// Package Cache Version Check (oh-my-openagent style)
// ============================================================================

const OPENCODE_PACKAGES_DIR = path.join(os.homedir(), '.cache', 'opencode', 'packages');

interface CacheVersionInfo {
  version: string | null
  pkgDir: string | null
}

function getCachedPackageVersion(): CacheVersionInfo {
  if (!fs.existsSync(OPENCODE_PACKAGES_DIR)) {
    return { version: null, pkgDir: null };
  }

  const entries = fs.readdirSync(OPENCODE_PACKAGES_DIR);
  for (const entry of entries) {
    if (!entry.startsWith('maskweaver@')) continue;
    const pkgDir = path.join(OPENCODE_PACKAGES_DIR, entry, 'node_modules', 'maskweaver');
    const pkgJsonPath = path.join(pkgDir, 'package.json');
    if (!fs.existsSync(pkgJsonPath)) continue;
    try {
      const pkg = JSON.parse(fs.readFileSync(pkgJsonPath, 'utf-8'));
      return { version: pkg.version, pkgDir: path.join(OPENCODE_PACKAGES_DIR, entry) };
    } catch { continue; }
  }

  return { version: null, pkgDir: null };
}

async function fetchLatestFromRegistry(): Promise<NpmDistTags | null> {
  return fetchNpmDistTags('maskweaver');
}

interface UpdateCheckResult {
  updateAvailable: boolean
  installedVersion: string | null
  latestVersion: string | null
  isDowngrade: boolean
  isMajorBump: boolean
  requiresMigration: boolean
  message: string | null
}

async function checkForUpdates(): Promise<UpdateCheckResult> {
  const cached = getCachedPackageVersion();
  const installedVersion = cached.version;
  const latestTags = await fetchLatestFromRegistry();
  const latestVersion = latestTags?.latest ?? null;

  if (!installedVersion) {
    return {
      updateAvailable: false,
      installedVersion: null,
      latestVersion,
      isDowngrade: false,
      isMajorBump: false,
      requiresMigration: false,
      message: null,
    };
  }

  if (installedVersion === VERSION) {
    return {
      updateAvailable: false,
      installedVersion,
      latestVersion,
      isDowngrade: false,
      isMajorBump: false,
      requiresMigration: false,
      message: null,
    };
  }

  if (!latestVersion || latestVersion === installedVersion) {
    return {
      updateAvailable: false,
      installedVersion,
      latestVersion,
      isDowngrade: false,
      isMajorBump: false,
      requiresMigration: false,
      message: `Plugin cache v${installedVersion} — current is v${VERSION}.`,
    };
  }

  const compatibility = checkVersionCompatibility(installedVersion, latestVersion);
  const currentIsLatest = installedVersion === latestVersion;

  if (currentIsLatest) {
    return {
      updateAvailable: false,
      installedVersion,
      latestVersion,
      isDowngrade: false,
      isMajorBump: false,
      requiresMigration: false,
      message: `Plugin cache v${installedVersion} — current is v${VERSION}.`,
    };
  }

  return {
    updateAvailable: true,
    installedVersion,
    latestVersion,
    isDowngrade: compatibility.isDowngrade,
    isMajorBump: compatibility.isMajorBump,
    requiresMigration: compatibility.requiresMigration,
    message: `Update available: v${installedVersion} → v${latestVersion}${compatibility.requiresMigration ? ' (major upgrade — migration may be required)' : ''}.`,
  };
}

// ============================================================================

export const MaskweaverPlugin: Plugin = async ({ client, directory, project, worktree, $, serverUrl }) => {
  // ==========================================================================
  // 0. Check for updates (oh-my-openagent style — npm registry HTTP fetch)
  // ==========================================================================
  const updateCheck = await checkForUpdates();
  if (updateCheck.updateAvailable) {
    if (updateCheck.isDowngrade) {
      pluginLog(client, 'warn', `Downgrade detected (v${updateCheck.installedVersion} → v${updateCheck.latestVersion}) — not allowed. Please use opencode --upgrade.`);
    } else {
      pluginLog(client, 'warn', `Update available: maskweaver v${updateCheck.installedVersion} → v${updateCheck.latestVersion}`);
      if (updateCheck.requiresMigration) {
        pluginLog(client, 'warn', `Major version upgrade — configuration migration may be required.`);
      }
      pluginLog(client, 'info', `Run \`opencode --upgrade\` or \`npm update -g maskweaver\` to update.`);
    }
  } else if (updateCheck.message) {
    pluginLog(client, 'info', updateCheck.message);
  }
  // ==========================================================================
  // 1. Load Configuration (oh-my-opencode pattern)
  // ==========================================================================
  const pluginConfig = loadPluginConfig(directory, { client, verbose: false });

  // Validate configuration
  const configErrors = validateConfig(pluginConfig);
  if (configErrors.length > 0) {
    pluginLog(client, 'warn', `Configuration validation errors: ${configErrors.join(', ')}`);
  }

  const verbose = isVerboseLoggingEnabled(pluginConfig);

  // ==========================================================================
  // 2. Auto-install assets on first run
  // ==========================================================================
  const installResult = installAssets(directory);

  // Track if this is a first-time installation
  const isFirstInstall = installResult.installed.length > 0;

  if (isFirstInstall) {
    pluginLog(client, 'info', `Installed ${installResult.installed.length} files to .opencode/ (agents, masks)`);
    // Show prominent restart message for first-time installation
    pluginLog(client, 'warn', `⚠️ RESTART REQUIRED: Please restart OpenCode to activate all Maskweaver features (agents, masks, commands).`);
  }

  if (installResult.errors.length > 0) {
    pluginLog(client, 'warn', `Asset errors: ${installResult.errors.join(', ')}`);
  }

  // ==========================================================================
  // 2b. Auto-create/migrate default config files (global first, then project)
  // ==========================================================================
  const globalConfigDir = path.join(os.homedir(), '.config', 'opencode');

  // Migrate/update global config with missing fields
  const globalConfigPath = path.join(globalConfigDir, 'maskweaver.config.json');
  if (fs.existsSync(globalConfigPath)) {
    try {
      const existing = JSON.parse(fs.readFileSync(globalConfigPath, 'utf-8'));
      let migrated = false;
      if (!existing.operator) { existing.operator = { model: 'opencode-go/deepseek-v4-pro', maxConcurrent: 2, description: 'Squad Operator model' }; migrated = true; }
      if (!existing.gdc) { existing.gdc = { enabled: 'auto', strictVerify: false, autoSyncOnPrepare: true }; migrated = true; }
      if (migrated) {
        fs.writeFileSync(globalConfigPath, JSON.stringify(existing, null, 2) + '\n', 'utf-8');
        pluginLog(client, 'info', 'Migrated global config with operator and gdc fields');
      }
    } catch { }
  }

  const createdGlobalConfig = writeDefaultRuntimeConfig(globalConfigDir);
  if (createdGlobalConfig) {
    pluginLog(client, 'info', `Created global config: ${path.relative(os.homedir(), createdGlobalConfig)}`);
  }

  // Auto-detect subscription from opencode.json and create project config if missing
  const autoDetected = writeAutoDetectedConfig(directory);
  if (autoDetected) {
    pluginLog(client, 'info', `Auto-detected subscription: ${autoDetected.detection.primary} (${autoDetected.detection.subscriptions.join(', ')}) — created ${path.relative(directory, autoDetected.path)}`);
  }

  const createdRuntimeConfig = !autoDetected ? writeDefaultRuntimeConfig(directory) : null;
  if (createdRuntimeConfig) {
    pluginLog(client, 'info', `Created project config: ${path.relative(directory, createdRuntimeConfig)}`);
  }

  const createdPluginConfig = writeDefaultPluginConfig(directory);
  if (createdPluginConfig) {
    pluginLog(client, 'info', `Created plugin config: ${path.relative(directory, createdPluginConfig)}`);
  }

  // ==========================================================================
  // 2c. Generate pool agents from maskweaver.config.json (dummyHumans.pool)
  // ==========================================================================
  const generatedAgents = generatePoolAgents(directory);
  if (generatedAgents.length > 0) {
    pluginLog(client, 'info', `Generated ${generatedAgents.length} pool agent files from maskweaver.config.json: ${generatedAgents.map(p => path.basename(p)).join(', ')}`);
    pluginLog(client, 'warn', `⚠️ RESTART REQUIRED: Please restart OpenCode to activate the new pool agent files.`);
  }

  // If project config was just created but pool has no agents, warn user
  if (createdRuntimeConfig && generatedAgents.length === 0) {
    pluginLog(client, 'warn', `⚠️ maskweaver.config.json was created. Edit it to configure your model pool, then restart OpenCode.`);
  }

  // ==========================================================================
  // 3. Initialize masks
  // ==========================================================================
  const homeDir = os.homedir();
  const globalMasksDir = path.join(homeDir, '.config', 'opencode', 'masks');
  const projectMasksDir = path.join(directory, '.opencode', 'masks');

  // Priority: project masks > global masks
  const masksDir = fs.existsSync(projectMasksDir) ? projectMasksDir : globalMasksDir;

  const pluginState: PluginState = {
    maskLoader: null,
    activeMask: null,
    masksDir,
    config: pluginConfig,
    currentSessionID: null,
  };
  state = pluginState;

  // Log plugin loaded
  pluginLog(client, 'info', `Maskweaver plugin loaded v${VERSION}`);

  if (fs.existsSync(masksDir)) {
    pluginState.maskLoader = new MaskLoader(masksDir, pluginConfig);
    try {
      await pluginState.maskLoader.loadCatalog();
      if (verbose) {
          pluginLog(client, 'info', `Masks found at: ${masksDir}`);
      }
    } catch (e) {
      pluginLog(client, 'warn', `Failed to load masks: ${e}`);
      pluginState.maskLoader = null;
    }
  }

  // ==========================================================================
  // 4. Auto-activate default mask (oh-my-opencode pattern)
  // ==========================================================================
  const defaultMaskId = getDefaultMask(pluginConfig);
  const autoActivate = isAutoActivateEnabled(pluginConfig);

  if (defaultMaskId && autoActivate && pluginState.maskLoader) {
    try {
      const defaultMask = await pluginState.maskLoader.load(defaultMaskId);
      if (defaultMask) {
        pluginState.activeMask = defaultMask;
        pluginLog(client, 'info', `Auto-activated default mask: ${defaultMaskId} (${defaultMask.profile.name})`);
      } else {
        pluginLog(client, 'warn', `Default mask "${defaultMaskId}" not found or disabled`);
      }
    } catch (e) {
      pluginLog(client, 'warn', `Failed to auto-activate default mask: ${e}`);
    }
  }

  // ==========================================================================
  // 5. Helper functions for tool factories
  // ==========================================================================
  const getActiveMask = () => pluginState.activeMask;
  const setActiveMask = (mask: LoadedMask | null) => {
    pluginState.activeMask = mask;
  };

  // ==========================================================================
  // 6. Conditional tool registration (oh-my-opencode pattern)
  // ==========================================================================
  const isToolActive = (toolName: string) => isToolEnabled(pluginConfig, toolName);

  // Helper to ensure tool arguments are compatible with opencode's expected format.
  // opencode expects a ZodRawShape (raw object), NOT a ZodObject instance.
  // Zod 4: schema.def.shape, Zod 3: schema._def.shape()
  const wrapSchema = (schema: any): z.ZodRawShape => {
    if (!schema || typeof schema !== 'object') return schema;

    // Zod 4 — def.shape is a plain object
    if (schema.def && typeof schema.def === 'object' && schema.type === 'object' && schema.def.shape && typeof schema.def.shape === 'object') {
      return schema.def.shape as z.ZodRawShape;
    }

    // Zod 3 — _def.shape() returns a plain object
    if (schema._def && typeof schema._def.shape === 'function') {
      return schema._def.shape() as z.ZodRawShape;
    }

    return schema as z.ZodRawShape;
  };

  const tools: Record<string, any> = {};

  if (pluginState.maskLoader) {
    if (isToolActive('list_masks')) {
      const tool = createListMasksTool(pluginState.maskLoader, getActiveMask);
      tool.args = wrapSchema(tool.args) as any;
      tools.list_masks = tool;
    }

    if (isToolActive('select_mask')) {
      const tool = createSelectMaskTool(pluginState.maskLoader, getActiveMask, setActiveMask);
      tool.args = wrapSchema(tool.args) as any;
      tools.select_mask = tool;
    }

    if (isToolActive('deselect_mask')) {
      const tool = createDeselectMaskTool(getActiveMask, setActiveMask);
      tool.args = wrapSchema(tool.args) as any;
      tools.deselect_mask = tool;
    }

    if (isToolActive('get_mask_prompt')) {
      const tool = createGetMaskPromptTool(pluginState.maskLoader, getActiveMask);
      tool.args = wrapSchema(tool.args) as any;
      tools.get_mask_prompt = tool;
    }
  }

  if (isToolActive('maskweaver_status')) {
    const tool = createMaskweaverStatusTool(pluginState.maskLoader, masksDir, getActiveMask);
    tool.args = wrapSchema(tool.args) as any;
    tools.maskweaver_status = tool;
  }

  // Memory tools
  if (isToolActive('memory_search')) {
    const memorySearchTool = createMemorySearchTool();
    tools.memory_search = {
      description: memorySearchTool.description,
      args: wrapSchema(memorySearchTool.args) as any,
      execute: (args: any) => memorySearchTool.execute(args, { worktree: directory }),
    };
  }

  if (isToolActive('memory_write')) {
    const memoryWriteTool = createMemoryWriteTool();
    tools.memory_write = {
      description: memoryWriteTool.description,
      args: wrapSchema(memoryWriteTool.args) as any,
      execute: (args: any) => memoryWriteTool.execute(args, { worktree: directory }),
    };
  }

  if (isToolActive('memory_get')) {
    const memoryGetTool = createMemoryGetTool();
    tools.memory_get = {
      description: memoryGetTool.description,
      args: wrapSchema(memoryGetTool.args) as any,
      execute: (args: any) => memoryGetTool.execute(args, { worktree: directory }),
    };
  }

  if (isToolActive('memory_indexer')) {
    const memoryIndexerTool = createMemoryIndexerTool();
    tools.memory_indexer = {
      description: memoryIndexerTool.description,
      args: wrapSchema(memoryIndexerTool.args) as any,
      execute: (args: any) => memoryIndexerTool.execute(args, { worktree: directory }),
    };
  }

  // Context tool
  if (isToolActive('context')) {
    const contextTool = createContextTool();
    tools.context = {
      description: contextTool.description,
      args: wrapSchema(contextTool.args) as any,
      execute: (args: any) => contextTool.execute(args, { worktree: directory }),
    };
  }

  // Retrospect tool
  if (isToolActive('retrospect')) {
    const retrospectTool = createRetrospectTool();
    tools.retrospect = {
      description: retrospectTool.description,
      args: wrapSchema(retrospectTool.args) as any,
      execute: (args: any) => retrospectTool.execute(args, { worktree: directory }),
    };
  }

  // Mask save tool
  if (isToolActive('mask_save')) {
    const maskSaveTool = createMaskSaveTool();
    tools.mask_save = {
      description: maskSaveTool.description,
      args: wrapSchema(maskSaveTool.args) as any,
      execute: (args: any) => maskSaveTool.execute(args, { worktree: directory }),
    };
  }

  // Squad tool (multi-agent collaboration)
  if (isToolActive('squad')) {
    const squadTool = createSquadTool();
    tools.squad = {
      description: squadTool.description,
      args: wrapSchema(squadTool.args) as any,
      execute: (args: any) => squadTool.execute(args, { worktree: directory }),
    };
  }

  // Weave tool (phase-driven development workflow)
  if (isToolActive('weave')) {
    const weaveTool = createWeaveTool();
    tools.weave = {
      description: weaveTool.description,
      args: wrapSchema(weaveTool.args) as any,
      execute: (args: any) => weaveTool.execute(args, { worktree: directory }),
    };
  }

  // Slashcommand tool (handles /weave etc. on first run without restart)
  if (isToolActive('slashcommand')) {
    const slashcommandTool = createSlashcommandTool(getAssetsDir());
    tools.slashcommand = {
      description: slashcommandTool.description,
      args: wrapSchema(slashcommandTool.args) as any,
      execute: (args: any) => slashcommandTool.execute(args, { worktree: directory }),
    };
  }

  // ==========================================================================
  // 8. Agents are loaded from .opencode/agents/*.md files by OpenCode's
  //    filesystem-based agent loader (see config/agent.ts:110-140).
  //    installAssets() in step 2 copies agent .md files so they are picked up.
  //    The 'agent' property in Hooks is NOT consumed by OpenCode — confirmed
  //    by source analysis (packages/opencode/src/plugin/index.ts:92-103).
  // ==========================================================================

  // ==========================================================================
  // 9. Return plugin hooks (official OpenCode Hooks interface only)
  //    Note: Agents are registered via .opencode/agents/*.md files (installed by
  //    installAssets()), NOT via the plugin return. The Hooks type does not
  //    include 'agent' — OpenCode loads agents from the filesystem exclusively.
  // ==========================================================================
  return {
    // Agent registration handled via .opencode/agents/*.md files (see installAssets)

    // System prompt transform - inject active mask
    'experimental.chat.system.transform': async (_input, output) => {
      if (state?.activeMask) {
        const maskPrompt = `<ACTIVE_PERSONA>
You are currently embodying the "${state.activeMask.profile.name}" persona.

${buildRichPrompt(state.activeMask)}
</ACTIVE_PERSONA>`;

        (output.system ||= []).push(maskPrompt);
      }
    },

    // Conditional tools
    tool: tools,

    // Event hooks (oh-my-opencode pattern)
    event: async ({ event }) => {
      // Session created - log available masks
      if (event.type === 'session.created') {
        pluginState.currentSessionID = getSessionId(event);

        if (pluginState.maskLoader && verbose) {
          try {
            const masks = await pluginState.maskLoader.listAll();
            const categories = await pluginState.maskLoader.listCategories();
            pluginLog(client, 'info', `Session started - ${masks.length} masks available across ${categories.length} categories`);
          } catch (_e) {
            // Ignore errors
          }
        }
      }

      // Session idle - generation completed
      if (event.type === 'session.idle') {
        const idleSessionID = getSessionId(event);
        const isCurrentSession =
          !idleSessionID ||
          !pluginState.currentSessionID ||
          idleSessionID === pluginState.currentSessionID;

        if (isCurrentSession) {
          playCompletionSound(pluginState.config);
        }
      }

      // Session deleted - cleanup
      if (event.type === 'session.deleted') {
        const deletedSessionID = getSessionId(event);
        if (!deletedSessionID || deletedSessionID === pluginState.currentSessionID) {
          pluginState.currentSessionID = null;
        }

        if (verbose) {
          const wasActive = pluginState.activeMask !== null;
          pluginState.activeMask = null;

          if (wasActive) {
            pluginLog(client, 'info', 'Session ended - active mask cleared');
          }
        }
      }
    },

    // Config hook - allows plugins to modify opencode configuration
    config: async (config: any) => {
      // opencode discovers slash commands from config.command and command files.
      // installAssets() writes command files for subsequent starts, while this
      // hook makes the direct /build command visible on the current plugin load.
      config.command ||= {};
      config.command.build ||= {
        description: 'Run or manage the Maskweaver autonomous build loop',
        template: BUILD_COMMAND_TEMPLATE,
      };
      return;
    },
  };
};

export default {
  id: 'maskweaver',
  server: MaskweaverPlugin,
};
