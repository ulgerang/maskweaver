/**
 * Shared Context Type Definitions
 *
 * Core types for multi-agent collaboration system.
 * "State. You're doing it wrong." - Rich Hickey
 *
 * Design principles:
 * - Data is immutable and validatable
 * - Validate at boundaries, trust internally
 * - Parse, don't validate
 *
 * @author Kent Beck's Dummy Human
 */

import { z } from "zod";


// ============================================================================
// Base Types
// ============================================================================

/** Lifecycle status for squads and tasks */
export type Status = "pending" | "active" | "paused" | "completed" | "failed";

/** Task priority levels */
export type Priority = "low" | "medium" | "high" | "critical";

/** Unique identifier for an agent */
export type AgentId = string;

/** UUID for correlation across events */
export type CorrelationId = string;

/**
 * Generic result type for operations that may fail.
 * Use this pattern instead of throwing for expected failures.
 *
 * @template T - The type of data on success
 */
export interface Result<T> {
  /** Whether the operation succeeded */
  success: boolean;
  /** The result data (only present on success) */
  data?: T;
  /** Error message (only present on failure) */
  error?: string;
}

// ============================================================================
// Zod Schemas - Validate at boundaries, trust internally
// ============================================================================

/** Status enum schema */
export const StatusSchema = z.enum(["pending", "active", "paused", "completed", "failed"]);

/** Priority enum schema */
export const PrioritySchema = z.enum(["low", "medium", "high", "critical"]);

/** Agent ID schema (non-empty string) */
export const AgentIdSchema = z.string().min(1);

/** Correlation ID schema (UUID format) */
export const CorrelationIdSchema = z.string().uuid();

// ============================================================================
// Manifest - Session metadata and configuration
// ============================================================================

/**
 * Session manifest containing metadata and squad references.
 * This is the root document for a collaboration session.
 */
export interface Manifest {
  /** UUID of the session */
  sessionId: string;
  /** Schema version for migration support */
  version: number;
  /** High-level goal for the session */
  goal: string;
  /** ISO timestamp of creation */
  createdAt: string;
  /** Agent ID of the session creator */
  createdBy: AgentId;
  /** List of squad IDs in this session */
  squads: string[];
  /** Optional resource constraints */
  constraints?: {
    /** Maximum duration (e.g., "1h", "30m") */
    timeout?: string;
    /** Maximum token budget */
    tokenBudget?: number;
  };
}

/** Manifest schema for runtime validation */
export const ManifestSchema = z.object({
  sessionId: z.string().uuid(),
  version: z.number().int().positive(),
  goal: z.string().min(1),
  createdAt: z.string().datetime(),
  createdBy: AgentIdSchema,
  squads: z.array(z.string()),
  constraints: z.object({
    timeout: z.string().optional(),
    tokenBudget: z.number().optional(),
  }).optional(),
});

// ============================================================================
// Squad Specification - Immutable squad configuration
// ============================================================================

/**
 * Squad specification defining mission, constraints, and scope.
 * Immutable after creation - use SquadState for mutable data.
 */
export interface SquadSpec {
  /** Unique squad identifier (e.g., "squad-a1b2c3d4") */
  squadId: string;
  /** The squad's mission objective */
  mission: string;
  /** Agent ID of the squad operator */
  operator: AgentId;
  /** Resource constraints for the squad */
  constraints?: {
    /** Maximum duration */
    timeout?: string;
    /** Maximum token budget */
    tokenBudget?: number;
    /** Maximum number of worker agents */
    maxWorkers?: number;
  };
  /** File and directory scope for the squad */
  scope?: {
    /** Files the squad can modify */
    files?: string[];
    /** Directories the squad can access */
    directories?: string[];
  };
  /** ISO timestamp of creation */
  createdAt: string;
}

/** SquadSpec schema for runtime validation */
export const SquadSpecSchema = z.object({
  squadId: z.string().min(1),
  mission: z.string().min(1),
  operator: AgentIdSchema,
  constraints: z.object({
    timeout: z.string().optional(),
    tokenBudget: z.number().optional(),
    maxWorkers: z.number().optional(),
  }).optional(),
  scope: z.object({
    files: z.array(z.string()).optional(),
    directories: z.array(z.string()).optional(),
  }).optional(),
  createdAt: z.string().datetime(),
});

// ============================================================================
// Squad State - Mutable squad runtime state
// ============================================================================

/**
 * Individual task state within a squad.
 */
