/**
 * Watchdog Tests - Squad Timeout Monitoring
 *
 * "If you can't measure it, you can't improve it." - Brendan Gregg
 *
 * @author Kent Beck's TDD Approach
 */

import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { mkdtemp, rm } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { existsSync } from "fs";

import { FileStorageAdapter } from "../storage.js";
import { createSession } from "../session.js";
import { createSquad, getSquad, updateSquadState } from "../squad.js";
import { assignTask, updateTask } from "../task.js";
import { checkSquadTimeout, checkTaskTimeout, markSquadExpired, runWatchdog } from "../watchdog.js";
import { LIMITS } from "../types.js";
import type { Session } from "../session.js";
import type { SquadState, TaskState } from "../types.js";

// ============================================================================
// Test Fixtures
// ============================================================================

let tempDir: string;
let storage: FileStorageAdapter;
let session: Session;
let squadId: string;

beforeEach(async () => {
  tempDir = await mkdtemp(join(tmpdir(), "watchdog-test-"));
  storage = new FileStorageAdapter(tempDir);
  session = await createSession(storage, {
    goal: "Test session for watchdog",
    createdBy: "test-agent",
  });

  const { spec } = await createSquad(session, {
    mission: "Watchdog testing squad",
    operator: "test-operator",
  });
  squadId = spec.squadId;
});

afterEach(async () => {
  if (tempDir && existsSync(tempDir)) {
    await rm(tempDir, { recursive: true, force: true });
  }
});

// ============================================================================
// Helper Functions
// ============================================================================

function createMockSquadState(updatedAt: string): SquadState {
  return {
    squadId: "squad-mock",
    status: "active",
    progress: 50,
    tasks: [],
    sharedContext: {},
    updatedAt,
  };
}

function createMockTaskState(options: {
  startedAt?: string;
  status?: "pending" | "active" | "completed" | "failed";
}): TaskState {
  return {
    taskId: "task-mock",
    assignee: "worker-1",
    status: options.status ?? "active",
    priority: "medium",
    description: "Mock task for testing",
    createdAt: new Date().toISOString(),
    startedAt: options.startedAt,
  };
}

// ============================================================================
// checkSquadTimeout Tests
// ============================================================================

describe("checkSquadTimeout", () => {
  test("should return isExpired: false before timeout", () => {
    const now = new Date();
    const oneMinuteAgo = new Date(now.getTime() - 60 * 1000);
    const squadState = createMockSquadState(oneMinuteAgo.toISOString());

    const status = checkSquadTimeout(squadState);

    expect(status.isExpired).toBe(false);
    expect(status.elapsedMs).toBeGreaterThanOrEqual(60 * 1000);
    expect(status.elapsedMs).toBeLessThan(65 * 1000);
    expect(status.remainingMs).toBeGreaterThan(0);
    expect(status.lastActivityAt).toBe(oneMinuteAgo.toISOString());
  });

  test("should return isExpired: true after timeout", () => {
    const now = new Date();
    const tenMinutesAgo = new Date(now.getTime() - 10 * 60 * 1000);
    const squadState = createMockSquadState(tenMinutesAgo.toISOString());

    const status = checkSquadTimeout(squadState);

    expect(status.isExpired).toBe(true);
    expect(status.elapsedMs).toBeGreaterThanOrEqual(10 * 60 * 1000);
    expect(status.remainingMs).toBeLessThan(0);
  });

  test("should return isExpired: true at exact timeout boundary", () => {
    const now = new Date();
    const exactlyFiveMinutesAgo = new Date(
      now.getTime() - LIMITS.watchdogTimeoutMs
    );
    const squadState = createMockSquadState(exactlyFiveMinutesAgo.toISOString());

    const status = checkSquadTimeout(squadState);

    expect(status.isExpired).toBe(true);
    expect(status.remainingMs).toBeLessThanOrEqual(0);
  });

  test("should respect custom timeout parameter", () => {
    const now = new Date();
    const twoMinutesAgo = new Date(now.getTime() - 2 * 60 * 1000);
    const squadState = createMockSquadState(twoMinutesAgo.toISOString());
    const customTimeoutMs = 60 * 1000; // 1분

    const status = checkSquadTimeout(squadState, customTimeoutMs);

    expect(status.isExpired).toBe(true);
    expect(status.elapsedMs).toBeGreaterThanOrEqual(2 * 60 * 1000);
  });

  test("should return isExpired: false with longer custom timeout", () => {
    const now = new Date();
    const tenMinutesAgo = new Date(now.getTime() - 10 * 60 * 1000);
    const squadState = createMockSquadState(tenMinutesAgo.toISOString());
    const customTimeoutMs = 30 * 60 * 1000; // 30분

    const status = checkSquadTimeout(squadState, customTimeoutMs);

    expect(status.isExpired).toBe(false);
    expect(status.remainingMs).toBeGreaterThan(0);
  });

  test("should calculate correct remaining time", () => {
    const now = new Date();
    const oneMinuteAgo = new Date(now.getTime() - 60 * 1000);
    const squadState = createMockSquadState(oneMinuteAgo.toISOString());

    const status = checkSquadTimeout(squadState);

    const expectedRemaining = LIMITS.watchdogTimeoutMs - 60 * 1000;
    expect(status.remainingMs).toBeGreaterThan(expectedRemaining - 5000);
    expect(status.remainingMs).toBeLessThanOrEqual(expectedRemaining);
  });

  test("should include lastActivityAt in status", () => {
    const timestamp = "2025-02-01T10:30:00.000Z";
    const squadState = createMockSquadState(timestamp);

    const status = checkSquadTimeout(squadState);

    expect(status.lastActivityAt).toBe(timestamp);
  });
});

