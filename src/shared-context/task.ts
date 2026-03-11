/**
 * Task Management
 *
 * Tasks are the atomic units of work within a squad.
 * "Make the implicit explicit" - Eric Evans
 *
 * This module embodies the Task aggregate, ensuring domain invariants:
 * - A task always belongs to exactly one squad
 * - Task count per squad is bounded (LIMITS.maxTasksPerSquad)
 * - Task identity is immutable once assigned
 *
 * @author Kent Beck's Dummy Human
 */

import { randomUUID } from "crypto";
import type { CreateTaskOptions, TaskState, Status, TaskResult } from "./types.js";
import { LIMITS, validateCreateTaskOptions, validateTaskResult } from "./types.js";
import type { Session } from "./session.js";
import { getSquad, updateSquadState } from "./squad.js";
import { logEvent } from "./logger.js";
import { ValidationError, StorageError } from "../shared/errors.js";

// ============================================================================
// Task Assignment - The heart of work distribution
// ============================================================================

/**
 * Assign a new task to an agent within a squad.
 *
 * This is a domain operation that enforces invariants:
 * 1. The target squad must exist
 * 2. The squad's task capacity must not be exceeded
 * 3. Task options must be valid at the boundary
 *
 * The task starts in "pending" status, awaiting execution.
 *
 * @param session - The parent session containing the squad
 * @param squadId - ID of the squad to assign the task to
 * @param options - Task creation options (assignee, description, priority, etc.)
 * @returns The newly created TaskState
 * @throws {StorageError} If the squad doesn't exist
 * @throws {ValidationError} If task limit is exceeded or options are invalid
 *
 * @example
 * const task = await assignTask(session, "squad-a1b2c3d4", {
 *   assignee: "worker-1",
 *   description: "Implement user login form",
 *   priority: "high",
 *   dependencies: ["task-setup"]
 * });
 * console.log(`Assigned task ${task.taskId} to ${task.assignee}`);
 */
export async function assignTask(
  session: Session,
  squadId: string,
  options: CreateTaskOptions
): Promise<TaskState> {
  // Validate at boundary - Parse, don't validate
  const validatedOptions = validateCreateTaskOptions(options);

  // Retrieve the squad - domain aggregate root
  const squad = await getSquad(session, squadId);

  if (!squad) {
    throw new StorageError(`Squad not found: ${squadId}`, {
      squadId,
      sessionId: session.manifest.sessionId,
    });
  }

  // Enforce domain invariant: task capacity
  if (squad.state.tasks.length >= LIMITS.maxTasksPerSquad) {
    throw new ValidationError("Maximum tasks per squad exceeded", {
      squadId,
      limit: LIMITS.maxTasksPerSquad,
      current: squad.state.tasks.length,
    });
  }

  // Create the task entity with identity
  const taskId = `task-${randomUUID().slice(0, 8)}`;
  const now = new Date().toISOString();

  const task: TaskState = {
    taskId,
    assignee: validatedOptions.assignee,
    status: "pending",
    priority: validatedOptions.priority ?? "medium",
    description: validatedOptions.description,
    dependencies: validatedOptions.dependencies,
    createdAt: now,
  };

  // Update squad aggregate - append task to collection
  const updatedTasks = [...squad.state.tasks, task];
  await updateSquadState(session, squadId, {
    tasks: updatedTasks,
  });

  // Emit domain event for observability
  await logEvent(session, squadId, {
    type: "task_assigned",
    taskId: task.taskId,
    assignee: task.assignee,
    description: task.description,
  });

  return task;
}

// ============================================================================
// Task Query - Domain Entity Lookup
// ============================================================================

/**
 * Get a specific task from a squad by taskId.
 *
 * "Make implicit concepts explicit" - Eric Evans
 * Task lookup is a first-class domain operation, not hidden in aggregate traversal.
 *
 * @param session - Parent session
 * @param squadId - Squad containing the task
 * @param taskId - Task ID to find
 * @returns TaskState or null if not found (no error thrown for missing task)
 * @throws {StorageError} If the squad doesn't exist
 *
 * @example
 * const task = await getTask(session, "squad-a1b2c3d4", "task-12345678");
 * if (task) {
 *   console.log(`Task ${task.taskId} is ${task.status}`);
 * }
 */
export async function getTask(
  session: Session,
  squadId: string,
  taskId: string
): Promise<TaskState | null> {
  // Retrieve the squad aggregate
  const squad = await getSquad(session, squadId);

  if (!squad) {
    throw new StorageError(`Squad not found: ${squadId}`, {
      squadId,
      sessionId: session.manifest.sessionId,
    });
  }

  // Search for task within the squad's task collection
  const task = squad.state.tasks.find((t) => t.taskId === taskId);

  // Return null for not found (expected case, not an error)
  return task ?? null;
}

