/**
 * Session Management Tests
 * 
 * "Make it work, make it right, make it fast." - Kent Beck
 * 
 * Red-Green-Refactor cycle for session.ts
 */

import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { mkdtemp, rm } from "fs/promises";
import { existsSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";

import { createSession, loadSession } from "../session.js";
import { FileStorageAdapter } from "../storage.js";
import type { Manifest } from "../types.js";

describe("Session Management", () => {
  let tempDir: string;
  let storage: FileStorageAdapter;

  beforeEach(async () => {
    // 각 테스트마다 깨끗한 임시 디렉토리 생성
    tempDir = await mkdtemp(join(tmpdir(), "session-test-"));
    storage = new FileStorageAdapter(tempDir);
  });

  afterEach(async () => {
    // 테스트 후 정리
    await rm(tempDir, { recursive: true, force: true });
  });

  // ==========================================================================
  // createSession Tests
  // ==========================================================================

  describe("createSession", () => {
    test("should generate UUID format sessionId", async () => {
      // Arrange
      const options = {
        goal: "Test goal",
        createdBy: "test-agent",
      };

      // Act
      const session = await createSession(storage, options);

      // Assert - UUID v4 format: 8-4-4-4-12 hex characters
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      expect(session.manifest.sessionId).toMatch(uuidRegex);
    });

    test("should create manifest.json file", async () => {
      // Arrange
      const options = {
        goal: "Build feature X",
        createdBy: "operator-1",
      };

      // Act
      const session = await createSession(storage, options);

      // Assert
      const manifestPath = join(tempDir, "shared", session.manifest.sessionId, "manifest.json");
      expect(existsSync(manifestPath)).toBe(true);
    });

    test("should create events/ directory", async () => {
      // Arrange
      const options = {
        goal: "Test events dir",
        createdBy: "test-agent",
      };

      // Act
      const session = await createSession(storage, options);

      // Assert
      const eventsPath = join(tempDir, "shared", session.manifest.sessionId, "events");
      expect(existsSync(eventsPath)).toBe(true);
    });

    test("should create squads/ directory", async () => {
      // Arrange
      const options = {
        goal: "Test squads dir",
        createdBy: "test-agent",
      };

      // Act
      const session = await createSession(storage, options);

      // Assert
      const squadsPath = join(tempDir, "shared", session.manifest.sessionId, "squads");
      expect(existsSync(squadsPath)).toBe(true);
    });

    test("should store goal and createdBy in manifest", async () => {
      // Arrange
      const options = {
        goal: "Implement user authentication",
        createdBy: "orchestrator-alpha",
      };

      // Act
      const session = await createSession(storage, options);

      // Assert
      expect(session.manifest.goal).toBe("Implement user authentication");
      expect(session.manifest.createdBy).toBe("orchestrator-alpha");
    });

    test("should store constraints in manifest when provided", async () => {
      // Arrange
      const options = {
        goal: "Time-boxed task",
        createdBy: "test-agent",
        constraints: {
          timeout: "30m",
          tokenBudget: 50000,
        },
      };

      // Act
      const session = await createSession(storage, options);

      // Assert
      expect(session.manifest.constraints).toBeDefined();
      expect(session.manifest.constraints?.timeout).toBe("30m");
      expect(session.manifest.constraints?.tokenBudget).toBe(50000);
    });

    test("should initialize version to 1", async () => {
      // Arrange
      const options = {
        goal: "Test version",
        createdBy: "test-agent",
      };

      // Act
      const session = await createSession(storage, options);

      // Assert
      expect(session.manifest.version).toBe(1);
    });

    test("should initialize squads as empty array", async () => {
      // Arrange
      const options = {
        goal: "Test squads init",
        createdBy: "test-agent",
      };

      // Act
      const session = await createSession(storage, options);

      // Assert
      expect(session.manifest.squads).toEqual([]);
    });

    test("should set createdAt as ISO timestamp", async () => {
      // Arrange
      const beforeCreate = new Date().toISOString();
      const options = {
        goal: "Test timestamp",
        createdBy: "test-agent",
      };

      // Act
      const session = await createSession(storage, options);
      const afterCreate = new Date().toISOString();

      // Assert - createdAt should be between before and after
      expect(session.manifest.createdAt >= beforeCreate).toBe(true);
      expect(session.manifest.createdAt <= afterCreate).toBe(true);
    });

    test("should return correct sessionPath", async () => {
      // Arrange
      const options = {
        goal: "Test session path",
        createdBy: "test-agent",
      };

      // Act
      const session = await createSession(storage, options);

      // Assert
      expect(session.sessionPath).toBe(`shared/${session.manifest.sessionId}`);
    });

    test("should persist manifest that can be read back", async () => {
      // Arrange
      const options = {
        goal: "Persistence test",
        createdBy: "test-agent",
        constraints: {
          timeout: "1h",
        },
      };

      // Act
      const session = await createSession(storage, options);
      const readManifest = await storage.read<Manifest>(
        `${session.sessionPath}/manifest.json`
      );

      // Assert
      expect(readManifest).not.toBeNull();
      expect(readManifest?.sessionId).toBe(session.manifest.sessionId);
      expect(readManifest?.goal).toBe("Persistence test");
      expect(readManifest?.constraints?.timeout).toBe("1h");
    });
  });

  // ==========================================================================
  // loadSession Tests
  // ==========================================================================

  describe("loadSession", () => {
    test("should load existing session successfully", async () => {
      // Arrange - 먼저 세션 생성
      const options = {
        goal: "Load test",
        createdBy: "creator-agent",
      };
      const created = await createSession(storage, options);

      // Act - 세션 로드
      const loaded = await loadSession(storage, created.manifest.sessionId);

      // Assert
      expect(loaded).not.toBeNull();
      expect(loaded?.manifest.sessionId).toBe(created.manifest.sessionId);
      expect(loaded?.manifest.goal).toBe("Load test");
      expect(loaded?.manifest.createdBy).toBe("creator-agent");
    });

    test("should return null for non-existent session", async () => {
      // Arrange - 존재하지 않는 sessionId
      const fakeSessionId = "00000000-0000-0000-0000-000000000000";

      // Act
      const result = await loadSession(storage, fakeSessionId);

      // Assert
      expect(result).toBeNull();
    });

    test("should return correct sessionPath", async () => {
      // Arrange
      const options = {
        goal: "Path test",
        createdBy: "test-agent",
      };
      const created = await createSession(storage, options);

      // Act
      const loaded = await loadSession(storage, created.manifest.sessionId);

      // Assert
      expect(loaded?.sessionPath).toBe(`shared/${created.manifest.sessionId}`);
    });

    test("should load session with constraints", async () => {
      // Arrange
      const options = {
        goal: "Constraints load test",
        createdBy: "test-agent",
        constraints: {
          timeout: "2h",
          tokenBudget: 100000,
        },
      };
      const created = await createSession(storage, options);

      // Act
      const loaded = await loadSession(storage, created.manifest.sessionId);

      // Assert
      expect(loaded?.manifest.constraints?.timeout).toBe("2h");
      expect(loaded?.manifest.constraints?.tokenBudget).toBe(100000);
    });

    test("should return storage adapter reference", async () => {
      // Arrange
      const options = {
        goal: "Storage ref test",
        createdBy: "test-agent",
      };
      const created = await createSession(storage, options);

      // Act
      const loaded = await loadSession(storage, created.manifest.sessionId);

      // Assert
      expect(loaded?.storage).toBe(storage);
    });
  });
});
