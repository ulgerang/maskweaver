/**
 * Weave Worktree Utilities
 *
 * Provides git worktree helpers tailored for Weave workflows.
 *
 * Goals:
 * - Enable parallel feature/phase work on isolated working directories
 * - Bootstrap .opencode/weave artifacts into newly created worktrees
 * - Keep "weave init once" principle by copying/creating required files
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

import { createWorktreeManager, type WorktreeInfo } from '../shared-context/worktree.js';

const execFileAsync = promisify(execFile);

export interface WeaveWorktreeCreateOptions {
    /** Current worktree path (where command is invoked). */
    basePath: string;
    /** Feature/worktree name (kebab-case recommended). */
    name: string;
    /** Base ref to branch from. Defaults to HEAD of basePath worktree. */
    fromRef?: string;
    /** Whether to copy weave artifacts from basePath into new worktree. */
    bootstrapWeave?: boolean;
    /** Whether to copy .gdc/config + node specs into the worktree. */
    bootstrapGdc?: boolean;
}

export interface WeaveWorktreeRemoveOptions {
    basePath: string;
    name: string;
    /** Also delete the worktree branch (default: false). */
    deleteBranch?: boolean;
}

export interface WeaveWorktreeListOptions {
    basePath: string;
}

export interface WeaveWorktreeResolveOptions {
    basePath: string;
    name: string;
}

export interface WeaveWorktreeResolved {
    name: string;
    path: string;
    branch: string;
}

// ============================================================================
// Git helpers
// ============================================================================

async function git(cwd: string, args: string[]): Promise<string> {
    try {
        const { stdout } = await execFileAsync('git', args, { cwd });
        return String(stdout).trim();
    } catch (e: any) {
        const stderr = e?.stderr ? String(e.stderr).trim() : '';
        const msg = stderr || e?.message || String(e);
        throw new Error(`Git command failed: git ${args.join(' ')}\n${msg}`);
    }
}

async function getCommonRepoRoot(worktreePath: string): Promise<string> {
    const commonDir = await git(worktreePath, ['rev-parse', '--git-common-dir']);
    const commonAbs = path.isAbsolute(commonDir)
        ? commonDir
        : path.resolve(worktreePath, commonDir);
    return path.dirname(commonAbs);
}

async function resolveCommit(worktreePath: string, ref: string): Promise<string> {
    return git(worktreePath, ['rev-parse', ref]);
}

function toKebabCase(input: string): string {
    return input
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');
}

// ============================================================================
// Bootstrap helpers
// ============================================================================

export function ensureIgnoreOverride(projectRoot: string): void {
    const ignorePath = path.join(projectRoot, '.ignore');
    const allowLine = '!.opencode/weave/';
    const headerLine = '# Allow AI tools to access weave plans (overrides .gitignore)';

    let content = '';
    if (fs.existsSync(ignorePath)) {
        content = fs.readFileSync(ignorePath, 'utf-8');
        if (!content.endsWith('\n')) content += '\n';
    }

    const hasAllow = content.split(/\r?\n/).some(l => l.trim() === allowLine);
    if (hasAllow) return;

    const lines: string[] = [];
    if (content.trim().length > 0) {
        lines.push(content.replace(/\s+$/g, ''));
        lines.push('');
    }
    lines.push(headerLine);
    lines.push(allowLine);
    lines.push('');
    fs.writeFileSync(ignorePath, lines.join('\n'), 'utf-8');
}

export function ensureWeaveState(projectRoot: string): void {
    const statePath = path.join(projectRoot, '.opencode', 'weave', 'state.yaml');
    const plansDir = path.join(projectRoot, '.opencode', 'weave', 'plans');
    const specsDir = path.join(projectRoot, '.opencode', 'weave', 'specs');

    fs.mkdirSync(plansDir, { recursive: true });
    fs.mkdirSync(specsDir, { recursive: true });

    if (!fs.existsSync(statePath)) {
        const content = [
            '# Weave Multi-Plan State',
            '# 이 파일은 활성 플랜을 추적합니다',
            'active_plan: null',
            '',
        ].join('\n');
        fs.writeFileSync(statePath, content, 'utf-8');
    }
}

function copyIfExists(src: string, dest: string): void {
    if (!fs.existsSync(src)) return;
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(src, dest);
}

function copyYamlDirIfExists(srcDir: string, destDir: string): void {
    if (!fs.existsSync(srcDir)) return;
    fs.mkdirSync(destDir, { recursive: true });
    const entries = fs.readdirSync(srcDir, { withFileTypes: true });
    for (const entry of entries) {
        if (!entry.isFile()) continue;
        if (!entry.name.endsWith('.yaml') && !entry.name.endsWith('.yml')) continue;
        const src = path.join(srcDir, entry.name);
        const dest = path.join(destDir, entry.name);
        fs.copyFileSync(src, dest);
    }
}

