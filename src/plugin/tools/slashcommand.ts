/**
 * Slashcommand Tool for OpenCode Plugin
 * 
 * Handles slash commands directly as a tool, inspired by oh-my-opencode.
 * This ensures commands work on first run without requiring restart.
 * 
 * Pattern: Commands are discovered from:
 * 1. Built-in embedded commands (always available)
 * 2. Package assets/commands/ folder
 * 3. Project .opencode/commands/ folder (overrides)
 */

import { tool } from '@opencode-ai/plugin';
const z = tool.schema;

import * as fs from 'node:fs';
import * as path from 'node:path';
import { parse as parseYaml } from 'yaml';

// ============================================================================
// Types
// ============================================================================

interface CommandMetadata {
    name: string;
    description: string;
    usage?: string;
    examples?: string[];
}

interface CommandInfo {
    name: string;
    path?: string;
    metadata: CommandMetadata;
    content: string;
    scope: 'builtin' | 'package' | 'project';
}

// ============================================================================
// Built-in Commands (Always Available)
// ============================================================================

const BUILTIN_COMMANDS: Record<string, { metadata: CommandMetadata; content: string }> = {
    'weave-help': {
        metadata: {
            name: 'weave-help',
            description: 'Weave 워크플로우 도움말',
            usage: '/weave help',
            examples: ['/weave help', '/weave'],
        },
        content: `# /weave help - Weave 워크플로우 도움말

## Weave란?

Maskweaver의 Phase-Driven Development 워크플로우입니다.
"AI가 검증하고, 유저가 확인한다"

---

## 핵심 철학

1. 테스트 먼저 (Protect Before Change)
2. 작게 자주 (Small & Often)
3. 동작이 정답 (Working > Perfect)

---

## 명령어 목록

| 명령어 | 설명 |
|--------|------|
| \`weave design [docs]\` | 요구사항 분석 → Phase 계획 |
| \`weave craft [id]\` | Phase 실행 (자동 검증) |
| \`weave status\` | 진행 상황 확인 |
| \`weave help\` | 이 도움말 |

**Note**: weave 도구를 직접 호출할 수도 있습니다: \`weave command=design docsPath=docs/\`
`,
    },
    'weave-design': {
        metadata: {
            name: 'weave-design',
            description: '요구사항 분석 및 Phase 계획 수립',
            usage: '/weave design [docsPath]',
            examples: ['/weave design docs/', '/weave design wiki/'],
        },
        content: `Use the weave tool with command=design and specify docsPath.

Example: weave command=design docsPath="docs/"`,
    },
    'weave-craft': {
        metadata: {
            name: 'weave-craft',
            description: 'Phase 실행 (자동 검증 포함)',
            usage: '/weave craft [phaseId]',
            examples: ['/weave craft P1', '/weave craft P2'],
        },
        content: `Use the weave tool with command=craft and specify phaseId.

Example: weave command=craft phaseId="P1"`,
    },
    'weave-status': {
        metadata: {
            name: 'weave-status',
            description: '진행 상황 확인',
            usage: '/weave status',
            examples: ['/weave status'],
        },
        content: `Use the weave tool with command=status.

Example: weave command=status`,
    },
    'weave-repair': {
        metadata: {
            name: 'weave-repair',
            description: 'Scan and auto-repair corrupted plan YAML files',
            usage: '/weave repair',
            examples: ['/weave repair'],
        },
        content: `Use the weave tool with command=repair to scan and auto-repair all plan YAML files.

This command will:
1. Scan all plan files in .opencode/weave/plans/
2. Detect YAML corruption (unclosed quotes, tab characters, etc.)
3. Auto-repair when possible (backup the corrupted file as .corrupted)
4. Restore from .bak backup if auto-repair fails
5. Report unrecoverable files that need manual intervention

Example: weave command=repair`,
    },
};

// ============================================================================
// Command Discovery
// ============================================================================

function parseFrontmatter(content: string): { data: Record<string, any>; body: string } {
    const parts = content.split('---');
    if (parts.length < 3) {
        return { data: {}, body: content };
    }

    try {
        const data = parseYaml(parts[1]) || {};
        const body = parts.slice(2).join('---').trim();
        return { data, body };
    } catch {
        return { data: {}, body: content };
    }
}

