/**
 * Squad Management Tests
 * 
 * Kent Beck의 TDD 원칙:
 * - 작고 명확한 테스트
 * - 하나의 테스트는 하나의 행동만 검증
 * - Red-Green-Refactor 사이클
 * 
 * @author Kent Beck's Dummy Human
 */

import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { mkdtemp, rm } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { existsSync } from "fs";

import { FileStorageAdapter } from "../storage.js";
import { createSession } from "../session.js";
import { createSquad, getSquad, updateSquadState } from "../squad.js";
import { LIMITS } from "../types.js";
import type { Session } from "../session.js";

// ============================================================================
// Test Fixtures
// ============================================================================

let tempDir: string;
let storage: FileStorageAdapter;
let session: Session;

beforeEach(async () => {
  // Arrange: 각 테스트 전에 깨끗한 임시 디렉토리 생성
  tempDir = await mkdtemp(join(tmpdir(), "squad-test-"));
  storage = new FileStorageAdapter(tempDir);
  session = await createSession(storage, {
    goal: "Test session for squad management",
    createdBy: "test-agent",
  });
});

afterEach(async () => {
  // Cleanup: 테스트 후 임시 디렉토리 정리
  if (tempDir && existsSync(tempDir)) {
    await rm(tempDir, { recursive: true, force: true });
  }
});

// ============================================================================
// createSquad Tests
// ============================================================================

describe("createSquad", () => {
  test("should create spec.json and state.json files", async () => {
    // Act
    const { spec, state } = await createSquad(session, {
      mission: "Implement feature X",
      operator: "operator-agent",
    });

    // Assert: 파일 생성 확인
    const squadPath = `${session.sessionPath}/squads/${spec.squadId}`;
    expect(storage.exists(`${squadPath}/spec.json`)).toBe(true);
    expect(storage.exists(`${squadPath}/state.json`)).toBe(true);
  });

  test("should add squadId to manifest.squads array", async () => {
    // Act
    const { spec } = await createSquad(session, {
      mission: "Implement feature X",
      operator: "operator-agent",
    });

    // Assert: manifest에 squadId 추가 확인
    expect(session.manifest.squads).toContain(spec.squadId);
    expect(session.manifest.squads.length).toBe(1);
  });

  test("should create scratch/ directory", async () => {
    // Act
    const { spec } = await createSquad(session, {
      mission: "Implement feature X",
      operator: "operator-agent",
    });

    // Assert: scratch 디렉토리 생성 확인
    const scratchPath = `${session.sessionPath}/squads/${spec.squadId}/scratch`;
    expect(existsSync(storage.getFullPath(scratchPath))).toBe(true);
  });

  test("should return spec with correct properties", async () => {
    // Arrange
    const options = {
      mission: "Implement OAuth login",
      operator: "operator-alpha",
      constraints: {
        timeout: "1h",
        tokenBudget: 50000,
        maxWorkers: 3,
      },
      scope: {
        files: ["src/auth.ts"],
        directories: ["src/auth/"],
      },
    };

    // Act
    const { spec } = await createSquad(session, options);

    // Assert: spec 속성 검증
    expect(spec.squadId).toMatch(/^squad-[a-f0-9]{8}$/);
    expect(spec.mission).toBe(options.mission);
    expect(spec.operator).toBe(options.operator);
    expect(spec.constraints?.timeout).toBe("1h");
    expect(spec.constraints?.tokenBudget).toBe(50000);
    expect(spec.constraints?.maxWorkers).toBe(3);
    expect(spec.scope?.files).toEqual(["src/auth.ts"]);
    expect(spec.createdAt).toBeDefined();
  });

  test("should return state with initial values", async () => {
    // Act
    const { state } = await createSquad(session, {
      mission: "Test mission",
      operator: "operator",
    });

    // Assert: 초기 상태 검증
    expect(state.status).toBe("pending");
    expect(state.progress).toBe(0);
    expect(state.tasks).toEqual([]);
    expect(state.sharedContext).toEqual({});
    expect(state.updatedAt).toBeDefined();
  });

  test("should use default maxWorkers from LIMITS when not specified", async () => {
    // Act
    const { spec } = await createSquad(session, {
      mission: "Test mission",
      operator: "operator",
    });

    // Assert
    expect(spec.constraints?.maxWorkers).toBe(LIMITS.maxWorkersPerSquad);
  });

  test("should throw error when maxSquadsPerSession limit is reached", async () => {
    // Arrange: 최대 개수만큼 Squad 생성
    for (let i = 0; i < LIMITS.maxSquadsPerSession; i++) {
      await createSquad(session, {
        mission: `Mission ${i}`,
        operator: "operator",
      });
    }

    // Act & Assert: 한도 초과 시 에러
    expect(
      createSquad(session, {
        mission: "One too many",
        operator: "operator",
      })
    ).rejects.toThrow("Maximum squads per session exceeded");
  });

  test("should persist spec.json with correct data", async () => {
    // Act
    const { spec } = await createSquad(session, {
      mission: "Persisted mission",
      operator: "persistent-operator",
    });

    // Assert: 파일에서 직접 읽어서 검증
    const squadPath = `${session.sessionPath}/squads/${spec.squadId}`;
    const savedSpec = await storage.read<typeof spec>(`${squadPath}/spec.json`);
    
    expect(savedSpec).not.toBeNull();
    expect(savedSpec?.mission).toBe("Persisted mission");
    expect(savedSpec?.operator).toBe("persistent-operator");
  });
});

