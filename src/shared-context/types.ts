/**
 * Shared Context Type Definitions
 * 
 * Core types for multi-agent collaboration system
 * 
 * @author Kent Beck's Dummy Human
 */

// ============================================================================
// Base Types
// ============================================================================

export type Status = "pending" | "active" | "paused" | "completed" | "failed";
export type Priority = "low" | "medium" | "high" | "critical";
export type AgentId = string;
export type CorrelationId = string;

/**
 * Result type pattern for operations
 */
export interface Result<T> {
  success: boolean;
  data?: T;
  error?: string;
}

// ============================================================================
// Manifest
// ============================================================================

export interface Manifest {
  sessionId: string;
  version: number;
  goal: string;
  createdAt: string;
  createdBy: AgentId;
  squads: string[];
  constraints?: {
    timeout?: string;
    tokenBudget?: number;
  };
}

// ============================================================================
// Squad Specification
// ============================================================================

export interface SquadSpec {
  squadId: string;
  mission: string;
  operator: AgentId;
  constraints?: {
    timeout?: string;
    tokenBudget?: number;
    maxWorkers?: number;
  };
  scope?: {
    files?: string[];
    directories?: string[];
  };
  createdAt: string;
}

// ============================================================================
// Squad State
// ============================================================================

export interface TaskState {
  taskId: string;
  assignee: AgentId;
  status: Status;
  priority: Priority;
  description: string;
  dependencies?: string[];
  createdAt: string;
  startedAt?: string;
  completedAt?: string;
  result?: unknown;
}

export interface SquadState {
  squadId: string;
  status: Status;
  progress: number;
  tasks: TaskState[];
  sharedContext: Record<string, unknown>;
  updatedAt: string;
}

// ============================================================================
// Log Events (Discriminated Union)
// ============================================================================

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

// ============================================================================
// Limits and Constants
// ============================================================================

export const LIMITS = {
  maxSquadsPerSession: 10,
  maxWorkersPerSquad: 5,
  maxTasksPerSquad: 50,
  maxSharedContextSize: 1024 * 1024, // 1MB
  maxLogSize: 10 * 1024 * 1024, // 10MB
} as const;
