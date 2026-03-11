/**
 * Maskweaver Squad Tool Tests
 */

import { test, expect, describe, beforeEach, afterEach } from "vitest";
import { mkdirSync, rmSync, existsSync } from "fs";
import { join } from "path";
import { createSquadTool } from "../src/plugin/tools/squad.js";
import type { ToolContext } from "../src/plugin/types.js";

// ============================================================================
// Test Setup & Helpers
// ============================================================================

function createTempDir(): string {
  const tempDir = join(process.cwd(), "test-temp", `squad-test-${Date.now()}`);
  mkdirSync(tempDir, { recursive: true });
  return tempDir;
}

function cleanupTempDir(dir: string): void {
  if (existsSync(dir)) {
    rmSync(dir, { recursive: true, force: true });
  }
}

function parseResponse(jsonString: string): any {
  return JSON.parse(jsonString);
}

function createTestContext(worktree: string): ToolContext {
  return { worktree };
}

// ============================================================================
// Squad Tool Tests
// ============================================================================

describe("Squad Tool", () => {
  let tempDir: string;
  let context: ToolContext;
  let tool: any;

  beforeEach(() => {
    tempDir = createTempDir();
    context = createTestContext(tempDir);
    tool = createSquadTool();
  });

  afterEach(() => {
    cleanupTempDir(tempDir);
  });

  test("should create tool with description and schema", () => {
    expect(tool).toBeDefined();
    expect(tool.description).toContain("Multi-agent collaboration");
    expect(tool.args).toBeDefined();
    expect(tool.execute).toBeDefined();
  });

  test("start: should start a new session", async () => {
    const response = await tool.execute(
      { action: "start", goal: "Test Session" },
      context
    );

    const parsed = parseResponse(response);
    expect(parsed.success).toBe(true);
    expect(parsed.action).toBe("start");
    expect(parsed.data.goal).toBe("Test Session");
    expect(parsed.data.sessionId).toBeDefined();
  });

  test("start: should fail if goal is missing", async () => {
    const response = await tool.execute(
      { action: "start" },
      context
    );

    const parsed = parseResponse(response);
    expect(parsed.success).toBe(false);
    expect(parsed.message).toContain("Session goal (goal) is required");
  });

  test("squad: should create a new squad", async () => {
    // Start session first
    await tool.execute({ action: "start", goal: "Test Session" }, context);

    const response = await tool.execute(
      { 
        action: "squad", 
        mission: "Test Mission", 
        operator: "test-operator" 
      },
      context
    );

    const parsed = parseResponse(response);
    expect(parsed.success).toBe(true);
    expect(parsed.action).toBe("squad");
    expect(parsed.data.mission).toBe("Test Mission");
    expect(parsed.data.squadId).toBeDefined();
    expect(parsed.data.operator).toBe("test-operator");
  });

  test("squad: should fail if no active session", async () => {
    const response = await tool.execute(
      { 
        action: "squad", 
        mission: "Test Mission", 
        operator: "test-operator" 
      },
      context
    );

    const parsed = parseResponse(response);
    expect(parsed.success).toBe(false);
    expect(parsed.message).toContain("No active session");
  });

  test("assign: should assign a task", async () => {
    // Setup session and squad
    await tool.execute({ action: "start", goal: "Test Session" }, context);
    const squadResponse = await tool.execute(
      { action: "squad", mission: "Test Mission", operator: "test-operator" },
      context
    );
    const { squadId } = parseResponse(squadResponse).data;

    const response = await tool.execute(
      { 
        action: "assign", 
        squadId, 
        assignee: "worker-1", 
        description: "Test Task" 
      },
      context
    );

    const parsed = parseResponse(response);
    expect(parsed.success).toBe(true);
    expect(parsed.action).toBe("assign");
    expect(parsed.data.assignee).toBe("worker-1");
    expect(parsed.data.description).toBe("Test Task");
    expect(parsed.data.taskId).toBeDefined();
  });

  test("update: should update task status", async () => {
    // Setup session, squad, and task
    await tool.execute({ action: "start", goal: "Test Session" }, context);
    const squadRes = await tool.execute({ action: "squad", mission: "M", operator: "O" }, context);
    const { squadId } = parseResponse(squadRes).data;
    const assignRes = await tool.execute({ action: "assign", squadId, assignee: "W", description: "D" }, context);
    const { taskId } = parseResponse(assignRes).data;

    const response = await tool.execute(
      { 
        action: "update", 
        squadId, 
        taskId, 
        status: "active" 
      },
      context
    );

    const parsed = parseResponse(response);
    expect(parsed.success).toBe(true);
    expect(parsed.data.status).toBe("active");
  });

  test("complete: should complete a task", async () => {
    // Setup
    await tool.execute({ action: "start", goal: "Test Session" }, context);
    const squadRes = await tool.execute({ action: "squad", mission: "M", operator: "O" }, context);
    const { squadId } = parseResponse(squadRes).data;
    const assignRes = await tool.execute({ action: "assign", squadId, assignee: "W", description: "D" }, context);
    const { taskId } = parseResponse(assignRes).data;

    const response = await tool.execute(
      { 
        action: "complete", 
        squadId, 
        taskId, 
        success: true,
        output: { result: "ok" }
      },
      context
    );

    const parsed = parseResponse(response);
    expect(parsed.success).toBe(true);
    expect(parsed.data.status).toBe("completed");
    expect(parsed.data.result.output.result).toBe("ok");
  });

  test("status: should show session status", async () => {
    await tool.execute({ action: "start", goal: "Test Session" }, context);
    await tool.execute({ action: "squad", mission: "M1", operator: "O1" }, context);

    const response = await tool.execute({ action: "status" }, context);
    const parsed = parseResponse(response);
    
    expect(parsed.success).toBe(true);
    expect(parsed.data.goal).toBe("Test Session");
    expect(parsed.data.squadCount).toBe(1);
  });

  test("list: should list squads", async () => {
    await tool.execute({ action: "start", goal: "Test Session" }, context);
    await tool.execute({ action: "squad", mission: "M1", operator: "O1" }, context);
    await tool.execute({ action: "squad", mission: "M2", operator: "O2" }, context);

    const response = await tool.execute({ action: "list" }, context);
    const parsed = parseResponse(response);

    expect(parsed.success).toBe(true);
    expect(parsed.data.total).toBe(2);
    expect(parsed.data.squads.length).toBe(2);
  });

  test("watchdog: should run watchdog", async () => {
    await tool.execute({ action: "start", goal: "Test Session" }, context);
    
    const response = await tool.execute({ action: "watchdog" }, context);
    const parsed = parseResponse(response);

    expect(parsed.success).toBe(true);
    expect(parsed.data.checkedSquads).toBeDefined();
  });
});