// ============================================================================
// markSquadExpired Tests
// ============================================================================

describe("markSquadExpired", () => {
  test("should change status to 'failed'", async () => {
    const squad = await getSquad(session, squadId);
    expect(squad?.state.status).toBe("pending");

    const expiredState = await markSquadExpired(session, squadId);

    expect(expiredState.status).toBe("failed");
  });

  test("should persist failed status to storage", async () => {
    await markSquadExpired(session, squadId);

    const squad = await getSquad(session, squadId);
    expect(squad?.state.status).toBe("failed");
  });

  test("should return updated squad state", async () => {
    const result = await markSquadExpired(session, squadId);

    expect(result).toBeDefined();
    expect(result.squadId).toBe(squadId);
    expect(result.status).toBe("failed");
    expect(result.updatedAt).toBeDefined();
  });

  test("should be idempotent - safe to call multiple times", async () => {
    const firstResult = await markSquadExpired(session, squadId);
    const secondResult = await markSquadExpired(session, squadId);

    expect(firstResult.status).toBe("failed");
    expect(secondResult.status).toBe("failed");
    expect(secondResult.squadId).toBe(squadId);
  });

  test("should update the updatedAt timestamp", async () => {
    const squadBefore = await getSquad(session, squadId);
    const beforeUpdatedAt = squadBefore?.state.updatedAt;

    await new Promise((resolve) => setTimeout(resolve, 10));

    const expiredState = await markSquadExpired(session, squadId);

    expect(new Date(expiredState.updatedAt).getTime()).toBeGreaterThan(
      new Date(beforeUpdatedAt!).getTime()
    );
  });

  test("should preserve other squad state fields", async () => {
    await updateSquadState(session, squadId, {
      progress: 75,
      sharedContext: { key: "value" },
    });

    const expiredState = await markSquadExpired(session, squadId);

    expect(expiredState.status).toBe("failed");
    expect(expiredState.progress).toBe(75);
    expect(expiredState.sharedContext).toEqual({ key: "value" });
  });
});

// ============================================================================
// checkTaskTimeout Tests - Fine-grained task observability
// ============================================================================

