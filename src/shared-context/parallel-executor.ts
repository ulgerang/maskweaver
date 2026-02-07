/**
 * Parallel Execution Engine
 *
 * Executes task waves in parallel using DAG analysis and git worktrees.
 * Each wave contains independent tasks that can run concurrently.
 *
 * @author Jeff Dean's Dummy Human
 */

import { LIMITS } from './types.js';
import type { Session } from './session.js';
import { buildDAG } from './dag.js';
import type { ExecutionWave, DAGAnalysis } from './dag.js';
import { createWorktreeManager } from './worktree.js';
import { getSquad, updateSquadState } from './squad.js';

export interface ParallelExecutionPlan {
  squadId: string;
  waves: ExecutionWave[];
  dag: DAGAnalysis;
  estimatedParallelism: number;
}

export interface WaveExecutionResult {
  waveIndex: number;
  results: Array<{
    taskId: string;
    success: boolean;
    worktreePath?: string;
    duration: number;
    error?: string;
  }>;
  allSucceeded: boolean;
}

export interface ParallelExecutionOptions {
  /** Maximum concurrent tasks per wave (default: LIMITS.maxWorkersPerSquad) */
  maxConcurrency?: number;
  /** Whether to use git worktrees for isolation (default: true) */
  useWorktrees?: boolean;
  /** Whether to abort remaining tasks on first failure (default: false) */
  failFast?: boolean;
  /** Callback when a task starts */
  onTaskStart?: (taskId: string, worktreePath?: string) => void;
  /** Callback when a task completes */
  onTaskComplete?: (taskId: string, success: boolean, error?: string) => void;
  /** Callback when a wave completes */
  onWaveComplete?: (waveIndex: number, results: WaveExecutionResult) => void;
}

/**
 * Create a parallel execution plan from squad tasks.
 * Analyzes dependencies and groups into waves.
 * @param session - The current session object.
 * @param squadId - The ID of the squad to create the plan for.
 * @returns A promise that resolves to the ParallelExecutionPlan.
 * @throws {ValidationError} If DAG analysis fails (e.g., cycle detected).
 * @example
 * import { createExecutionPlan } from './parallel-executor.ts';
 * import { Session } from './types.ts';
 * // Assume 'mockSession' and 'squad-abc' exist
 * const plan = await createExecutionPlan(mockSession, 'squad-abc');
 * console.log(plan.waves.length);
 */
export async function createExecutionPlan(
  session: Session,
  squadId: string
): Promise<ParallelExecutionPlan> {
  const squad = await getSquad(session, squadId);
  if (!squad) {
    throw new Error(`Squad with ID ${squadId} not found.`);
  }

  const dag = buildDAG(squad.state.tasks);

  return {
    squadId: squad.state.squadId,
    waves: dag.waves,
    dag,
    estimatedParallelism: dag.parallelismFactor,
  };
}

/**
 * Execute a single wave of tasks in parallel.
 * - Creates worktrees for each task (if useWorktrees=true)
 * - Dispatches tasks concurrently
 * - Waits for all to complete
 * - Cleans up worktrees
 * - Returns aggregated results
 * @param session - The current session object.
 * @param squadId - The ID of the squad.
 * @param wave - The ExecutionWave to execute.
 * @param executor - A function that takes a taskId and worktreePath, and returns a promise resolving to true for success, false for failure.
 * @param options - Optional execution options.
 * @returns A promise that resolves to the WaveExecutionResult.
 * @example
 * import { executeWave } from './parallel-executor.ts';
 * import { Session, TaskState } from './types.ts';
 * // Assume 'mockSession', 'squad-abc', 'mockWave' exist
 * // mockExecutor would simulate running a task
 * const mockExecutor = async (taskId: string, worktreePath?: string) => {
 *   console.log(`Executing ${taskId} in ${worktreePath || 'main repo'}`);
 *   await new Promise(resolve => setTimeout(resolve, 1000)); // Simulate work
 *   return Math.random() > 0.1; // 90% success rate
 * };
 * const result = await executeWave(mockSession, 'squad-abc', mockWave, mockExecutor);
 * console.log(result.allSucceeded);
 */
export async function executeWave(
  session: Session,
  squadId: string,
  wave: ExecutionWave,
  executor: (taskId: string, worktreePath?: string) => Promise<boolean>,
  options?: ParallelExecutionOptions
): Promise<WaveExecutionResult> {
  const {
    maxConcurrency = LIMITS.maxWorkersPerSquad,
    useWorktrees = true,
    failFast = false,
    onTaskStart,
    onTaskComplete,
    onWaveComplete,
  } = options || {};

  const squad = await getSquad(session, squadId);
  if (!squad) {
    throw new Error(`Squad with ID ${squadId} not found.`);
  }

  const worktreeManager = useWorktrees
    ? createWorktreeManager({ repoRoot: session.sessionPath }) // Assuming sessionPath is repoRoot
    : undefined;

  const waveResults: WaveExecutionResult['results'] = [];
  let allSucceeded = true;
  let abortController: AbortController | undefined;

  if (failFast) {
    abortController = new AbortController();
  }

  const tasksToExecute = wave.taskIds;
  const runningTasks: Promise<void>[] = [];
  const taskQueue = [...tasksToExecute];

  const executeNextTask = async () => {
    if (abortController?.signal.aborted) {
      return;
    }

    const taskId = taskQueue.shift();
    if (!taskId) {
      return;
    }

    let worktreePath: string | undefined;
    let success = false;
    let error: string | undefined;
    const startTime = process.hrtime.bigint();

    try {
      if (useWorktrees && worktreeManager) {
        const worktreeInfo = await worktreeManager.create(taskId);
        worktreePath = worktreeInfo.path;
      }

      onTaskStart?.(taskId, worktreePath);

      success = await executor(taskId, worktreePath);
      if (!success && failFast) {
        abortController?.abort();
      }
    } catch (e: any) {
      success = false;
      error = e.message || 'Unknown error';
      if (failFast) {
        abortController?.abort();
      }
    } finally {
      const endTime = process.hrtime.bigint();
      const duration = Number(endTime - startTime) / 1_000_000; // Convert to milliseconds

      waveResults.push({ taskId, success, worktreePath, duration, error });
      if (!success) {
        allSucceeded = false;
      }
      onTaskComplete?.(taskId, success, error);

      // Update task status in squad
      const taskIndex = squad.state.tasks.findIndex(t => t.taskId === taskId);
      if (taskIndex !== -1) {
        squad.state.tasks[taskIndex].status = success ? 'completed' : 'failed';
        squad.state.tasks[taskIndex].completedAt = new Date().toISOString();
        squad.state.tasks[taskIndex].result = { success, error }; // Store basic result
        await updateSquadState(session, squad.state.squadId, squad.state); // Persist updated squad state
      }

      // Clean up worktree
      if (useWorktrees && worktreeManager) {
        try {
          await worktreeManager.remove(taskId);
        } catch (e) {
          console.error(`Failed to remove worktree for task ${taskId}: ${e}`);
        }
      }
    }

    // Continue executing next task if not aborted
    if (!abortController?.signal.aborted && taskQueue.length > 0) {
      runningTasks.push(executeNextTask());
    }
  };

  // Start initial tasks up to maxConcurrency
  for (let i = 0; i < Math.min(maxConcurrency, tasksToExecute.length); i++) {
    runningTasks.push(executeNextTask());
  }

  await Promise.allSettled(runningTasks);

  const result: WaveExecutionResult = {
    waveIndex: wave.waveIndex,
    results: waveResults,
    allSucceeded,
  };

  onWaveComplete?.(wave.waveIndex, result);
  return result;
}