export interface TaskState {
  /** Unique task identifier */
  taskId: string;
  /** Agent assigned to this task */
  assignee: AgentId;
  /** Current task status */
  status: Status;
  /** Task priority */
  priority: Priority;
  /** Human-readable task description */
  description: string;
  /** IDs of tasks this depends on */
  dependencies?: string[];
  /** ISO timestamp of creation */
  createdAt: string;
  /** ISO timestamp when work started */
  startedAt?: string;
  /** ISO timestamp when completed */
  completedAt?: string;
  /** Task result data */
  result?: unknown;
}

/** TaskState schema for runtime validation */
export const TaskStateSchema = z.object({
  taskId: z.string().min(1),
  assignee: AgentIdSchema,
  status: StatusSchema,
  priority: PrioritySchema,
  description: z.string().min(1),
  dependencies: z.array(z.string()).optional(),
  createdAt: z.string().datetime(),
  startedAt: z.string().datetime().optional(),
  completedAt: z.string().datetime().optional(),
  result: z.unknown().optional(),
});

// ============================================================================
// Task Creation & Result - Explicit domain concepts for task lifecycle
// ============================================================================

/**
 * Options for creating a new task.
 * "Make implicit concepts explicit" - Eric Evans
 */
export interface CreateTaskOptions {
  /** Agent responsible for executing this task */
  assignee: AgentId;
  /** Human-readable description of what needs to be done */
  description: string;
  /** Task priority (defaults to 'medium' if not specified) */
  priority?: Priority;
  /** Task IDs that must complete before this task can start */
  dependencies?: string[];
  /** Maximum time allowed for task execution in milliseconds */
  timeout?: number;
}

/** CreateTaskOptions schema for runtime validation */
export const CreateTaskOptionsSchema = z.object({
  assignee: AgentIdSchema,
  description: z.string().min(1, "Description cannot be empty"),
  priority: PrioritySchema.optional(),
  dependencies: z.array(z.string().min(1)).optional(),
  timeout: z.number().int().positive().optional(),
});

/** Structured error information for failed tasks */
export interface TaskError {
  /** Machine-readable error code (e.g., "TIMEOUT", "DEPENDENCY_FAILED") */
  code: string;
  /** Human-readable error description */
  message: string;
}

/** TaskError schema */
export const TaskErrorSchema = z.object({
  code: z.string().min(1),
  message: z.string().min(1),
});

/** Execution metrics captured during task processing */
export interface TaskMetrics {
  /** Task execution duration in milliseconds */
  duration: number;
  /** Number of tokens consumed (if applicable) */
  tokensUsed?: number;
}

/** TaskMetrics schema */
export const TaskMetricsSchema = z.object({
  duration: z.number().int().nonnegative(),
  tokensUsed: z.number().int().nonnegative().optional(),
});

/** The outcome of a completed task */
export interface TaskResult {
  /** Whether the task completed successfully */
  success: boolean;
  /** Task output data (present on success) */
  output?: unknown;
  /** Structured error information (present on failure) */
  error?: TaskError;
  /** Execution metrics for observability */
  metrics?: TaskMetrics;
}

/** TaskResult schema for runtime validation */
export const TaskResultSchema = z.object({
  success: z.boolean(),
  output: z.unknown().optional(),
  error: TaskErrorSchema.optional(),
  metrics: TaskMetricsSchema.optional(),
}).refine(
  (data) => {
    if (!data.success && !data.error) return false;
    if (data.success && data.error) return false;
    return true;
  },
  { message: "Failed tasks must have error, successful tasks must not have error" }
);

// ============================================================================
// Timeout Configuration - Watchdog and deadline management
// ============================================================================

/** Actions to take when a timeout occurs */
export type TimeoutAction = "fail" | "pause" | "notify";

/** Timeout action schema */
export const TimeoutActionSchema = z.enum(["fail", "pause", "notify"]);

/** Custom timeout configuration for squads and tasks */
export interface TimeoutConfig {
  /** Custom timeout in milliseconds (overrides LIMITS.watchdogTimeoutMs) */
  timeoutMs?: number;
  /** Grace period before hard kill */
  gracePeriodMs?: number;
  /** Action to take on timeout: fail (default), pause for retry, or notify only */
  onTimeout?: TimeoutAction;
}

/** TimeoutConfig schema for runtime validation */
export const TimeoutConfigSchema = z.object({
  timeoutMs: z.number().int().positive().optional(),
  gracePeriodMs: z.number().int().positive().optional(),
  onTimeout: TimeoutActionSchema.optional(),
});

