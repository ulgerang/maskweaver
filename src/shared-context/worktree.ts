/**
 * Git Worktree Manager
 *
 * Provides isolated working directories for parallel task execution.
 * Each task gets its own git worktree to prevent file conflicts.
 *
 * @author Linus Torvalds' Dummy Human
 */

import { execFile } from 'child_process';
import { join, resolve } from 'path';
import { promisify } from 'util';
import { mkdir } from 'fs/promises';

const execFileAsync = promisify(execFile);

export interface WorktreeInfo {
  path: string;           // worktree absolute path
  branch: string;         // branch name
  taskId: string;         // associated task
  createdAt: string;
}

export interface WorktreeManagerOptions {
  /** Root git repository path */
  repoRoot: string;
  /** Base directory for worktrees (default: <repoRoot>/.worktrees) */
  worktreeBase?: string;
  /** Branch prefix for worktree branches (default: "squad/") */
  branchPrefix?: string;
}

export interface WorktreeManager {
  /**
   * Create isolated worktree for a task.
   * @param taskId - The ID of the task to associate with the worktree.
   * @param baseBranch - The branch to create the worktree from (defaults to current branch).
   * @returns Information about the created worktree.
   * @throws {Error} If git command fails.
   * @example
   * const manager = createWorktreeManager({ repoRoot: '/path/to/repo' });
   * const info = await manager.create('task-123');
   * console.log(info.path); // /path/to/repo/.worktrees/task-123
   */
  create(taskId: string, baseBranch?: string): Promise<WorktreeInfo>;
  
  /**
   * Remove worktree after task completion.
   * @param taskId - The ID of the task whose worktree should be removed.
   * @throws {Error} If git command fails.
   * @example
   * const manager = createWorktreeManager({ repoRoot: '/path/to/repo' });
   * await manager.remove('task-123');
   */
  remove(taskId: string): Promise<void>;
  
  /**
   * List all active worktrees managed by this manager.
   * @returns A list of active worktree information.
   * @throws {Error} If git command fails.
   * @example
   * const manager = createWorktreeManager({ repoRoot: '/path/to/repo' });
   * const worktrees = await manager.list();
   * console.log(worktrees);
   */
  list(): Promise<WorktreeInfo[]>;
  
  /**
   * Clean up all worktrees managed by this manager (for session end).
   * @throws {Error} If git command fails.
   * @example
   * const manager = createWorktreeManager({ repoRoot: '/path/to/repo' });
   * await manager.cleanup();
   */
  cleanup(): Promise<void>;
  
  /**
   * Get worktree info for a specific task.
   * @param taskId - The ID of the task.
   * @returns WorktreeInfo if found, otherwise null.
   * @throws {Error} If git command fails.
   * @example
   * const manager = createWorktreeManager({ repoRoot: '/path/to/repo' });
   * const info = await manager.get('task-123');
   * if (info) console.log(info.branch);
   */
  get(taskId: string): Promise<WorktreeInfo | null>;
}

/**
 * Create a WorktreeManager instance.
 * Uses git worktree add/remove commands internally.
 * @param options - Configuration options for the WorktreeManager.
 * @returns A WorktreeManager instance.
 * @example
 * const manager = createWorktreeManager({
 *   repoRoot: process.cwd(),
 *   worktreeBase: './.squad-worktrees',
 *   branchPrefix: 'squad-task/'
 * });
 */