// ============================================================================
// getSquad Tests
// ============================================================================

describe("getSquad", () => {
  test("should return squad when it exists", async () => {
    // Arrange
    const created = await createSquad(session, {
      mission: "Find me",
      operator: "operator",
    });

    // Act
    const retrieved = await getSquad(session, created.spec.squadId);

    // Assert
    expect(retrieved).not.toBeNull();
    expect(retrieved?.spec.squadId).toBe(created.spec.squadId);
    expect(retrieved?.spec.mission).toBe("Find me");
    expect(retrieved?.state.status).toBe("pending");
  });

  test("should return null when squad does not exist", async () => {
    // Act
    const result = await getSquad(session, "squad-nonexistent");

    // Assert
    expect(result).toBeNull();
  });

  test("should return both spec and state", async () => {
    // Arrange
    const created = await createSquad(session, {
      mission: "Dual return test",
      operator: "operator",
    });

    // Act
    const result = await getSquad(session, created.spec.squadId);

    // Assert
    expect(result).toHaveProperty("spec");
    expect(result).toHaveProperty("state");
    expect(result?.spec.squadId).toBe(result?.state.squadId);
  });
});

// ============================================================================
// updateSquadState Tests
// ============================================================================

describe("updateSquadState", () => {
  test("should update state and reflect changes on subsequent get", async () => {
    // Arrange
    const { spec } = await createSquad(session, {
      mission: "Update me",
      operator: "operator",
    });

    // Act
    await updateSquadState(session, spec.squadId, {
      status: "active",
      progress: 50,
    });

    // Assert: 업데이트된 값 확인
    const retrieved = await getSquad(session, spec.squadId);
    expect(retrieved?.state.status).toBe("active");
    expect(retrieved?.state.progress).toBe(50);
  });

  test("should automatically update updatedAt timestamp", async () => {
    // Arrange
    const { spec, state: initialState } = await createSquad(session, {
      mission: "Timestamp test",
      operator: "operator",
    });
    const initialUpdatedAt = initialState.updatedAt;

    // 시간 차이를 위해 약간 대기
    await new Promise((resolve) => setTimeout(resolve, 10));

    // Act
    const updatedState = await updateSquadState(session, spec.squadId, {
      progress: 25,
    });

    // Assert: updatedAt이 갱신됨
    expect(updatedState.updatedAt).not.toBe(initialUpdatedAt);
    expect(new Date(updatedState.updatedAt).getTime()).toBeGreaterThan(
      new Date(initialUpdatedAt).getTime()
    );
  });

  test("should throw error when squad does not exist", async () => {
    // Act & Assert
    expect(
      updateSquadState(session, "squad-nonexistent", { status: "active" })
    ).rejects.toThrow("Squad not found: squad-nonexistent");
  });

  test("should preserve unmodified fields", async () => {
    // Arrange
    const { spec } = await createSquad(session, {
      mission: "Preserve fields",
      operator: "operator",
    });

    // Act: status만 업데이트
    await updateSquadState(session, spec.squadId, { status: "active" });

    // Assert: 다른 필드는 유지
    const retrieved = await getSquad(session, spec.squadId);
    expect(retrieved?.state.status).toBe("active");
    expect(retrieved?.state.progress).toBe(0); // 초기값 유지
    expect(retrieved?.state.tasks).toEqual([]); // 초기값 유지
  });

  test("should return the updated state", async () => {
    // Arrange
    const { spec } = await createSquad(session, {
      mission: "Return value test",
      operator: "operator",
    });

    // Act
    const result = await updateSquadState(session, spec.squadId, {
      status: "completed",
      progress: 100,
    });

    // Assert
    expect(result.status).toBe("completed");
    expect(result.progress).toBe(100);
    expect(result.squadId).toBe(spec.squadId);
  });

  test("should update sharedContext", async () => {
    // Arrange
    const { spec } = await createSquad(session, {
      mission: "Shared context test",
      operator: "operator",
    });

    // Act
    await updateSquadState(session, spec.squadId, {
      sharedContext: {
        apiEndpoint: "https://api.example.com",
        authToken: "secret",
      },
    });

    // Assert
    const retrieved = await getSquad(session, spec.squadId);
    expect(retrieved?.state.sharedContext).toEqual({
      apiEndpoint: "https://api.example.com",
      authToken: "secret",
    });
  });
});