/** Real-time timeout status from watchdog health check */
export interface TimeoutStatus {
  /** Whether the timeout has expired */
  isExpired: boolean;
  /** Milliseconds elapsed since start or last activity */
  elapsedMs: number;
  /** Milliseconds remaining before timeout (negative if expired) */
  remainingMs: number;
  /** ISO timestamp of last recorded activity */
  lastActivityAt: string;
}

/** TimeoutStatus schema for runtime validation */
export const TimeoutStatusSchema = z.object({
  isExpired: z.boolean(),
  elapsedMs: z.number().int().nonnegative(),
  remainingMs: z.number().int(),
  lastActivityAt: z.string().datetime(),
});

/**
 * Mutable squad state including status, progress, and tasks.
 * Updated frequently as work progresses.
 */
export interface SquadState {
  /** Squad ID (matches SquadSpec.squadId) */
  squadId: string;
  /** Current squad status */
  status: Status;
  /** Progress percentage (0-100) */
  progress: number;
  /** List of tasks in this squad */
  tasks: TaskState[];
  /** Shared context data between workers */
  sharedContext: Record<string, unknown>;
  /** ISO timestamp of last update */
  updatedAt: string;
}

/** SquadState schema for runtime validation */
export const SquadStateSchema = z.object({
  squadId: z.string().min(1),
  status: StatusSchema,
  progress: z.number().min(0).max(100),
  tasks: z.array(TaskStateSchema),
  sharedContext: z.record(z.string(), z.unknown()),
  updatedAt: z.string().datetime(),
});

// Session (session.ts:41-48)
export interface Session {
  manifest: Manifest;
  storage: StorageAdapter;
  sessionPath: string;
}

import { StorageAdapter } from "./storage.js";

// ============================================================================
// Log Events - Discriminated union for event types
// ============================================================================

/**
 * Discriminated union of all possible log event types.
 * Each event has a `type` field for discrimination and `ts` for timestamp.
 */
export type LogEvent =
  | {
      type: "squad_started";
      ts: string;
      squadId: string;
      operator: AgentId;
    }
  | {
      type: "task_assigned";
      ts: string;
      taskId: string;
      assignee: AgentId;
      description: string;
    }
  | {
      type: "task_completed";
      ts: string;
      taskId: string;
      assignee: AgentId;
      result?: unknown;
    }
  | {
      type: "context_updated";
      ts: string;
      key: string;
      updatedBy: AgentId;
    }
  | {
      type: "squad_completed";
      ts: string;
      squadId: string;
      finalStatus: Status;
    }
  | {
      type: "error";
      ts: string;
      message: string;
      source?: AgentId;
    };

/**
 * Log event input type (without timestamp).
 * Used for logEvent() function - timestamp is added automatically.
 */
export type LogEventInput =
  | {
      type: "squad_started";
      squadId: string;
      operator: AgentId;
    }
  | {
      type: "task_assigned";
      taskId: string;
      assignee: AgentId;
      description: string;
    }
  | {
      type: "task_completed";
      taskId: string;
      assignee: AgentId;
      result?: unknown;
    }
  | {
      type: "context_updated";
      key: string;
      updatedBy: AgentId;
    }
  | {
      type: "squad_completed";
      squadId: string;
      finalStatus: Status;
    }
  | {
      type: "error";
      message: string;
      source?: AgentId;
    };

/** LogEvent schema for runtime validation (discriminated union) */
export const LogEventSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("squad_started"),
    ts: z.string().datetime(),
    squadId: z.string(),
    operator: AgentIdSchema,
  }),
  z.object({
    type: z.literal("task_assigned"),
    ts: z.string().datetime(),
    taskId: z.string(),
    assignee: AgentIdSchema,
    description: z.string(),
  }),
  z.object({
    type: z.literal("task_completed"),
    ts: z.string().datetime(),
    taskId: z.string(),
    assignee: AgentIdSchema,
    result: z.unknown().optional(),
  }),
  z.object({
    type: z.literal("context_updated"),
    ts: z.string().datetime(),
    key: z.string(),
    updatedBy: AgentIdSchema,
  }),
  z.object({
    type: z.literal("squad_completed"),
    ts: z.string().datetime(),
    squadId: z.string(),
    finalStatus: StatusSchema,
  }),
  z.object({
    type: z.literal("error"),
    ts: z.string().datetime(),
    message: z.string(),
    source: AgentIdSchema.optional(),
  }),
]);

// ============================================================================
// Limits and Constants
// ============================================================================

/**
 * System limits to prevent resource exhaustion.
 * These values are enforced at runtime.
 * 
 * Watchdog timeouts follow the principle:
 * "If you can't measure it, you can't improve it." - Brendan Gregg
 */
