/**
 * Watchdog - Squad Timeout Monitoring
 *
 * Monitors squad health and detects stuck or unresponsive agents.
 * "If you can't measure it, you can't improve it." - Brendan Gregg
 *
 * Key metrics:
 * - Elapsed time since last activity (updatedAt)
 * - Time remaining before timeout threshold
 * - Grace period for cleanup before hard kill
 *
 * Design principles:
 * - Pure functions for timeout checking (no side effects)
 * - Deterministic behavior for testing
 * - Observability-first: expose all timing details
 *
 * @author Kent Beck's Dummy Human
 */

import type { SquadState, TaskState, TimeoutStatus } from "./types.js";
import { LIMITS } from "./types.js";
import type { Session } from "./session.js";
import { getSquad, updateSquadState } from "./squad.js";
import { updateTask } from "./task.js";
import { logEvent } from "./logger.js";

// ============================================================================
// Internal Helpers
// ============================================================================

/**
 * Calculate timeout status from last activity timestamp.
 * Pure function - deterministic and side-effect free.
 *
 * @param lastActivityAt - ISO timestamp of last recorded activity
 * @param timeoutMs - Timeout threshold in milliseconds
 * @param now - Current time (injectable for testing)
 * @returns Computed timeout status with all timing details
 */
function getTimeoutStatus(
  lastActivityAt: string,
  timeoutMs: number,
  now: Date = new Date()
): TimeoutStatus {
  const lastActivity = new Date(lastActivityAt);
  const elapsedMs = now.getTime() - lastActivity.getTime();
  const remainingMs = timeoutMs - elapsedMs;
  const isExpired = remainingMs <= 0;

  return {
    isExpired,
    elapsedMs,
    remainingMs,
    lastActivityAt,
  };
}

// ============================================================================
// Timeout Checking - Pure Functions
// ============================================================================

/**
 * Check if a squad has exceeded its timeout threshold.
 * Pure function based on squadState.updatedAt timestamp.
 *
 * This is the primary health check for detecting stuck agents.
 * A squad is considered stuck if no activity has occurred within
 * the timeout period (default: 5 minutes).
 *
 * @param squadState - Current squad state with updatedAt timestamp
 * @param timeoutMs - Optional custom timeout (defaults to LIMITS.watchdogTimeoutMs)
 * @returns TimeoutStatus with expiration state and timing details
 *
 * @example
 * const status = checkSquadTimeout(squadState);
 * if (status.isExpired) {
 *   console.log(`Squad stuck for ${status.elapsedMs}ms`);
 *   await markSquadExpired(session, squadState.squadId);
 * }
 *
 * @example
 * // With custom timeout for long-running tasks
 * const status = checkSquadTimeout(squadState, 30 * 60 * 1000); // 30 minutes
 */
export function checkSquadTimeout(
  squadState: SquadState,
  timeoutMs?: number
): TimeoutStatus {
  const effectiveTimeout = timeoutMs ?? LIMITS.watchdogTimeoutMs;
  return getTimeoutStatus(squadState.updatedAt, effectiveTimeout);
}

// ============================================================================
// Task Timeout Checking - Fine-grained observability
// ============================================================================

/**
 * Check if a task has exceeded its timeout threshold.
 * Pure function - deterministic and side-effect free.
 *
 * "If you can't measure it, you can't improve it." - Brendan Gregg
 *
 * This enables fine-grained observability at the task level,
 * complementing squad-level timeout checks.
 *
 * @param task - TaskState with optional startedAt timestamp
 * @param timeoutMs - Timeout threshold (defaults to LIMITS.watchdogTimeoutMs)
 * @returns TimeoutStatus or null if task hasn't started
 *
 * @example
 * const status = checkTaskTimeout(task);
 * if (status === null) {
 *   console.log("Task hasn't started yet");
 * } else if (status.isExpired) {
 *   console.log(`Task stuck for ${status.elapsedMs}ms`);
 * }
 *
 * @example
 * // With custom timeout for quick tasks
 * const status = checkTaskTimeout(task, 60 * 1000); // 1 minute
 */
export function checkTaskTimeout(
  task: TaskState,
  timeoutMs?: number
): TimeoutStatus | null {
  // Task hasn't started - no timeout to check
  if (!task.startedAt) {
    return null;
  }

  const effectiveTimeout = timeoutMs ?? LIMITS.watchdogTimeoutMs;
  return getTimeoutStatus(task.startedAt, effectiveTimeout);
}

// ============================================================================
// State Mutations - Expire Stuck Squads
// ============================================================================

