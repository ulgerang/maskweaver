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

import { z } from 'zod';
// Inline shim: tool() is just an identity function in @opencode-ai/plugin
const tool = <T>(input: T): T => input;

import * as fs from 'node:fs';
import * as path from 'node:path';
import { parse as parseYaml } from 'yaml';
import { loadCommandsJson } from './command-registry.js';

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
// Built-in Commands from Registry (commands.json)
// ============================================================================

function getBuiltinCommandsFromRegistry(): Record<string, { metadata: CommandMetadata; content: string }> {
    const registry = loadCommandsJson();
    const builtins: Record<string, { metadata: CommandMetadata; content: string }> = {};

    for (const cmd of registry.commands) {
        const name = `weave-${cmd.name}`;
        const examples = cmd.examples.slice(0, 2).map(ex => {
            const match = ex.match(/weave command=(\S+)/);
            return match ? `/weave ${match[1]}` : `/weave ${cmd.name}`;
        });

        builtins[name] = {
            metadata: {
                name,
                description: cmd.description,
                usage: `/weave ${cmd.name}`,
                examples: examples.length > 0 ? examples : [`/weave ${cmd.name}`],
            },
            content: `Use the weave tool with command=${cmd.name}.\n\nExample: weave command=${cmd.name}`,
        };
    }

    return builtins;
}

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

function getAllCommands(assetsDir: string | undefined, projectDir: string): CommandInfo[] {
    const BUILTIN_COMMANDS = getBuiltinCommandsFromRegistry();

    // Start with builtin commands
    const commands: CommandInfo[] = Object.entries(BUILTIN_COMMANDS).map(([name, cmd]) => ({
        name,
        metadata: cmd.metadata,
        content: cmd.content,
        scope: 'builtin' as const,
    }));

    // Load from package assets
    if (assetsDir) {
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

export function createSlashcommandTool(assetsDir?: string) {
    const registry = loadCommandsJson();
    const descLines = ['Execute a slash command. Available commands include:'];
    for (const cmd of registry.commands) {
        descLines.push(`- /weave ${cmd.name} - ${cmd.description}`);
    }
    descLines.push('');
    descLines.push('Use command="list" to see all available commands.');

    // Build dynamic shorthand list from registry
    const shorthandSet = new Set<string>();
    for (const cmd of registry.commands) {
        shorthandSet.add(cmd.name);
        for (const alias of cmd.aliases) shorthandSet.add(alias);
        for (const alias of cmd.deprecatedAliases) shorthandSet.add(alias);
    }
    const shorthandList = Array.from(shorthandSet);

    return {
        description: descLines.join('\n'),

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
            const commands = getAllCommands(assetsDir, projectDir);

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
            } else if (shorthandList.includes(cmdName)) {
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