export function createWorktreeManager(options: WorktreeManagerOptions): WorktreeManager {
  const repoRoot = resolve(options.repoRoot);
  const worktreeBase = resolve(repoRoot, options.worktreeBase || '.worktrees');
  const branchPrefix = options.branchPrefix || 'squad/';

  const getWorktreePath = (taskId: string) => join(worktreeBase, taskId);
  const getBranchName = (taskId: string) => `${branchPrefix}${taskId}`;

  const git = async (args: string[], cwd: string = repoRoot): Promise<string> => {
    try {
      const { stdout } = await execFileAsync('git', args, { cwd });
      return stdout.trim();
    } catch (error: any) {
      const errorMessage = error.stderr ? error.stderr.trim() : error.message;
      throw new Error(`Git command failed: ${args.join(' ')}\nError: ${errorMessage}`);
    }
  };

  return {
    async create(taskId: string, baseBranch?: string): Promise<WorktreeInfo> {
      const worktreePath = getWorktreePath(taskId);
      const branchName = getBranchName(taskId);

      // Ensure worktreeBase directory exists
      await mkdir(worktreeBase, { recursive: true });

      // Check if worktree already exists
      try {
        const existing = await this.get(taskId);
        if (existing) {
          return existing;
        }
      } catch {
        // Ignore error if list fails, proceed to create
      }

      // Determine the base commit to branch from
      const base = baseBranch || 'HEAD';

      // Create worktree with a new branch in one step
      await git(['worktree', 'add', '-b', branchName, worktreePath, base]);

      return {
        path: worktreePath,
        branch: branchName,
        taskId,
        createdAt: new Date().toISOString(),
      };
    },

    async remove(taskId: string): Promise<void> {
      const worktreePath = getWorktreePath(taskId);
      const branchName = getBranchName(taskId);

      // Check if worktree exists before trying to remove
      const existing = await this.get(taskId);
      if (!existing) {
        console.warn(`Worktree for task ${taskId} not found at ${worktreePath}. Skipping removal.`);
        return;
      }

      // Remove worktree
      await git(['worktree', 'remove', worktreePath]);
      // Remove associated branch
      try {
        await git(['branch', '-D', branchName]);
      } catch (error) {
        console.warn(`Could not delete branch ${branchName}: ${error}`);
      }
    },

    async list(): Promise<WorktreeInfo[]> {
      const output = await git(['worktree', 'list', '--porcelain']);
      const lines = output.split('\n').filter(line => line.trim() !== '');

      const worktrees: WorktreeInfo[] = [];
      let currentWorktree: Partial<WorktreeInfo> = {};

      for (const line of lines) {
        if (line.startsWith('worktree ')) {
          if (currentWorktree.path) {
            // Check if it's a squad worktree
            if (currentWorktree.branch && currentWorktree.branch.startsWith(branchPrefix)) {
              const taskId = currentWorktree.branch.substring(branchPrefix.length);
              if (taskId) {
                worktrees.push({
                  path: currentWorktree.path,
                  branch: currentWorktree.branch,
                  taskId: taskId,
                  createdAt: new Date().toISOString(), // Placeholder, git worktree list doesn't provide creation time
                });
              }
            }
          }
          currentWorktree = { path: line.substring('worktree '.length) };
        } else if (line.startsWith('branch ')) {
          currentWorktree.branch = line.substring('branch '.length);
        }
        // Other fields like HEAD, bare, etc., are ignored for WorktreeInfo
      }

      // Add the last parsed worktree if it's a squad worktree
      if (currentWorktree.path && currentWorktree.branch && currentWorktree.branch.startsWith(branchPrefix)) {
        const taskId = currentWorktree.branch.substring(branchPrefix.length);
        if (taskId) {
          worktrees.push({
            path: currentWorktree.path,
            branch: currentWorktree.branch,
            taskId: taskId,
            createdAt: new Date().toISOString(),
          });
        }
      }
      return worktrees;
    },

    async cleanup(): Promise<void> {
      const worktrees = await this.list();
      for (const worktree of worktrees) {
        if (worktree.branch.startsWith(branchPrefix)) { // Only clean up squad-managed worktrees
          await this.remove(worktree.taskId);
        }
      }
    },

    async get(taskId: string): Promise<WorktreeInfo | null> {
      const worktrees = await this.list();
      return worktrees.find(wt => wt.taskId === taskId) || null;
    },
  };
}