describe("checkTaskTimeout", () => {
  test("should return null for task that hasn't started", () => {
    // Arrange: task without startedAt (pending task)
    const task = createMockTaskState({ status: "pending" });

    // Act
    const status = checkTaskTimeout(task);

    // Assert: null means no timeout check needed
    expect(status).toBeNull();
  });

  test("should return isExpired: false for recently started task", () => {
    // Arrange: task started 1 minute ago
    const now = new Date();
    const oneMinuteAgo = new Date(now.getTime() - 60 * 1000);
    const task = createMockTaskState({
      startedAt: oneMinuteAgo.toISOString(),
      status: "active",
    });

    // Act
    const status = checkTaskTimeout(task);

    // Assert
    expect(status).not.toBeNull();
    expect(status!.isExpired).toBe(false);
    expect(status!.elapsedMs).toBeGreaterThanOrEqual(60 * 1000);
    expect(status!.remainingMs).toBeGreaterThan(0);
    expect(status!.lastActivityAt).toBe(oneMinuteAgo.toISOString());
  });

  test("should return isExpired: true for expired task", () => {
    // Arrange: task started 10 minutes ago (beyond 5 min default)
    const now = new Date();
    const tenMinutesAgo = new Date(now.getTime() - 10 * 60 * 1000);
    const task = createMockTaskState({
      startedAt: tenMinutesAgo.toISOString(),
      status: "active",
    });

    // Act
    const status = checkTaskTimeout(task);

    // Assert
    expect(status).not.toBeNull();
    expect(status!.isExpired).toBe(true);
    expect(status!.elapsedMs).toBeGreaterThanOrEqual(10 * 60 * 1000);
    expect(status!.remainingMs).toBeLessThan(0);
  });

  test("should respect custom timeout parameter", () => {
    // Arrange: task started 2 minutes ago
    const now = new Date();
    const twoMinutesAgo = new Date(now.getTime() - 2 * 60 * 1000);
    const task = createMockTaskState({
      startedAt: twoMinutesAgo.toISOString(),
      status: "active",
    });
    const customTimeoutMs = 60 * 1000; // 1 minute

    // Act
    const status = checkTaskTimeout(task, customTimeoutMs);

    // Assert: 2 minutes > 1 minute, should be expired
    expect(status).not.toBeNull();
    expect(status!.isExpired).toBe(true);
  });

  test("should use default LIMITS.watchdogTimeoutMs when no timeout specified", () => {
    // Arrange: task started 3 minutes ago (within default 5 min)
    const now = new Date();
    const threeMinutesAgo = new Date(now.getTime() - 3 * 60 * 1000);
    const task = createMockTaskState({
      startedAt: threeMinutesAgo.toISOString(),
      status: "active",
    });

    // Act
    const status = checkTaskTimeout(task);

    // Assert: 3 minutes < 5 minutes, should not be expired
    expect(status).not.toBeNull();
    expect(status!.isExpired).toBe(false);
    expect(status!.remainingMs).toBeGreaterThan(0);
  });
});

// ============================================================================
// runWatchdog Tests - Periodic Health Check
// "If you can't measure it, you can't improve it." - Brendan Gregg
// ============================================================================

