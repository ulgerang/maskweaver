 /**
 * Maskweaver Plugin for opencode
 * 
 * v0.6.0 - Memory, Context, and Retrospect tools integration
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

import { tool, type Plugin } from '@opencode-ai/plugin';
const z = tool.schema;
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { fileURLToPath } from 'node:url';
import { parse as parseYaml } from 'yaml';
import {
  loadPluginConfig,
  isMaskEnabled,
  isToolEnabled,
  getDefaultMask,
  isAutoActivateEnabled,
  getAgentOverride,
  isVerboseLoggingEnabled,
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

// ============================================================================
// Asset Installer
// ============================================================================

interface InstallResult {
  installed: string[];
  skipped: string[];
  errors: string[];
}

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

function copyDirRecursive(src: string, dest: string, result: InstallResult): void {
  if (!fs.existsSync(src)) return;
  
  if (!fs.existsSync(dest)) {
    fs.mkdirSync(dest, { recursive: true });
  }
  
  const entries = fs.readdirSync(src, { withFileTypes: true });
  
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    
    if (entry.isDirectory()) {
      copyDirRecursive(srcPath, destPath, result);
    } else {
      // Only copy if destination doesn't exist (don't overwrite user customizations)
      if (!fs.existsSync(destPath)) {
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
    
    // Install commands (if any)
    const commandsSrc = path.join(assetsDir, 'commands');
    const commandsDest = path.join(targetDir, 'commands');
    if (fs.existsSync(commandsSrc)) {
      copyDirRecursive(commandsSrc, commandsDest, result);
    }
  }
  
  return result;
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
// Tool Factory Functions (oh-my-opencode pattern)
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
        lines.push(`Maskweaver v0.6.0 - ${filtered.length} masks available`);
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
      return `Maskweaver v0.6.0
Masks directory: ${masksDir}
Available: ${maskLoader ? 'yes' : 'no'}
Total masks: ${masksCount}
Categories: ${categoriesCount}
Active mask: ${active ? `${active.profile.name} (${active.metadata.id})` : 'none'}`;
    },
  };
}

// ============================================================================
// Plugin State
// ============================================================================

interface PluginState {
  maskLoader: MaskLoader | null;
  activeMask: LoadedMask | null;
  masksDir: string;
  config: MaskweaverPluginConfig;
}

let state: PluginState | null = null;

// ============================================================================
// Plugin (oh-my-opencode pattern)
// ============================================================================

// ============================================================================
// Agent Utilities
// ============================================================================

interface AgentDefinition {
  name?: string;
  description?: string;
  mode?: 'primary' | 'subagent';
  model?: string;
  temperature?: number;
  prompt?: string;
  tools?: Record<string, boolean>;
  permission?: Record<string, string | Record<string, string>>;
}

function parseAgentMarkdown(content: string): AgentDefinition {
  const parts = content.split('---');
  if (parts.length < 3) {
    return { prompt: content.trim() };
  }
  
  try {
    const frontmatter = parseYaml(parts[1]);
    const prompt = parts.slice(2).join('---').trim();
    return { ...frontmatter, prompt };
  } catch (e) {
    return { prompt: content.trim() };
  }
}

function loadAgentAssets(assetsDir: string): Record<string, AgentDefinition> {
  const agentsDir = path.join(assetsDir, 'agents');
  const agents: Record<string, AgentDefinition> = {};
  
  if (!fs.existsSync(agentsDir)) return agents;
  
  try {
    const files = fs.readdirSync(agentsDir);
    for (const file of files) {
      if (file.endsWith('.md') && file !== 'dummy-template.md') {
        const agentId = path.basename(file, '.md');
        const content = fs.readFileSync(path.join(agentsDir, file), 'utf-8');
        agents[agentId] = parseAgentMarkdown(content);
      }
    }
  } catch (e) {
    // Ignore errors
  }
  
  return agents;
}

export const MaskweaverPlugin: Plugin = async ({ client, directory }) => {
  // ==========================================================================
  // 1. Load Configuration (oh-my-opencode pattern)
  // ==========================================================================
  const pluginConfig = loadPluginConfig(directory, { client, verbose: false });
  
  // Validate configuration
  const configErrors = validateConfig(pluginConfig);
  if (configErrors.length > 0) {
    client.app.log({
      service: 'maskweaver',
      level: 'warn',
      message: `Configuration validation errors: ${configErrors.join(', ')}`,
    });
  }
  
  const verbose = isVerboseLoggingEnabled(pluginConfig);
  
  // ==========================================================================
  // 2. Auto-install assets on first run
  // ==========================================================================
  const installResult = installAssets(directory);
  
  if (installResult.installed.length > 0) {
    client.app.log({
      service: 'maskweaver',
      level: 'info',
      message: `Installed ${installResult.installed.length} files to .opencode/ (agents, masks)`,
    });
  }
  
  if (installResult.errors.length > 0) {
    client.app.log({
      service: 'maskweaver',
      level: 'warn',
      message: `Asset errors: ${installResult.errors.join(', ')}`,
    });
  }
  
  // ==========================================================================
  // 3. Initialize masks
  // ==========================================================================
  const homeDir = os.homedir();
  const globalMasksDir = path.join(homeDir, '.config', 'opencode', 'masks');
  const projectMasksDir = path.join(directory, '.opencode', 'masks');
  
  // Priority: project masks > global masks
  const masksDir = fs.existsSync(projectMasksDir) ? projectMasksDir : globalMasksDir;
  
  state = {
    maskLoader: null,
    activeMask: null,
    masksDir,
    config: pluginConfig,
  };
  
  // Log plugin loaded
  client.app.log({
    service: 'maskweaver',
    level: 'info',
    message: `Maskweaver plugin loaded v0.6.0 (oh-my-opencode pattern)`,
  });
  
  if (fs.existsSync(masksDir)) {
    state.maskLoader = new MaskLoader(masksDir, pluginConfig);
    try {
      await state.maskLoader.loadCatalog();
      if (verbose) {
        client.app.log({
          service: 'maskweaver',
          level: 'info',
          message: `Masks found at: ${masksDir}`,
        });
      }
    } catch (e) {
      client.app.log({
        service: 'maskweaver',
        level: 'warn',
        message: `Failed to load masks: ${e}`,
      });
      state.maskLoader = null;
    }
  }
  
  // ==========================================================================
  // 4. Auto-activate default mask (oh-my-opencode pattern)
  // ==========================================================================
  const defaultMaskId = getDefaultMask(pluginConfig);
  const autoActivate = isAutoActivateEnabled(pluginConfig);
  
  if (defaultMaskId && autoActivate && state.maskLoader) {
    try {
      const defaultMask = await state.maskLoader.load(defaultMaskId);
      if (defaultMask) {
        state.activeMask = defaultMask;
        client.app.log({
          service: 'maskweaver',
          level: 'info',
          message: `Auto-activated default mask: ${defaultMaskId} (${defaultMask.profile.name})`,
        });
      } else {
        client.app.log({
          service: 'maskweaver',
          level: 'warn',
          message: `Default mask "${defaultMaskId}" not found or disabled`,
        });
      }
    } catch (e) {
      client.app.log({
        service: 'maskweaver',
        level: 'warn',
        message: `Failed to auto-activate default mask: ${e}`,
      });
    }
  }
  
  // ==========================================================================
  // 5. Helper functions for tool factories
  // ==========================================================================
  const getActiveMask = () => state?.activeMask || null;
  const setActiveMask = (mask: LoadedMask | null) => {
    if (state) state.activeMask = mask;
  };
  
  // ==========================================================================
  // 6. Conditional tool registration (oh-my-opencode pattern)
  // ==========================================================================
  const isToolActive = (toolName: string) => isToolEnabled(pluginConfig, toolName);
  
  // Helper to ensure tool arguments are compatible with opencode's expected format.
  // opencode expects a ZodRawShape (raw object), NOT a ZodObject instance.
  const wrapSchema = (schema: any): any => {
    if (!schema || typeof schema !== 'object') return schema;
    
    // If it's a ZodObject (Zod 4), extract its shape
    if (schema.def && typeof schema.def === 'object' && schema.type === 'object') {
      return schema.def.shape;
    }
    
    // If it's a ZodObject (Zod 3), extract its shape
    if (schema._def && typeof schema._def.shape === 'function') {
      return schema._def.shape();
    }
    
    return schema;
  };

  const tools: Record<string, any> = {};
  
  if (state.maskLoader) {
    if (isToolActive('list_masks')) {
      const tool = createListMasksTool(state.maskLoader, getActiveMask);
      tool.args = wrapSchema(tool.args);
      tools.list_masks = tool;
    }
    
    if (isToolActive('select_mask')) {
      const tool = createSelectMaskTool(state.maskLoader, getActiveMask, setActiveMask);
      tool.args = wrapSchema(tool.args);
      tools.select_mask = tool;
    }
    
    if (isToolActive('deselect_mask')) {
      const tool = createDeselectMaskTool(getActiveMask, setActiveMask);
      tool.args = wrapSchema(tool.args);
      tools.deselect_mask = tool;
    }
    
    if (isToolActive('get_mask_prompt')) {
      const tool = createGetMaskPromptTool(state.maskLoader, getActiveMask);
      tool.args = wrapSchema(tool.args);
      tools.get_mask_prompt = tool;
    }
  }
  
  if (isToolActive('maskweaver_status')) {
    const tool = createMaskweaverStatusTool(state.maskLoader, masksDir, getActiveMask);
    tool.args = wrapSchema(tool.args);
    tools.maskweaver_status = tool;
  }

  // Memory tools
  if (isToolActive('memory_search')) {
    const memorySearchTool = createMemorySearchTool();
    tools.memory_search = {
      description: memorySearchTool.description,
      args: wrapSchema(memorySearchTool.args),
      execute: (args: any) => memorySearchTool.execute(args, { worktree: directory }),
    };
  }

  if (isToolActive('memory_write')) {
    const memoryWriteTool = createMemoryWriteTool();
    tools.memory_write = {
      description: memoryWriteTool.description,
      args: wrapSchema(memoryWriteTool.args),
      execute: (args: any) => memoryWriteTool.execute(args, { worktree: directory }),
    };
  }

  if (isToolActive('memory_get')) {
    const memoryGetTool = createMemoryGetTool();
    tools.memory_get = {
      description: memoryGetTool.description,
      args: wrapSchema(memoryGetTool.args),
      execute: (args: any) => memoryGetTool.execute(args, { worktree: directory }),
    };
  }

  if (isToolActive('memory_indexer')) {
    const memoryIndexerTool = createMemoryIndexerTool();
    tools.memory_indexer = {
      description: memoryIndexerTool.description,
      args: wrapSchema(memoryIndexerTool.args),
      execute: (args: any) => memoryIndexerTool.execute(args, { worktree: directory }),
    };
  }

  // Context tool
  if (isToolActive('context')) {
    const contextTool = createContextTool();
    tools.context = {
      description: contextTool.description,
      args: wrapSchema(contextTool.args),
      execute: (args: any) => contextTool.execute(args, { worktree: directory }),
    };
  }

  // Retrospect tool
  if (isToolActive('retrospect')) {
    const retrospectTool = createRetrospectTool();
    tools.retrospect = {
      description: retrospectTool.description,
      args: wrapSchema(retrospectTool.args),
      execute: (args: any) => retrospectTool.execute(args, { worktree: directory }),
    };
  }

  // Mask save tool
  if (isToolActive('mask_save')) {
    const maskSaveTool = createMaskSaveTool();
    tools.mask_save = {
      description: maskSaveTool.description,
      args: wrapSchema(maskSaveTool.args),
      execute: (args: any) => maskSaveTool.execute(args, { worktree: directory }),
    };
  }

  // Squad tool (multi-agent collaboration)
  if (isToolActive('squad')) {
    const squadTool = createSquadTool();
    tools.squad = {
      description: squadTool.description,
      args: wrapSchema(squadTool.args),
      execute: (args: any) => squadTool.execute(args, { worktree: directory }),
    };
  }
  
  // ==========================================================================
  // 8. Load and register agents
  // ==========================================================================
  const assetsDir = getAssetsDir();
  const loadedAgents = loadAgentAssets(assetsDir);
  
  // Add variants for dummy-human
  if (loadedAgents['dummy-human']) {
    if (!loadedAgents['dummy-flash']) {
      loadedAgents['dummy-flash'] = {
        ...loadedAgents['dummy-human'],
        description: 'Dummy-Human (Flash) - Fast and cheap',
        model: 'google/gemini-2.0-flash',
      };
    }
    if (!loadedAgents['dummy-premium']) {
      loadedAgents['dummy-premium'] = {
        ...loadedAgents['dummy-human'],
        description: 'Dummy-Human (Premium) - Powerful and reasoning',
        model: 'google/gemini-2.0-pro-exp-02-05',
      };
    }
  }

  // Apply config overrides to agents
  for (const agentId of Object.keys(loadedAgents)) {
    const override = getAgentOverride(pluginConfig, agentId);
    if (override) {
      if (override.model) loadedAgents[agentId].model = override.model;
      if (override.systemPrompt) loadedAgents[agentId].prompt = override.systemPrompt;
    }
  }

  // ==========================================================================
  // 9. Return plugin hooks
  // ==========================================================================
  return {
    // Agent registration
    agent: loadedAgents,

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
        if (state?.maskLoader && verbose) {
          try {
            const masks = await state.maskLoader.listAll();
            const categories = await state.maskLoader.listCategories();
            client.app.log({
              service: 'maskweaver',
              level: 'info',
              message: `Session started - ${masks.length} masks available across ${categories.length} categories`,
            });
          } catch (_e) {
            // Ignore errors
          }
        }
      }
      
      // Session deleted - cleanup
      if (event.type === 'session.deleted') {
        if (state && verbose) {
          const wasActive = state.activeMask !== null;
          state.activeMask = null;
          
          if (wasActive) {
            client.app.log({
              service: 'maskweaver',
              level: 'info',
              message: 'Session ended - active mask cleared',
            });
          }
        }
      }
    },
    
    // Config hook - (oh-my-opencode pattern)
    config: async (config: any) => {
      // NOTE: Current opencode version expects config to be a function, not an object.
      // Agent overrides are currently not supported via this hook in opencode core.
      return;
    },
  };
};

export default MaskweaverPlugin;