function copyGdcNodesRecursive(srcDir: string, destDir: string): void {
    if (!fs.existsSync(srcDir)) return;
    fs.mkdirSync(destDir, { recursive: true });
    const entries = fs.readdirSync(srcDir, { withFileTypes: true });
    for (const entry of entries) {
        const src = path.join(srcDir, entry.name);
        const dest = path.join(destDir, entry.name);
        if (entry.isDirectory()) {
            copyGdcNodesRecursive(src, dest);
            continue;
        }
        if (!entry.isFile()) continue;
        if (!entry.name.endsWith('.yaml') && !entry.name.endsWith('.yml')) continue;
        fs.mkdirSync(path.dirname(dest), { recursive: true });
        fs.copyFileSync(src, dest);
    }
}

export function bootstrapWeaveArtifacts(fromRoot: string, toRoot: string): void {
    ensureIgnoreOverride(toRoot);
    ensureWeaveState(toRoot);

    // Copy weave artifacts if they exist in the source worktree.
    copyIfExists(
        path.join(fromRoot, '.opencode', 'weave', 'state.yaml'),
        path.join(toRoot, '.opencode', 'weave', 'state.yaml')
    );
    copyYamlDirIfExists(
        path.join(fromRoot, '.opencode', 'weave', 'plans'),
        path.join(toRoot, '.opencode', 'weave', 'plans')
    );
    copyYamlDirIfExists(
        path.join(fromRoot, '.opencode', 'weave', 'specs'),
        path.join(toRoot, '.opencode', 'weave', 'specs')
    );
}

export function bootstrapGdcArtifacts(fromRoot: string, toRoot: string): void {
    const srcConfig = path.join(fromRoot, '.gdc', 'config.yaml');
    const destConfig = path.join(toRoot, '.gdc', 'config.yaml');
    copyIfExists(srcConfig, destConfig);

    const srcNodes = path.join(fromRoot, '.gdc', 'nodes');
    const destNodes = path.join(toRoot, '.gdc', 'nodes');
    copyGdcNodesRecursive(srcNodes, destNodes);
}

// ============================================================================
// Public API
// ============================================================================

export async function createWeaveWorktree(options: WeaveWorktreeCreateOptions): Promise<WeaveWorktreeResolved> {
    const basePath = path.resolve(options.basePath);
    const slug = toKebabCase(options.name);
    if (!slug) {
        throw new Error('Invalid worktree name. Use kebab-case like "feature-login"');
    }

    const commonRepoRoot = await getCommonRepoRoot(basePath);
    const fromRef = options.fromRef || 'HEAD';
    const baseCommit = await resolveCommit(basePath, fromRef);

    const manager = createWorktreeManager({
        repoRoot: commonRepoRoot,
        worktreeBase: path.join('.worktrees', 'weave'),
        branchPrefix: 'weave/',
    });

    const info = await manager.create(slug, baseCommit);

    if (options.bootstrapWeave !== false) {
        bootstrapWeaveArtifacts(basePath, info.path);
    }

    if (options.bootstrapGdc !== false) {
        bootstrapGdcArtifacts(basePath, info.path);
    }

    return {
        name: slug,
        path: info.path,
        branch: info.branch,
    };
}

export async function listWeaveWorktrees(options: WeaveWorktreeListOptions): Promise<WorktreeInfo[]> {
    const basePath = path.resolve(options.basePath);
    const commonRepoRoot = await getCommonRepoRoot(basePath);
    const manager = createWorktreeManager({
        repoRoot: commonRepoRoot,
        worktreeBase: path.join('.worktrees', 'weave'),
        branchPrefix: 'weave/',
    });
    return manager.list();
}

export async function resolveWeaveWorktree(options: WeaveWorktreeResolveOptions): Promise<WeaveWorktreeResolved | null> {
    const slug = toKebabCase(options.name);
    if (!slug) return null;

    const basePath = path.resolve(options.basePath);
    const commonRepoRoot = await getCommonRepoRoot(basePath);
    const manager = createWorktreeManager({
        repoRoot: commonRepoRoot,
        worktreeBase: path.join('.worktrees', 'weave'),
        branchPrefix: 'weave/',
    });

    const info = await manager.get(slug);
    if (!info) return null;
    return { name: slug, path: info.path, branch: info.branch };
}

export async function removeWeaveWorktree(options: WeaveWorktreeRemoveOptions): Promise<void> {
    const basePath = path.resolve(options.basePath);
    const slug = toKebabCase(options.name);
    if (!slug) {
        throw new Error('Invalid worktree name');
    }

    const commonRepoRoot = await getCommonRepoRoot(basePath);
    const manager = createWorktreeManager({
        repoRoot: commonRepoRoot,
        worktreeBase: path.join('.worktrees', 'weave'),
        branchPrefix: 'weave/',
    });

    // Remove worktree directory via git.
    // NOTE: The shared worktree manager also deletes the branch. For user-facing
    // flows we make branch deletion optional.
    const info = await manager.get(slug);
    if (!info) return;

    await git(commonRepoRoot, ['worktree', 'remove', info.path]);

    if (options.deleteBranch) {
        await git(commonRepoRoot, ['branch', '-D', info.branch]);
    }
}