describe("runWatchdog", () => {
  test("should return empty results for fresh squads", async () => {
    // Squad was just created, not expired yet
    const summary = await runWatchdog(session);

    expect(summary.checkedSquads).toBe(1);
    expect(summary.checkedTasks).toBe(0);
    expect(summary.expiredSquads).toHaveLength(0);
    expect(summary.expiredTasks).toHaveLength(0);
  });

  test("should detect expired squad", async () => {
    // Simulate squad that was updated 10 minutes ago
    const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();

    // Manually update the squad's updatedAt via storage (simulate old state)
    const squadPath = `${session.sessionPath}/squads/${squadId}/state.json`;
    const currentState = await session.storage.read<SquadState>(squadPath);
    await session.storage.write(squadPath, {
      ...currentState,
      status: "active",
      updatedAt: tenMinutesAgo,
    });

    const summary = await runWatchdog(session);

    expect(summary.expiredSquads).toContain(squadId);
    expect(summary.expiredSquads).toHaveLength(1);
  });

  test("should mark expired squad as failed when not in dryRun mode", async () => {
    // Simulate old squad
    const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();
    const squadPath = `${session.sessionPath}/squads/${squadId}/state.json`;
    const currentState = await session.storage.read<SquadState>(squadPath);
    await session.storage.write(squadPath, {
      ...currentState,
      status: "active",
      updatedAt: tenMinutesAgo,
    });

    await runWatchdog(session, { dryRun: false });

    const squad = await getSquad(session, squadId);
    expect(squad?.state.status).toBe("failed");
  });

  test("should NOT mark expired squad as failed in dryRun mode", async () => {
    // Simulate old squad
    const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();
    const squadPath = `${session.sessionPath}/squads/${squadId}/state.json`;
    const currentState = await session.storage.read<SquadState>(squadPath);
    await session.storage.write(squadPath, {
      ...currentState,
      status: "active",
      updatedAt: tenMinutesAgo,
    });

    const summary = await runWatchdog(session, { dryRun: true });

    expect(summary.expiredSquads).toContain(squadId);

    // Squad should still be active (not mutated)
    const squad = await getSquad(session, squadId);
    expect(squad?.state.status).toBe("active");
  });

  test("should detect expired tasks", async () => {
    // Create and start a task
    const task = await assignTask(session, squadId, {
      assignee: "worker-1",
      description: "Long running task",
    });

    // Start the task with old startedAt (10 minutes ago)
    const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();
    await updateTask(session, squadId, task.taskId, {
      status: "active",
      startedAt: tenMinutesAgo,
    });

    const summary = await runWatchdog(session);

    expect(summary.checkedTasks).toBe(1);
    expect(summary.expiredTasks).toHaveLength(1);
    expect(summary.expiredTasks[0].squadId).toBe(squadId);
    expect(summary.expiredTasks[0].taskId).toBe(task.taskId);
  });

  test("should mark expired tasks as failed when not in dryRun mode", async () => {
    const task = await assignTask(session, squadId, {
      assignee: "worker-1",
      description: "Task to expire",
    });

    const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();
    await updateTask(session, squadId, task.taskId, {
      status: "active",
      startedAt: tenMinutesAgo,
    });

    await runWatchdog(session, { dryRun: false });

    const squad = await getSquad(session, squadId);
    const updatedTask = squad?.state.tasks.find((t) => t.taskId === task.taskId);

    expect(updatedTask?.status).toBe("failed");
    expect(updatedTask?.completedAt).toBeDefined();
    expect(updatedTask?.result).toBeDefined();
  });

  test("should use custom timeouts", async () => {
    // Create a task that started 2 minutes ago
    const task = await assignTask(session, squadId, {
      assignee: "worker-1",
      description: "Quick task",
    });

    const twoMinutesAgo = new Date(Date.now() - 2 * 60 * 1000).toISOString();
    await updateTask(session, squadId, task.taskId, {
      status: "active",
      startedAt: twoMinutesAgo,
    });

    // With default timeout (5 min), should NOT be expired
    const defaultSummary = await runWatchdog(session, { dryRun: true });
    expect(defaultSummary.expiredTasks).toHaveLength(0);

    // With short timeout (1 min), SHOULD be expired
    const shortSummary = await runWatchdog(session, {
      taskTimeoutMs: 60 * 1000,
      dryRun: true,
    });
    expect(shortSummary.expiredTasks).toHaveLength(1);
  });

  test("should skip completed/failed squads", async () => {
    await updateSquadState(session, squadId, {
      status: "completed",
    });

    // Even with old updatedAt, completed squads are skipped
    const squadPath = `${session.sessionPath}/squads/${squadId}/state.json`;
    const currentState = await session.storage.read<SquadState>(squadPath);
    await session.storage.write(squadPath, {
      ...currentState,
      updatedAt: new Date(Date.now() - 10 * 60 * 1000).toISOString(),
    });

    const summary = await runWatchdog(session);

    expect(summary.checkedSquads).toBe(1);
    expect(summary.expiredSquads).toHaveLength(0);
  });

  test("should only check active tasks with startedAt", async () => {
    // Task 1: pending (no startedAt) - should not be checked
    await assignTask(session, squadId, {
      assignee: "worker-1",
      description: "Pending task",
    });

    // Task 2: active with startedAt - should be checked
    const activeTask = await assignTask(session, squadId, {
      assignee: "worker-2",
      description: "Active task",
    });
    await updateTask(session, squadId, activeTask.taskId, {
      status: "active",
      startedAt: new Date().toISOString(),
    });

    const summary = await runWatchdog(session);

    expect(summary.checkedTasks).toBe(1);
  });
});