/**
 * Mark a squad as expired due to timeout.
 * Sets status to "failed" and logs the timeout event.
 *
 * This should be called after checkSquadTimeout() returns isExpired: true.
 * The function is idempotent - calling it multiple times is safe.
 *
 * @param session - Parent session containing the squad
 * @param squadId - ID of the squad to expire
 * @returns Updated squad state with status="failed"
 *
 * @example
 * const status = checkSquadTimeout(squadState);
 * if (status.isExpired) {
 *   const failedState = await markSquadExpired(session, squadId);
 *   console.log(`Squad ${squadId} expired after ${status.elapsedMs}ms`);
 * }
 */
export async function markSquadExpired(
  session: Session,
  squadId: string
): Promise<SquadState> {
  // Log the timeout event for observability
  await logEvent(session, squadId, {
    type: "error",
    message: "Squad timeout expired",
  });

  // Update state to failed
  const updatedState = await updateSquadState(session, squadId, {
    status: "failed",
  });

  return updatedState;
}

// ============================================================================
// Watchdog Runner - Periodic Health Check
// ============================================================================

/**
 * Summary of a watchdog run.
 * "If you can't measure it, you can't improve it." - Brendan Gregg
 */
export interface WatchdogSummary {
  /** Number of squads checked */
  checkedSquads: number;
  /** Number of tasks checked (across all squads) */
  checkedTasks: number;
  /** IDs of squads that were found expired */
  expiredSquads: string[];
  /** Tasks that were found expired */
  expiredTasks: Array<{ squadId: string; taskId: string }>;
}

/**
 * Run watchdog check on all active squads and tasks.
 * Marks expired squads/tasks as failed.
 *
 * This is meant to be called periodically (e.g., every 30 seconds)
 * to detect and handle stuck agents.
 *
 * "If you can't measure it, you can't improve it." - Brendan Gregg
 *
 * The dryRun mode allows "measure before fix" - check without modifying state.
 *
 * @param session - Session to check
 * @param options - Optional configuration
 * @returns Summary of watchdog run with all metrics
 *
 * @example
 * // Periodic watchdog check (production mode)
 * const summary = await runWatchdog(session);
 * console.log(`Checked ${summary.checkedSquads} squads`);
 * console.log(`Expired: ${summary.expiredSquads.length} squads`);
 *
 * @example
 * // Dry run for monitoring without side effects
 * const summary = await runWatchdog(session, { dryRun: true });
 * if (summary.expiredSquads.length > 0) {
 *   alertOnCall(summary);
 * }
 *
 * @example
 * // Custom timeouts for specific workloads
 * const summary = await runWatchdog(session, {
 *   squadTimeoutMs: 30 * 60 * 1000, // 30 minutes
 *   taskTimeoutMs: 10 * 60 * 1000,  // 10 minutes
 * });
 */
export async function runWatchdog(
  session: Session,
  options?: {
    squadTimeoutMs?: number;
    taskTimeoutMs?: number;
    dryRun?: boolean;
  }
): Promise<WatchdogSummary> {
  const squadTimeoutMs = options?.squadTimeoutMs ?? LIMITS.watchdogTimeoutMs;
  const taskTimeoutMs = options?.taskTimeoutMs ?? LIMITS.watchdogTimeoutMs;
  const dryRun = options?.dryRun ?? false;

  const expiredSquads: string[] = [];
  const expiredTasks: Array<{ squadId: string; taskId: string }> = [];
  let checkedSquads = 0;
  let checkedTasks = 0;

  // Iterate through all squads in the session
  for (const squadId of session.manifest.squads) {
    const squad = await getSquad(session, squadId);

    // Skip if squad doesn't exist (may have been cleaned up)
    if (!squad) {
      continue;
    }

    checkedSquads++;

    // Only check active squads (skip completed/failed)
    if (squad.state.status === "active" || squad.state.status === "pending") {
      const squadStatus = checkSquadTimeout(squad.state, squadTimeoutMs);

      if (squadStatus.isExpired) {
        expiredSquads.push(squadId);

        if (!dryRun) {
          await markSquadExpired(session, squadId);
        }
      }
    }

    // Check all active tasks in this squad
    for (const task of squad.state.tasks) {
      // Only check tasks that are in progress (active status with startedAt)
      if (task.status === "active" && task.startedAt) {
        checkedTasks++;

        const taskStatus = checkTaskTimeout(task, taskTimeoutMs);

        if (taskStatus && taskStatus.isExpired) {
          expiredTasks.push({ squadId, taskId: task.taskId });

          if (!dryRun) {
            await updateTask(session, squadId, task.taskId, {
              status: "failed",
              completedAt: new Date().toISOString(),
              result: {
                success: false,
                error: {
                  code: "TIMEOUT",
                  message: `Task exceeded timeout of ${taskTimeoutMs}ms`,
                },
              },
            });
          }
        }
      }
    }
  }

  return {
    checkedSquads,
    checkedTasks,
    expiredSquads,
    expiredTasks,
  };
}
