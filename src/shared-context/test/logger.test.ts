/**
 * Logger Unit Tests
 *
 * Tests for logEvent and readLog functions
 * Following Red-Green-Refactor cycle
 *
 * @author Kent Beck's TDD Approach
 */

import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { tmpdir } from "os";
import { join } from "path";
import { rm, mkdir } from "fs/promises";
import { existsSync } from "fs";

import { logEvent, readLog } from "../logger.js";
import { FileStorageAdapter } from "../storage.js";
import { createSession } from "../session.js";
import type { LogEvent } from "../types.js";

// ============================================================================
// Test Setup
// ============================================================================

let tempDir: string;
let storage: FileStorageAdapter;

beforeEach(async () => {
  // Create unique temp directory for each test
  tempDir = join(tmpdir(), `logger-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  await mkdir(tempDir, { recursive: true });
  storage = new FileStorageAdapter(tempDir);
});

afterEach(async () => {
  // Clean up temp directory
  if (existsSync(tempDir)) {
    await rm(tempDir, { recursive: true, force: true });
  }
});

// ============================================================================
// Helper Functions
// ============================================================================

async function createTestSession() {
  return createSession(storage, {
    goal: "Test goal",
    createdBy: "test-agent",
  });
}

async function createSquadDir(session: Awaited<ReturnType<typeof createSession>>, squadId: string) {
  // Use mkdir directly with absolute path to avoid ensureDir's path handling issues
  const fullPath = storage.getFullPath(`${session.sessionPath}/squads/${squadId}`);
  await mkdir(fullPath, { recursive: true });
}

// ============================================================================
// logEvent Tests
// ============================================================================

describe("logEvent", () => {
  test("should create log.jsonl file after logging an event", async () => {
    // Arrange
    const session = await createTestSession();
    const squadId = "squad-001";
    await createSquadDir(session, squadId);

    // Act
    await logEvent(session, squadId, {
      type: "squad_started",
      squadId,
      operator: "operator-agent",
    });

    // Assert
    const logPath = storage.getFullPath(`${session.sessionPath}/squads/${squadId}/log.jsonl`);
    expect(existsSync(logPath)).toBe(true);
  });

  test("should append multiple events in order", async () => {
    // Arrange
    const session = await createTestSession();
    const squadId = "squad-002";
    await createSquadDir(session, squadId);

    // Act - Log three events
    await logEvent(session, squadId, {
      type: "squad_started",
      squadId,
      operator: "operator-agent",
    });

    await logEvent(session, squadId, {
      type: "task_assigned",
      taskId: "task-001",
      assignee: "worker-agent",
      description: "First task",
    });

    await logEvent(session, squadId, {
      type: "task_completed",
      taskId: "task-001",
      assignee: "worker-agent",
      result: { success: true },
    });

    // Assert - Read and verify order
    const events = await readLog(session, squadId);
    expect(events).toHaveLength(3);
    expect(events[0].type).toBe("squad_started");
    expect(events[1].type).toBe("task_assigned");
    expect(events[2].type).toBe("task_completed");
  });

  test("should auto-generate ts field with ISO timestamp", async () => {
    // Arrange
    const session = await createTestSession();
    const squadId = "squad-003";
    await createSquadDir(session, squadId);
    const beforeTime = new Date().toISOString();

    // Act
    await logEvent(session, squadId, {
      type: "error",
      message: "Something went wrong",
      source: "test-agent",
    });

    const afterTime = new Date().toISOString();

    // Assert
    const events = await readLog(session, squadId);
    expect(events).toHaveLength(1);
    expect(events[0].ts).toBeDefined();
    expect(typeof events[0].ts).toBe("string");
    // Verify ts is between before and after
    expect(events[0].ts >= beforeTime).toBe(true);
    expect(events[0].ts <= afterTime).toBe(true);
  });

  test("should preserve all event properties", async () => {
    // Arrange
    const session = await createTestSession();
    const squadId = "squad-004";
    await createSquadDir(session, squadId);

    // Act
    await logEvent(session, squadId, {
      type: "context_updated",
      key: "shared-data",
      updatedBy: "agent-x",
    });

    // Assert
    const events = await readLog(session, squadId);
    expect(events).toHaveLength(1);

    const event = events[0] as Extract<LogEvent, { type: "context_updated" }>;
    expect(event.type).toBe("context_updated");
    expect(event.key).toBe("shared-data");
    expect(event.updatedBy).toBe("agent-x");
  });
});

// ============================================================================
// readLog Tests
// ============================================================================

describe("readLog", () => {
  test("should return all logged events", async () => {
    // Arrange
    const session = await createTestSession();
    const squadId = "squad-005";
    await createSquadDir(session, squadId);

    // Log events
    await logEvent(session, squadId, {
      type: "squad_started",
      squadId,
      operator: "op-agent",
    });

    await logEvent(session, squadId, {
      type: "squad_completed",
      squadId,
      finalStatus: "completed",
    });

    // Act
    const events = await readLog(session, squadId);

    // Assert
    expect(events).toHaveLength(2);
    expect(events[0].type).toBe("squad_started");
    expect(events[1].type).toBe("squad_completed");
  });

  test("should return empty array for empty log", async () => {
    // Arrange
    const session = await createTestSession();
    const squadId = "squad-006";
    await createSquadDir(session, squadId);

    // Create an empty log file
    const logPath = `${session.sessionPath}/squads/${squadId}/log.jsonl`;
    await Bun.write(storage.getFullPath(logPath), "");

    // Act
    const events = await readLog(session, squadId);

    // Assert
    expect(events).toEqual([]);
  });

  test("should return empty array when log file does not exist", async () => {
    // Arrange
    const session = await createTestSession();
    const squadId = "nonexistent-squad";
    // Intentionally NOT creating the squad directory

    // Act
    const events = await readLog(session, squadId);

    // Assert
    expect(events).toEqual([]);
  });

  test("should correctly parse all LogEvent types", async () => {
    // Arrange
    const session = await createTestSession();
    const squadId = "squad-007";
    await createSquadDir(session, squadId);

    // Log all event types
    await logEvent(session, squadId, {
      type: "squad_started",
      squadId,
      operator: "op",
    });

    await logEvent(session, squadId, {
      type: "task_assigned",
      taskId: "t1",
      assignee: "a1",
      description: "Do something",
    });

    await logEvent(session, squadId, {
      type: "task_completed",
      taskId: "t1",
      assignee: "a1",
    });

    await logEvent(session, squadId, {
      type: "context_updated",
      key: "data",
      updatedBy: "a1",
    });

    await logEvent(session, squadId, {
      type: "squad_completed",
      squadId,
      finalStatus: "completed",
    });

    await logEvent(session, squadId, {
      type: "error",
      message: "Oops",
    });

    // Act
    const events = await readLog(session, squadId);

    // Assert
    expect(events).toHaveLength(6);
    expect(events.map((e) => e.type)).toEqual([
      "squad_started",
      "task_assigned",
      "task_completed",
      "context_updated",
      "squad_completed",
      "error",
    ]);
  });
});