export const LIMITS = {
  /** Maximum number of squads per session */
  maxSquadsPerSession: 10,
  /** Maximum number of worker agents per squad */
  maxWorkersPerSquad: 5,
  /** Maximum number of tasks per squad */
  maxTasksPerSquad: 50,
  /** Maximum size of shared context data (1MB) */
  maxSharedContextSize: 1024 * 1024,
  /** Maximum size of log file (10MB) */
  maxLogSize: 10 * 1024 * 1024,
  /** Lock acquisition timeout in milliseconds */
  lockTimeout: 5000,
  /** Time after which a lock is considered stale (ms) */
  lockStale: 30000,
  /** Number of retry attempts for lock acquisition */
  lockRetries: 3,
  /** Default watchdog timeout (5 minutes) - kills stuck agents */
  watchdogTimeoutMs: 5 * 60 * 1000,
  /** Watchdog health check interval (30 seconds) */
  watchdogCheckIntervalMs: 30 * 1000,
  /** Grace period before hard timeout (10 seconds) - allows cleanup */
  watchdogGracePeriodMs: 10 * 1000,
} as const;

// ============================================================================
// Validation Functions - Parse, don't validate
// ============================================================================

/**
 * Validate manifest data at system boundaries.
 * Parse once at the edge, trust internally.
 *
 * @param data - Unknown data from external source
 * @returns Validated Manifest
 * @throws {z.ZodError} If validation fails
 */
export function validateManifest(data: unknown): Manifest {
  return ManifestSchema.parse(data);
}

/**
 * Validate squad spec data.
 *
 * @param data - Unknown data from external source
 * @returns Validated SquadSpec
 * @throws {z.ZodError} If validation fails
 */
export function validateSquadSpec(data: unknown): SquadSpec {
  return SquadSpecSchema.parse(data);
}

/**
 * Validate squad state data.
 *
 * @param data - Unknown data from external source
 * @returns Validated SquadState
 * @throws {z.ZodError} If validation fails
 */
export function validateSquadState(data: unknown): SquadState {
  return SquadStateSchema.parse(data);
}

/**
 * Validate task state data.
 *
 * @param data - Unknown data from external source
 * @returns Validated TaskState
 * @throws {z.ZodError} If validation fails
 */
export function validateTaskState(data: unknown): TaskState {
  return TaskStateSchema.parse(data);
}

/**
 * Validate log event data.
 *
 * @param data - Unknown data from external source
 * @returns Validated LogEvent
 * @throws {z.ZodError} If validation fails
 */
export function validateLogEvent(data: unknown): LogEvent {
  return LogEventSchema.parse(data);
}

/**
 * Validate task creation options.
 */
export function validateCreateTaskOptions(data: unknown): CreateTaskOptions {
  return CreateTaskOptionsSchema.parse(data);
}

/**
 * Validate task result data.
 */
export function validateTaskResult(data: unknown): TaskResult {
  return TaskResultSchema.parse(data);
}

/**
 * Validate timeout config data.
 */
export function validateTimeoutConfig(data: unknown): TimeoutConfig {
  return TimeoutConfigSchema.parse(data);
}

/**
 * Validate timeout status data.
 */
export function validateTimeoutStatus(data: unknown): TimeoutStatus {
  return TimeoutStatusSchema.parse(data);
}

// ============================================================================
// Safe Validation - Result pattern (doesn't throw)
// ============================================================================

/**
 * Safely validate manifest data without throwing.
 *
 * @param data - Unknown data from external source
 * @returns Result with validated data or error message
 */
export function safeValidateManifest(data: unknown): Result<Manifest> {
  const result = ManifestSchema.safeParse(data);
  if (result.success) {
    return { success: true, data: result.data };
  }
  return { success: false, error: result.error.message };
}

/**
 * Safely validate squad spec data without throwing.
 *
 * @param data - Unknown data from external source
 * @returns Result with validated data or error message
 */
export function safeValidateSquadSpec(data: unknown): Result<SquadSpec> {
  const result = SquadSpecSchema.safeParse(data);
  if (result.success) {
    return { success: true, data: result.data };
  }
  return { success: false, error: result.error.message };
}

/**
 * Safely validate squad state data without throwing.
 *
 * @param data - Unknown data from external source
 * @returns Result with validated data or error message
 */
export function safeValidateSquadState(data: unknown): Result<SquadState> {
  const result = SquadStateSchema.safeParse(data);
  if (result.success) {
    return { success: true, data: result.data };
  }
  return { success: false, error: result.error.message };
}