// ============================================================================
// Task Update - State Transition through Aggregate Root
// ============================================================================

/**
 * Update a task's status and optionally record progress.
 * This is the primary way to advance task lifecycle.
 *
 * DDD Principle: All state mutations go through the Aggregate Root (Squad).
 * "Make implicit concepts explicit" - Eric Evans
 *
 * @param session - Parent session
 * @param squadId - Squad containing the task
 * @param taskId - Task to update
 * @param updates - Partial updates (status, result, etc.)
 * @returns Updated TaskState
 * @throws {StorageError} If squad or task not found
 *
 * @example
 * // Start a task
 * const updated = await updateTask(session, squadId, taskId, {
 *   status: "active",
 *   startedAt: new Date().toISOString()
 * });
 *
 * @example
 * // Complete a task with result
 * const completed = await updateTask(session, squadId, taskId, {
 *   status: "completed",
 *   completedAt: new Date().toISOString(),
 *   result: { success: true, output: "Feature implemented" }
 * });
 */
export async function updateTask(
  session: Session,
  squadId: string,
  taskId: string,
  updates: {
    status?: Status;
    startedAt?: string;
    completedAt?: string;
    result?: unknown;
  }
): Promise<TaskState> {
  // Retrieve the squad aggregate root
  const squad = await getSquad(session, squadId);

  if (!squad) {
    throw new StorageError(`Squad not found: ${squadId}`, {
      squadId,
      sessionId: session.manifest.sessionId,
    });
  }

  // Find the task within the aggregate
  const taskIndex = squad.state.tasks.findIndex((t) => t.taskId === taskId);

  if (taskIndex === -1) {
    throw new StorageError(`Task not found: ${taskId}`, {
      taskId,
      squadId,
      sessionId: session.manifest.sessionId,
    });
  }

  const existingTask = squad.state.tasks[taskIndex];
  const previousStatus = existingTask.status;

  // Apply updates via spread - immutable update pattern
  const updatedTask: TaskState = {
    ...existingTask,
    ...updates,
  };

  // Update the tasks array immutably
  const updatedTasks = [...squad.state.tasks];
  updatedTasks[taskIndex] = updatedTask;

  // Persist through aggregate root
  await updateSquadState(session, squadId, {
    tasks: updatedTasks,
  });

  // Log status change as domain event (only if status actually changed)
  if (updates.status && updates.status !== previousStatus) {
    if (updates.status === "completed") {
      await logEvent(session, squadId, {
        type: "task_completed",
        taskId,
        assignee: updatedTask.assignee,
        result: updates.result,
      });
    } else {
      // Generic status change - use error event type for now
      // (Could extend LogEvent union for task_status_changed)
      await logEvent(session, squadId, {
        type: "error",
        message: `Task ${taskId} status changed: ${previousStatus} -> ${updates.status}`,
      });
    }
  }

  return updatedTask;
}

// ============================================================================
// Task Completion - Explicit Domain Operation
// ============================================================================

/**
 * Complete a task with a result.
 *
 * "Make implicit concepts explicit" - Eric Evans
 * Task completion is a first-class domain operation with its own semantics.
 *
 * This is a convenience wrapper around updateTask() that:
 * - Validates the TaskResult at the boundary
 * - Sets the appropriate status based on result.success
 * - Records completedAt timestamp
 *
 * @param session - Parent session
 * @param squadId - Squad containing the task
 * @param taskId - Task to complete
 * @param result - TaskResult with success/failure info
 * @returns Updated TaskState
 * @throws {StorageError} If squad or task not found
 * @throws {ValidationError} If result is invalid
 *
 * @example
 * // Success case
 * const completed = await completeTask(session, squadId, taskId, {
 *   success: true,
 *   output: { files: ["src/auth/login.ts"] },
 *   metrics: { duration: 45000, tokensUsed: 1500 }
 * });
 *
 * @example
 * // Failure case
 * const failed = await completeTask(session, squadId, taskId, {
 *   success: false,
 *   error: { code: "TIMEOUT", message: "Task exceeded timeout" }
 * });
 */
export async function completeTask(
  session: Session,
  squadId: string,
  taskId: string,
  result: TaskResult
): Promise<TaskState> {
  // Validate at boundary
  const validatedResult = validateTaskResult(result);

  // Determine status from result
  const status: Status = validatedResult.success ? "completed" : "failed";

  // Delegate to updateTask with appropriate fields
  return updateTask(session, squadId, taskId, {
    status,
    completedAt: new Date().toISOString(),
    result: validatedResult,
  });
}