function discoverCommandsFromDir(commandsDir: string, scope: 'package' | 'project'): CommandInfo[] {
    if (!fs.existsSync(commandsDir)) {
        return [];
    }

    const entries = fs.readdirSync(commandsDir, { withFileTypes: true });
    const commands: CommandInfo[] = [];

    for (const entry of entries) {
        if (!entry.isFile() || !entry.name.endsWith('.md')) continue;

        const commandPath = path.join(commandsDir, entry.name);
        const commandName = path.basename(entry.name, '.md');

        try {
            const content = fs.readFileSync(commandPath, 'utf-8');
            const { data, body } = parseFrontmatter(content);

            const metadata: CommandMetadata = {
                name: data.name || commandName,
                description: data.description || '',
                usage: data.usage,
                examples: data.examples,
            };

            commands.push({
                name: commandName,
                path: commandPath,
                metadata,
                content: body,
                scope,
            });
        } catch {
            continue;
        }
    }

    return commands;
}

function getAllCommands(assetsDirs: string[], projectDir: string): CommandInfo[] {
    // Start with builtin commands
    const commands: CommandInfo[] = Object.entries(BUILTIN_COMMANDS).map(([name, cmd]) => ({
        name,
        metadata: cmd.metadata,
        content: cmd.content,
        scope: 'builtin' as const,
    }));

    // Load from package assets
    for (const assetsDir of assetsDirs) {
        const packageCommands = discoverCommandsFromDir(
            path.join(assetsDir, 'commands'),
            'package'
        );
        // Package commands override builtins
        for (const cmd of packageCommands) {
            const existingIndex = commands.findIndex(c => c.name === cmd.name);
            if (existingIndex >= 0) {
                commands[existingIndex] = cmd;
            } else {
                commands.push(cmd);
            }
        }
    }

    // Load from project .opencode/commands (highest priority)
    const projectCommands = discoverCommandsFromDir(
        path.join(projectDir, '.opencode', 'commands'),
        'project'
    );
    for (const cmd of projectCommands) {
        const existingIndex = commands.findIndex(c => c.name === cmd.name);
        if (existingIndex >= 0) {
            commands[existingIndex] = cmd;
        } else {
            commands.push(cmd);
        }
    }

    return commands;
}

// ============================================================================
// Tool Factory
// ============================================================================

export function createSlashcommandTool() {
    return {
        description: `Execute a slash command. Available commands include:
- /weave help - Weave workflow help
- /weave design [docs] - Analyze requirements and create plan
- /weave craft [phaseId] - Execute a phase
- /weave status - View progress
- /weave repair - Scan and auto-repair corrupted plan YAML files

Use command="list" to see all available commands.`,

        args: {
            command: z.string()
                .describe('The slash command to execute (without leading /). Examples: "weave-help", "weave-design"'),
        },

        execute: async (
            args: { command: string },
            context: { worktree: string }
        ) => {
            const projectDir = context.worktree;

            // Discover all commands (builtin + package + project)
            const commands = getAllCommands([], projectDir);

            // Handle "list" command
            if (args.command === 'list' || !args.command) {
                const lines = ['# Available Slash Commands\n'];
                for (const cmd of commands) {
                    const desc = cmd.metadata.description || '(no description)';
                    lines.push(`- **/${cmd.name}**: ${desc} (${cmd.scope})`);
                }
                lines.push(`\n**Total**: ${commands.length} commands`);
                return lines.join('\n');
            }

            // Normalize command name (remove leading /)
            let cmdName = args.command.replace(/^\//, '').toLowerCase();

            // Handle "weave" command with optional subcommand
            // e.g., "weave status" -> "weave-status"
            // e.g., "status" (alone) -> might mean "weave-status"
            if (cmdName.startsWith('weave ')) {
                // "weave design" -> "weave-design"
                cmdName = cmdName.replace(' ', '-');
            } else if (cmdName === 'weave') {
                // Just "weave" -> "weave-help"
                const helpCmd = commands.find(c => c.name === 'weave-help');
                if (helpCmd) {
                    return helpCmd.content || 'Weave help content not available.';
                }
            } else if (['status', 'design', 'craft', 'help', 'repair'].includes(cmdName)) {
                // Shorthand: "status" -> "weave-status"
                const weaveCmd = commands.find(c => c.name === `weave-${cmdName}`);
                if (weaveCmd) {
                    return weaveCmd.content || `weave-${cmdName} content not available.`;
                }
            }

            // Find exact match
            const exactMatch = commands.find(
                c => c.name.toLowerCase() === cmdName
            );

            if (exactMatch) {
                return exactMatch.content || `/${exactMatch.name} has no content.`;
            }

            // Find partial matches
            const partialMatches = commands.filter(
                c => c.name.toLowerCase().includes(cmdName)
            );

            if (partialMatches.length > 0) {
                const matchList = partialMatches.map(c => `/${c.name}`).join(', ');
                return `No exact match for "/${cmdName}". Did you mean: ${matchList}?`;
            }

            // No match found
            const available = commands.slice(0, 10).map(c => `/${c.name}`).join(', ');
            return `Command "/${cmdName}" not found. Available: ${available}...`;
        },
    };
}
