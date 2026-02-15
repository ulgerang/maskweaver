/**
 * Git Utilities (Weave)
 *
 * Weave needs a small, safe subset of git operations for:
 * - staging files (optional)
 * - listing staged files
 * - creating commits (optional)
 */

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export interface GitCommandResult {
    stdout: string;
    stderr: string;
}

export async function execGit(cwd: string, args: string[]): Promise<GitCommandResult> {
    try {
        const { stdout, stderr } = await execFileAsync('git', args, { cwd });
        return {
            stdout: String(stdout || '').trim(),
            stderr: String(stderr || '').trim(),
        };
    } catch (e: any) {
        const stdout = e?.stdout ? String(e.stdout).trim() : '';
        const stderr = e?.stderr ? String(e.stderr).trim() : '';
        const msg = stderr || e?.message || String(e);
        const err = new Error(`Git command failed: git ${args.join(' ')}\n${msg}`);
        (err as any).stdout = stdout;
        (err as any).stderr = stderr;
        throw err;
    }
}

export async function ensureGitRepo(cwd: string): Promise<void> {
    await execGit(cwd, ['rev-parse', '--is-inside-work-tree']);
}

export async function stageAllChanges(cwd: string): Promise<void> {
    await execGit(cwd, ['add', '-A']);
}

export async function listStagedFiles(cwd: string): Promise<string[]> {
    const { stdout } = await execGit(cwd, ['diff', '--cached', '--name-only', '--diff-filter=ACMRT']);
    return stdout
        .split(/\r?\n/)
        .map(s => s.trim())
        .filter(Boolean);
}

export async function hasStagedChanges(cwd: string): Promise<boolean> {
    const { stdout } = await execGit(cwd, ['diff', '--cached', '--name-only']);
    return stdout.trim().length > 0;
}

export async function commitStagedChanges(cwd: string, message: string): Promise<GitCommandResult> {
    return execGit(cwd, ['commit', '-m', message]);
}
