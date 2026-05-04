/**
 * Command Registry for Weave Tool
 *
 * Loads commands.json and provides alias resolution, deprecation warnings,
 * and dynamic description/help generation.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

// ============================================================================
// Types
// ============================================================================

export interface CommandArg {
    name: string;
    type: 'string' | 'boolean' | 'number' | 'enum';
    required?: boolean;
    default?: unknown;
    values?: string[];
    min?: number;
    max?: number;
    description?: string;
}

export interface CommandEntry {
    name: string;
    aliases: string[];
    deprecatedAliases: string[];
    deprecatedSince?: string;
    removedIn?: string;
    migration?: string;
    description: string;
    descriptionEn?: string;
    category: string;
    args: CommandArg[];
    mdFile: string;
    handler: string;
    examples: string[];
}

export interface CommandsJson {
    schemaVersion: string;
    lastUpdated: string;
    commands: CommandEntry[];
}

// ============================================================================
// Inline Default (fail-safe fallback when commands.json cannot be loaded)
// ============================================================================

const INLINE_DEFAULT: CommandsJson = {
    schemaVersion: '1.0',
    lastUpdated: '2026-04-29',
    commands: [
        {
            name: 'init',
            aliases: [],
            deprecatedAliases: [],
            description: 'Initialize weave workspace files and probe GDC integration',
            category: 'meta',
            args: [],
            mdFile: 'weave-init.md',
            handler: 'handleInit',
            examples: ['weave command=init'],
        },
        {
            name: 'map',
            aliases: [],
            deprecatedAliases: [],
            description: 'Analyze codebase structure via GDC + Graphify (knowledge graph)',
            category: 'analysis',
            args: [
                { name: 'deep', type: 'boolean', default: false, description: 'Run deep analysis with graphify-windows skill' },
            ],
            mdFile: 'weave-map.md',
            handler: 'handleMap',
            examples: ['weave command=map', 'weave command=map deep=true'],
        },
        {
            name: 'interview',
            aliases: [],
            deprecatedAliases: [],
            description: 'Multi-step question asking until clarity, with structural change detection',
            category: 'analysis',
            args: [
                { name: 'docsPath', type: 'string', required: false, description: 'Path to requirements documents' },
            ],
            mdFile: 'weave-interview.md',
            handler: 'handleInterview',
            examples: ['weave command=interview', 'weave command=interview docsPath="docs/"'],
        },
        {
            name: 'prepare',
            aliases: [],
            deprecatedAliases: [],
            description: 'Create research + spec + plan with defaults (auto-splits oversized plans)',
            category: 'planning',
            args: [
                { name: 'docsPath', type: 'string', required: false, description: 'Path to requirements documents' },
                { name: 'planName', type: 'string', required: false, description: 'Plan name (kebab-case)' },
                { name: 'splitPlans', type: 'boolean', default: true, description: 'Auto-split oversized plans into multiple shard plan files' },
                { name: 'splitMaxPhases', type: 'number', default: 3, min: 2, max: 8, description: 'Max phases per shard when splitPlans is enabled' },
                { name: 'splitMaxHours', type: 'number', default: 10, min: 4, max: 40, description: 'Max estimated hours per shard when splitPlans is enabled' },
            ],
            mdFile: 'weave-prepare.md',
            handler: 'handlePrepare',
            examples: ['weave command=prepare docsPath="docs/"', 'weave command=prepare docsPath="docs/" planName="emotion-diary"'],
        },
        {
            name: 'refine-plan',
            aliases: [],
            deprecatedAliases: [],
            description: 'Apply structured plan-note directives to active plan',
            category: 'planning',
            args: [
                { name: 'notesPath', type: 'string', required: false, description: 'Path to structured plan notes (default: tasks/plan-notes.md)' },
                { name: 'applyNotes', type: 'boolean', default: true, description: 'Auto-apply plan notes during approve' },
            ],
            mdFile: 'weave-refine-plan.md',
            handler: 'handleRefinePlan',
            examples: ['weave command=refine-plan'],
        },
        {
            name: 'approve',
            aliases: [],
            deprecatedAliases: [],
            description: 'Approve the plan, or finalize a crafted phase when phaseId is provided',
            category: 'planning',
            args: [
                { name: 'phaseId', type: 'string', required: false, description: 'Phase ID to finalize (optional)' },
                { name: 'planReview', type: 'string', required: false, description: 'Plan review summary text' },
                { name: 'applyNotes', type: 'boolean', default: true, description: 'Auto-apply plan notes during approve' },
            ],
            mdFile: 'weave-approve.md',
            handler: 'handleApprove',
            examples: ['weave command=approve', 'weave command=approve phaseId="P1"'],
        },
        {
            name: 'craft',
            aliases: [],
            deprecatedAliases: [],
            description: '[DEPRECATED] Use build instead — it now auto-approves and runs craft+build+verify',
            category: 'execution',
            args: [
                { name: 'phaseId', type: 'string', required: false, description: 'Phase ID (auto-select if omitted)' },
                { name: 'projectType', type: 'string', required: false, description: 'Project type hint (react, nextjs, go, etc.)' },
            ],
            mdFile: 'weave-craft.md',
            handler: 'handleCraft',
            examples: ['weave command=build (use this instead)'],
        },
        {
            name: 'build',
            aliases: [],
            deprecatedAliases: [],
            description: 'Autonomous build loop — run, resume, or inspect builds',
            category: 'execution',
            args: [
                { name: 'action', type: 'enum', values: ['run', 'status', 'stop', 'list', 'resume', 'sync'], default: 'run', description: 'Build sub-action' },
                { name: 'phaseIds', type: 'string', required: false, description: 'Comma-separated phase IDs for run action' },
                { name: 'buildId', type: 'string', required: false, description: 'Build ID for status/stop/resume/sync actions' },
                { name: 'maxRetries', type: 'number', default: 3, min: 1, max: 10, description: 'Maximum retries per task (for run action)' },
                { name: 'taskResults', type: 'string', required: false, description: 'JSON array of TaskResult from previous wave (for resume)' },
                { name: 'maxIterations', type: 'number', default: 1, min: 1, max: 20, description: 'Maximum loop iterations before blocking' },
                { name: 'maxNoProgress', type: 'number', default: 1, min: 0, max: 10, description: 'Maximum repeated no-progress failures before blocking' },
            ],
            mdFile: 'weave-build.md',
            handler: 'handleBuild',
            examples: [
                'weave command=build',
                'weave command=build action=run phaseIds="P1,P2"',
                'weave command=build action=status buildId="build-20250428-a1b2"',
                'weave command=build action=resume buildId="build-20250428-a1b2"',
                'weave command=build action=list',
            ],
        },
        {
            name: 'status',
            aliases: [],
            deprecatedAliases: [],
            description: 'View overall progress',
            category: 'management',
            args: [],
            mdFile: 'weave-status.md',
            handler: 'handleStatus',
            examples: ['weave command=status'],
        },
        {
            name: 'worktree',
            aliases: [],
            deprecatedAliases: [],
            description: 'Manage git worktrees for parallel work',
            category: 'management',
            args: [
                { name: 'worktreeAction', type: 'enum', values: ['create', 'list', 'open', 'remove', 'merge'], required: false, description: 'Worktree action' },
                { name: 'name', type: 'string', required: false, description: 'Worktree name' },
                { name: 'fromRef', type: 'string', required: false, description: 'Base git ref to branch from' },
                { name: 'deleteBranch', type: 'boolean', default: false, description: 'Delete branch when removing worktree' },
            ],
            mdFile: 'weave-worktree.md',
            handler: 'handleWorktree',
            examples: ['weave command=worktree worktreeAction=list'],
        },
        {
            name: 'verify',
            aliases: [],
            deprecatedAliases: [],
            description: 'Run build/test verification for current worktree',
            category: 'management',
            args: [
                { name: 'verifyMode', type: 'enum', values: ['quick', 'full'], default: 'full', description: 'Verification mode' },
                { name: 'projectType', type: 'string', required: false, description: 'Project type hint' },
            ],
            mdFile: 'weave-verify.md',
            handler: 'handleVerify',
            examples: ['weave command=verify', 'weave command=verify verifyMode=quick'],
        },
        {
            name: 'archive',
            aliases: [],
            deprecatedAliases: [],
            description: 'Archive the verified active change artifact',
            category: 'management',
            args: [],
            mdFile: 'weave-archive.md',
            handler: 'handleArchive',
            examples: ['weave command=archive'],
        },
        {
            name: 'troubleshoot',
            aliases: [],
            deprecatedAliases: [],
            description: 'Search global knowledge for solutions or record a new one',
            category: 'knowledge',
            args: [
                { name: 'error', type: 'string', required: false, description: 'Error message to search solutions for' },
                { name: 'record', type: 'boolean', default: false, description: 'Record a new solution instead of searching' },
                { name: 'solution', type: 'string', required: false, description: 'Solution to record (when record=true)' },
                { name: 'context', type: 'string', required: false, description: 'Context for the troubleshooting entry' },
            ],
            mdFile: 'weave-troubleshoot.md',
            handler: 'handleTroubleshoot',
            examples: [
                'weave command=troubleshoot error="Cannot find module \'xyz\'"',
                'weave command=troubleshoot record=true solution="Restart dev server"',
            ],
        },
        {
            name: 'repair',
            aliases: [],
            deprecatedAliases: [],
            description: 'Scan and auto-repair corrupted plan YAML files',
            category: 'knowledge',
            args: [],
            mdFile: 'weave-repair.md',
            handler: 'handleRepair',
            examples: ['weave command=repair'],
        },
        {
            name: 'agents',
            aliases: [],
            deprecatedAliases: [],
            description: 'Sync dummy-human agent files and initialize configuration',
            category: 'configuration',
            args: [
                { name: 'sync', type: 'boolean', default: false, description: 'Force regenerate agent .md files from config pool' },
                { name: 'init', type: 'boolean', default: false, description: 'Create default maskweaver.config.json with pool template' },
                { name: 'force', type: 'boolean', default: false, description: 'Force re-detect subscription and overwrite maskweaver.config.json' },
            ],
            mdFile: 'weave-agents.md',
            handler: 'handleAgents',
            examples: [
                'weave command=agents sync=true',
                'weave command=agents init=true',
                'weave command=agents force=true',
            ],
        },
        {
            name: 'help',
            aliases: [],
            deprecatedAliases: [],
            description: 'Show weave workflow help',
            category: 'meta',
            args: [],
            mdFile: 'weave-help.md',
            handler: 'getHelpMessage',
            examples: ['weave command=help'],
        },
    ],
};

// ============================================================================
// Resolution
// ============================================================================

let _cached: CommandsJson | null = null;
let _cachePath: string | null = null;

function resolveCommandsJsonPath(): string | null {
    // Try relative to dist first, then src (for dev)
    const candidates = [
        path.join(process.cwd(), 'assets', 'commands', 'meta', 'commands.json'),
        path.join(process.cwd(), 'dist', 'assets', 'commands', 'meta', 'commands.json'),
        path.join(__dirname, '..', '..', '..', 'assets', 'commands', 'meta', 'commands.json'),
        path.join(__dirname, '..', '..', '..', '..', 'assets', 'commands', 'meta', 'commands.json'),
    ];
    for (const candidate of candidates) {
        if (fs.existsSync(candidate)) {
            return candidate;
        }
    }
    return null;
}

export function loadCommandsJson(): CommandsJson {
    if (_cached) return _cached;

    const jsonPath = resolveCommandsJsonPath();
    if (jsonPath) {
        try {
            const raw = fs.readFileSync(jsonPath, 'utf-8');
            const parsed = JSON.parse(raw) as CommandsJson;
            _cached = parsed;
            _cachePath = jsonPath;
            return parsed;
        } catch {
            // fall through to inline default
        }
    }

    _cached = INLINE_DEFAULT;
    return _cached;
}

export function getCommandEntry(name: string): CommandEntry | undefined {
    const registry = loadCommandsJson();
    return registry.commands.find(cmd =>
        cmd.name === name ||
        cmd.aliases.includes(name) ||
        cmd.deprecatedAliases.includes(name)
    );
}

export interface ResolvedCommand {
    command: string;
    warning?: string;
    isDeprecatedAlias: boolean;
    entry: CommandEntry;
}

export function resolveCommand(input: string): ResolvedCommand | { error: string } {
    const registry = loadCommandsJson();
    const entry = registry.commands.find(cmd =>
        cmd.name === input ||
        cmd.aliases.includes(input) ||
        cmd.deprecatedAliases.includes(input)
    );

    if (!entry) {
        const known = registry.commands.map(c => c.name).join(', ');
        return { error: `Unknown command: "${input}". Available: ${known}` };
    }

    const isDeprecatedAlias = entry.deprecatedAliases.includes(input);
    const warning = isDeprecatedAlias
        ? `⚠️ "${input}" is deprecated since v${entry.deprecatedSince || '0.9.0'} and will be removed in v${entry.removedIn || '0.10.0'}.\n   Replace with: ${entry.migration || `weave command=${entry.name}`}`
        : undefined;

    return {
        command: entry.name,
        warning,
        isDeprecatedAlias,
        entry,
    };
}

export function getActiveCommandNames(): string[] {
    const registry = loadCommandsJson();
    return registry.commands.map(cmd => cmd.name);
}

export function getAllCommandNamesIncludingAliases(): string[] {
    const registry = loadCommandsJson();
    const names = new Set<string>();
    for (const cmd of registry.commands) {
        names.add(cmd.name);
        for (const alias of cmd.aliases) names.add(alias);
        for (const alias of cmd.deprecatedAliases) names.add(alias);
    }
    return Array.from(names);
}

export function generateToolDescription(): string {
    const registry = loadCommandsJson();
    const lines: string[] = [
        'Weave: Phase-driven development workflow with expert mask auto-selection and cross-project knowledge sharing.',
        '',
        'Commands:',
    ];

    for (const cmd of registry.commands) {
        const aliasText = cmd.aliases.length > 0 ? ` (aliases: ${cmd.aliases.join(', ')})` : '';
        lines.push(`- ${cmd.name}${aliasText}: ${cmd.description}`);
    }

    lines.push('');
    lines.push('Examples:');
    for (const ex of registry.commands.flatMap(c => c.examples).slice(0, 10)) {
        lines.push(`- ${ex}`);
    }

    return lines.join('\n');
}
