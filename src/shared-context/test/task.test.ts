/**
 * Task Management Tests
 *
 * "테스트가 없으면 버그가 아니다" - Kent Beck
 *
 * @author Kent Beck's TDD Approach
 */

import { describe, test, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { existsSync } from "fs";

import { FileStorageAdapter } from "../storage.js";
import { createSession } from "../session.js";
import { createSquad, getSquad } from "../squad.js";
import { assignTask, getTask, updateTask, completeTask } from "../task.js";
import { LIMITS } from "../types.js";
import type { Session } from "../session.js";
import type { TaskResult } from "../types.js";

// ============================================================================
// Test Fixtures
// ============================================================================

let tempDir: string;
let storage: FileStorageAdapter;
let session: Session;
let squadId: string;

beforeEach(async () => {
  tempDir = await mkdtemp(join(tmpdir(), "task-test-"));
  storage = new FileStorageAdapter(tempDir);
  session = await createSession(storage, {
    goal: "Test session for task management",
    createdBy: "test-agent",
  });

  const { spec } = await createSquad(session, {
    mission: "Task testing squad",
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
// assignTask Tests
// ============================================================================

describe("assignTask", () => {
  test("should successfully assign a task to a squad", async () => {
    const task = await assignTask(session, squadId, {
      assignee: "worker-1",
      description: "Implement login feature",
    });

    expect(task).toBeDefined();
    expect(task.taskId).toMatch(/^task-[a-f0-9]{8}$/);
    expect(task.assignee).toBe("worker-1");
    expect(task.description).toBe("Implement login feature");
    expect(task.status).toBe("pending");
  });

  test("should add task to squad's tasks array", async () => {
    const task = await assignTask(session, squadId, {
      assignee: "worker-1",
      description: "First task",
    });

    const squad = await getSquad(session, squadId);
    expect(squad?.state.tasks).toHaveLength(1);
    expect(squad?.state.tasks[0].taskId).toBe(task.taskId);
  });

  test("should throw StorageError when squad does not exist", async () => {
    expect(
      assignTask(session, "squad-nonexistent", {
        assignee: "worker-1",
        description: "Orphan task",
      })
    ).rejects.toThrow("Squad not found: squad-nonexistent");
  });

  test("should throw ValidationError when max tasks per squad exceeded", async () => {
    // Arrange: 최대 개수만큼 Task 생성
    for (let i = 0; i < LIMITS.maxTasksPerSquad; i++) {
      await assignTask(session, squadId, {
        assignee: `worker-${i}`,
        description: `Task ${i}`,
      });
    }

    // Act & Assert: 한도 초과 시 에러
    expect(
      assignTask(session, squadId, {
        assignee: "worker-overflow",
        description: "One too many",
      })
    ).rejects.toThrow("Maximum tasks per squad exceeded");
  });

  test("should create task with correct fields", async () => {
    const beforeTime = new Date().toISOString();

    const task = await assignTask(session, squadId, {
      assignee: "worker-alpha",
      description: "Build authentication module",
      priority: "high",
      dependencies: ["task-setup", "task-config"],
    });

    const afterTime = new Date().toISOString();

    expect(task.taskId).toMatch(/^task-[a-f0-9]{8}$/);
    expect(task.assignee).toBe("worker-alpha");
    expect(task.status).toBe("pending");
    expect(task.priority).toBe("high");
    expect(task.description).toBe("Build authentication module");
    expect(task.dependencies).toEqual(["task-setup", "task-config"]);
    expect(task.createdAt).toBeDefined();
    expect(task.createdAt >= beforeTime).toBe(true);
    expect(task.createdAt <= afterTime).toBe(true);
  });

  test("should use default priority 'medium' when not specified", async () => {
    const task = await assignTask(session, squadId, {
      assignee: "worker-1",
      description: "Default priority task",
    });

    expect(task.priority).toBe("medium");
  });

  test("should persist task to storage", async () => {
    const task = await assignTask(session, squadId, {
      assignee: "worker-1",
      description: "Persisted task",
    });

    const squad = await getSquad(session, squadId);
    const savedTask = squad?.state.tasks.find((t) => t.taskId === task.taskId);

    expect(savedTask).toBeDefined();
    expect(savedTask?.description).toBe("Persisted task");
    expect(savedTask?.assignee).toBe("worker-1");
  });

  test("should assign multiple tasks to same squad", async () => {
    const task1 = await assignTask(session, squadId, {
      assignee: "worker-1",
      description: "First task",
    });

    const task2 = await assignTask(session, squadId, {
      assignee: "worker-2",
      description: "Second task",
    });

    const task3 = await assignTask(session, squadId, {
      assignee: "worker-1",
      description: "Third task",
    });

    const squad = await getSquad(session, squadId);
    expect(squad?.state.tasks).toHaveLength(3);
    expect(squad?.state.tasks.map((t) => t.taskId)).toContain(task1.taskId);
    expect(squad?.state.tasks.map((t) => t.taskId)).toContain(task2.taskId);
    expect(squad?.state.tasks.map((t) => t.taskId)).toContain(task3.taskId);
  });
});

// ============================================================================
// updateTask Tests - State Transition through Aggregate Root
// ============================================================================

describe("updateTask", () => {
  test("should successfully update a task status", async () => {
    const task = await assignTask(session, squadId, {
      assignee: "worker-1",
      description: "Task to update",
    });

    const updated = await updateTask(session, squadId, task.taskId, {
      status: "active",
      startedAt: new Date().toISOString(),
    });

    expect(updated.status).toBe("active");
    expect(updated.startedAt).toBeDefined();
    expect(updated.taskId).toBe(task.taskId);
    expect(updated.assignee).toBe("worker-1");
  });

  test("should throw StorageError when task does not exist", async () => {
    expect(
      updateTask(session, squadId, "task-nonexistent", {
        status: "active",
      })
    ).rejects.toThrow("Task not found: task-nonexistent");
  });

  test("should throw StorageError when squad does not exist", async () => {
    expect(
      updateTask(session, "squad-nonexistent", "task-12345678", {
        status: "active",
      })
    ).rejects.toThrow("Squad not found: squad-nonexistent");
  });

  test("should persist status change to storage", async () => {
    const task = await assignTask(session, squadId, {
      assignee: "worker-1",
      description: "Persist test",
    });

    await updateTask(session, squadId, task.taskId, {
      status: "active",
      startedAt: new Date().toISOString(),
    });

    const squad = await getSquad(session, squadId);
    const savedTask = squad?.state.tasks.find((t) => t.taskId === task.taskId);

    expect(savedTask?.status).toBe("active");
    expect(savedTask?.startedAt).toBeDefined();
  });

  test("should complete a task with result", async () => {
    const task = await assignTask(session, squadId, {
      assignee: "worker-1",
      description: "Complete test",
    });

    const completed = await updateTask(session, squadId, task.taskId, {
      status: "completed",
      completedAt: new Date().toISOString(),
      result: { success: true, output: "Feature implemented" },
    });

    expect(completed.status).toBe("completed");
    expect(completed.completedAt).toBeDefined();
    expect(completed.result).toEqual({ success: true, output: "Feature implemented" });
  });

  test("should preserve existing fields when updating", async () => {
    const task = await assignTask(session, squadId, {
      assignee: "worker-1",
      description: "Original description",
      priority: "high",
      dependencies: ["task-dep1"],
    });

    const updated = await updateTask(session, squadId, task.taskId, {
      status: "active",
    });

    expect(updated.description).toBe("Original description");
    expect(updated.priority).toBe("high");
    expect(updated.dependencies).toEqual(["task-dep1"]);
    expect(updated.assignee).toBe("worker-1");
  });

  test("should track task lifecycle: pending -> active -> completed", async () => {
    const task = await assignTask(session, squadId, {
      assignee: "worker-1",
      description: "Lifecycle test",
    });
    expect(task.status).toBe("pending");

    const started = await updateTask(session, squadId, task.taskId, {
      status: "active",
      startedAt: new Date().toISOString(),
    });
    expect(started.status).toBe("active");

    const completed = await updateTask(session, squadId, task.taskId, {
      status: "completed",
      completedAt: new Date().toISOString(),
      result: { done: true },
    });
    expect(completed.status).toBe("completed");
    expect(completed.result).toEqual({ done: true });
  });
});

// ============================================================================
// getTask Tests - Domain Entity Lookup
// ============================================================================

describe("getTask", () => {
  test("should return task when it exists", async () => {
    // Arrange: assign a task
    const createdTask = await assignTask(session, squadId, {
      assignee: "worker-1",
      description: "Find me later",
      priority: "high",
    });

    // Act: retrieve the task
    const foundTask = await getTask(session, squadId, createdTask.taskId);

    // Assert: task should match
    expect(foundTask).not.toBeNull();
    expect(foundTask?.taskId).toBe(createdTask.taskId);
    expect(foundTask?.description).toBe("Find me later");
    expect(foundTask?.assignee).toBe("worker-1");
    expect(foundTask?.priority).toBe("high");
  });

  test("should return null when task does not exist", async () => {
    // Act: try to find non-existent task
    const result = await getTask(session, squadId, "task-nonexistent");

    // Assert: should be null, not throw
    expect(result).toBeNull();
  });

  test("should throw StorageError when squad does not exist", async () => {
    // Act & Assert: should throw for missing squad
    expect(
      getTask(session, "squad-nonexistent", "task-12345678")
    ).rejects.toThrow("Squad not found: squad-nonexistent");
  });

  test("should find correct task among multiple tasks", async () => {
    // Arrange: create multiple tasks
    const task1 = await assignTask(session, squadId, {
      assignee: "worker-1",
      description: "First task",
    });
    const task2 = await assignTask(session, squadId, {
      assignee: "worker-2",
      description: "Second task",
    });
    const task3 = await assignTask(session, squadId, {
      assignee: "worker-3",
      description: "Third task",
    });

    // Act: find the middle task
    const foundTask = await getTask(session, squadId, task2.taskId);

    // Assert: should find correct task
    expect(foundTask).not.toBeNull();
    expect(foundTask?.taskId).toBe(task2.taskId);
    expect(foundTask?.description).toBe("Second task");
  });

  test("should return task with all fields intact", async () => {
    // Arrange: create task with all optional fields
    const createdTask = await assignTask(session, squadId, {
      assignee: "worker-alpha",
      description: "Complete task with all fields",
      priority: "critical",
      dependencies: ["dep-1", "dep-2"],
    });

    // Act: retrieve the task
    const foundTask = await getTask(session, squadId, createdTask.taskId);

    // Assert: all fields should be preserved
    expect(foundTask).not.toBeNull();
    expect(foundTask?.status).toBe("pending");
    expect(foundTask?.priority).toBe("critical");
    expect(foundTask?.dependencies).toEqual(["dep-1", "dep-2"]);
    expect(foundTask?.createdAt).toBe(createdTask.createdAt);
  });
});

// ============================================================================
// completeTask Tests - Convenience Wrapper for Task Completion
// ============================================================================

describe("completeTask", () => {
  test("should mark task as completed on success", async () => {
    const task = await assignTask(session, squadId, {
      assignee: "worker-1",
      description: "Complete me",
    });

    const result: TaskResult = {
      success: true,
      output: { message: "Task completed successfully" },
      metrics: { duration: 1500 },
    };

    const completed = await completeTask(session, squadId, task.taskId, result);

    expect(completed.status).toBe("completed");
    expect(completed.completedAt).toBeDefined();
    expect(completed.result).toEqual(result);
  });

  test("should mark task as failed on failure", async () => {
    const task = await assignTask(session, squadId, {
      assignee: "worker-1",
      description: "Fail me",
    });

    const result: TaskResult = {
      success: false,
      error: { code: "TIMEOUT", message: "Task timed out" },
      metrics: { duration: 5000 },
    };

    const failed = await completeTask(session, squadId, task.taskId, result);

    expect(failed.status).toBe("failed");
    expect(failed.completedAt).toBeDefined();
    expect(failed.result).toEqual(result);
  });

  test("should throw StorageError when task not found", async () => {
    const result: TaskResult = { success: true, output: "done" };

    expect(
      completeTask(session, squadId, "task-nonexistent", result)
    ).rejects.toThrow("Task not found");
  });

  test("should persist completion to storage", async () => {
    const task = await assignTask(session, squadId, {
      assignee: "worker-1",
      description: "Persist completion",
    });

    const result: TaskResult = {
      success: true,
      output: { data: "result" },
    };

    await completeTask(session, squadId, task.taskId, result);

    const found = await getTask(session, squadId, task.taskId);
    expect(found?.status).toBe("completed");
    expect(found?.result).toEqual(result);
  });
});

// ============================================================================
// Task Lifecycle Integration Tests
// ============================================================================

describe("Task Lifecycle Integration", () => {
  test("full task lifecycle: assign → start → complete", async () => {
    // 1. 세션과 squad는 beforeEach에서 이미 생성됨
    
    // 2. assignTask()로 task 할당
    const task = await assignTask(session, squadId, {
      assignee: "worker-alpha",
      description: "Integration test task",
      priority: "high",
    });
    expect(task.status).toBe("pending");
    expect(task.startedAt).toBeUndefined();
    expect(task.completedAt).toBeUndefined();

    // 3. updateTask()로 status: "active", startedAt 설정
    const startedAt = new Date().toISOString();
    const activeTask = await updateTask(session, squadId, task.taskId, {
      status: "active",
      startedAt,
    });
    expect(activeTask.status).toBe("active");
    expect(activeTask.startedAt).toBe(startedAt);

    // 4. completeTask()로 성공 결과와 함께 완료
    const result: TaskResult = {
      success: true,
      output: { filesCreated: ["src/auth.ts", "src/auth.test.ts"] },
      metrics: { duration: 2500, tokensUsed: 1500 },
    };
    const completedTask = await completeTask(session, squadId, task.taskId, result);
    expect(completedTask.status).toBe("completed");
    expect(completedTask.completedAt).toBeDefined();
    expect(completedTask.result).toEqual(result);

    // 5. getTask()로 최종 상태 확인
    const finalTask = await getTask(session, squadId, task.taskId);
    expect(finalTask).not.toBeNull();
    expect(finalTask?.status).toBe("completed");
    expect(finalTask?.startedAt).toBe(startedAt);
    expect(finalTask?.completedAt).toBeDefined();
    expect(finalTask?.result).toEqual(result);
    expect(finalTask?.assignee).toBe("worker-alpha");
    expect(finalTask?.priority).toBe("high");
  });

  test("failed task lifecycle: assign → start → fail", async () => {
    // 1. assignTask()로 task 할당
    const task = await assignTask(session, squadId, {
      assignee: "worker-beta",
      description: "This task will fail",
      priority: "critical",
    });
    expect(task.status).toBe("pending");

    // 2. updateTask()로 시작
    const startedAt = new Date().toISOString();
    await updateTask(session, squadId, task.taskId, {
      status: "active",
      startedAt,
    });

    // 3. completeTask()로 실패 결과와 함께 완료
    const result: TaskResult = {
      success: false,
      error: {
        code: "DEPENDENCY_FAILED",
        message: "Required dependency task-setup failed",
      },
      metrics: { duration: 500 },
    };
    const failedTask = await completeTask(session, squadId, task.taskId, result);
    
    expect(failedTask.status).toBe("failed");
    expect(failedTask.completedAt).toBeDefined();
    expect(failedTask.result).toEqual(result);

    // 4. getTask()로 최종 상태 확인
    const finalTask = await getTask(session, squadId, task.taskId);
    expect(finalTask?.status).toBe("failed");
    expect(finalTask?.startedAt).toBe(startedAt);
  });

  test("multiple tasks in squad lifecycle", async () => {
    // 여러 태스크가 독립적으로 실행되는 시나리오
    const task1 = await assignTask(session, squadId, {
      assignee: "worker-1",
      description: "Task 1",
    });
    const task2 = await assignTask(session, squadId, {
      assignee: "worker-2",
      description: "Task 2",
    });

    // task1 시작
    await updateTask(session, squadId, task1.taskId, {
      status: "active",
      startedAt: new Date().toISOString(),
    });

    // task2 시작
    await updateTask(session, squadId, task2.taskId, {
      status: "active",
      startedAt: new Date().toISOString(),
    });

    // task1 완료
    await completeTask(session, squadId, task1.taskId, {
      success: true,
      output: "Task 1 done",
    });

    // task2 실패
    await completeTask(session, squadId, task2.taskId, {
      success: false,
      error: { code: "ERROR", message: "Task 2 failed" },
    });

    // 최종 상태 확인
    const squad = await getSquad(session, squadId);
    expect(squad?.state.tasks).toHaveLength(2);
    
    const t1 = squad?.state.tasks.find((t) => t.taskId === task1.taskId);
    const t2 = squad?.state.tasks.find((t) => t.taskId === task2.taskId);
    
    expect(t1?.status).toBe("completed");
    expect(t2?.status).toBe("failed");
  });
});
