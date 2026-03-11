/**
 * @maskweaver/shared-context
 * 
 * Multi-agent collaboration with shared context
 */

// Types
export * from "./types.js";

// Storage
export { 
  FileStorageAdapter, 
  validatePath,
  type StorageAdapter,
  type LockOptions
} from "./storage.js";

// Session
export { 
  createSession, 
  loadSession,
  type Session,
  type CreateSessionOptions 
} from "./session.js";

// Squad
export { 
  createSquad, 
  getSquad, 
  updateSquadState,
  type CreateSquadOptions 
} from "./squad.js";

// Task
export { assignTask, getTask, updateTask, completeTask } from "./task.js";

// DAG Analysis
export { buildDAG, getReadyTasks, areDependenciesMet, validateDependencies } from "./dag.js";
export type { DAGNode, ExecutionWave, DAGAnalysis } from "./dag.js";

// Worktree
export { createWorktreeManager } from "./worktree.js";
export type { WorktreeManager, WorktreeInfo, WorktreeManagerOptions } from "./worktree.js";

// Parallel Execution
export { createExecutionPlan, executeWave } from "./parallel-executor.js";
export type { ParallelExecutionPlan, WaveExecutionResult, ParallelExecutionOptions } from "./parallel-executor.js";

// Watchdog
export { 
  checkSquadTimeout, 
  checkTaskTimeout, 
  markSquadExpired, 
  runWatchdog,
  type WatchdogSummary 
} from "./watchdog.js";

// Logger
export { logEvent, readLog } from "./logger.js";
