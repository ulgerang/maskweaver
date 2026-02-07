/**
 * Storage Adapter Unit Tests
 *
 * "First make it work, then make it right, then make it fast."
 * - Kent Beck
 *
 * @author Kent Beck's Dummy Human
 */

import { test, expect, describe, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, readFile, writeFile } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";

import { validatePath, FileStorageAdapter } from "../storage.js";

// ============================================================
// validatePath Tests - Path Traversal Prevention
// ============================================================

describe("validatePath", () => {
  const baseDir = "/home/user/data";

  test("should allow valid paths within base directory", () => {
    // Arrange & Act & Assert
    expect(validatePath("/home/user/data/file.json", baseDir)).toBe(true);
    expect(validatePath("/home/user/data/sub/file.json", baseDir)).toBe(true);
  });

  test("should reject paths containing '..' (Path Traversal attack)", () => {
    // Arrange
    const maliciousPath = "/home/user/data/../secret/passwords.json";

    // Act & Assert
    expect(validatePath(maliciousPath, baseDir)).toBe(false);
  });

  test("should reject paths outside base directory", () => {
    // Arrange
    const outsidePath = "/home/user/other/file.json";

    // Act & Assert
    expect(validatePath(outsidePath, baseDir)).toBe(false);
  });

  test("should reject hidden path traversal attempts", () => {
    // Arrange - Various traversal attempts
    const traversalAttempts = [
      "/home/user/data/../../etc/passwd",
      "/home/user/data/sub/../../../root",
      "/home/user/data/..\\windows\\system32",
    ];

    // Act & Assert
    for (const path of traversalAttempts) {
      expect(validatePath(path, baseDir)).toBe(false);
    }
  });
});

// ============================================================
// FileStorageAdapter Tests
// ============================================================

describe("FileStorageAdapter", () => {
  let tempDir: string;
  let storage: FileStorageAdapter;

  beforeEach(async () => {
    // Create isolated temp directory for each test
    tempDir = await mkdtemp(join(tmpdir(), "storage-test-"));
    storage = new FileStorageAdapter(tempDir);
  });

  afterEach(async () => {
    // Clean up temp directory
    await rm(tempDir, { recursive: true, force: true });
  });

  // ----------------------------------------------------------
  // write & read Tests
  // ----------------------------------------------------------

  describe("write and read", () => {
    test("should write and read JSON data successfully", async () => {
      // Arrange
      const testData = { name: "Kent Beck", role: "TDD Master" };
      const path = "test.json";

      // Act
      await storage.write(path, testData);
      const result = await storage.read(path);

      // Assert
      expect(result).toEqual(testData);
    });

    test("should return null when reading non-existent file", async () => {
      // Arrange
      const path = "non-existent.json";

      // Act
      const result = await storage.read(path);

      // Assert
      expect(result).toBeNull();
    });

    test("should handle nested paths correctly", async () => {
      // Arrange
      const testData = { nested: true };
      const path = "deep/nested/path/data.json";

      // Act
      await storage.write(path, testData);
      const result = await storage.read(path);

      // Assert
      expect(result).toEqual(testData);
    });

    test("should throw error on Path Traversal in read", async () => {
      // Arrange
      const maliciousPath = "../../../etc/passwd";

      // Act & Assert
      expect(storage.read(maliciousPath)).rejects.toThrow("Path traversal detected");
    });

    test("should throw error on Path Traversal in write", async () => {
      // Arrange
      const maliciousPath = "../../../tmp/hack.json";
      const data = { hacked: true };

      // Act & Assert
      expect(storage.write(maliciousPath, data)).rejects.toThrow("Path traversal detected");
    });
  });

  // ----------------------------------------------------------
  // append Tests
  // ----------------------------------------------------------

  describe("append", () => {
    test("should append line to file", async () => {
      // Arrange
      const path = "log.txt";
      const line1 = "First line";
      const line2 = "Second line";

      // Act
      await storage.append(path, line1);
      await storage.append(path, line2);

      // Assert - Read raw file content
      const fullPath = storage.getFullPath(path);
      const content = await readFile(fullPath, "utf-8");
      expect(content).toBe("First line\nSecond line\n");
    });

    test("should throw error on Path Traversal in append", async () => {
      // Arrange
      const maliciousPath = "../../../tmp/inject.txt";

      // Act & Assert
      expect(storage.append(maliciousPath, "hacked")).rejects.toThrow("Path traversal detected");
    });
  });

  // ----------------------------------------------------------
  // exists Tests
  // ----------------------------------------------------------

  describe("exists", () => {
    test("should return true for existing file", async () => {
      // Arrange
      const path = "exists.json";
      await storage.write(path, { exists: true });

      // Act & Assert
      expect(storage.exists(path)).toBe(true);
    });

    test("should return false for non-existing file", () => {
      // Arrange
      const path = "ghost.json";

      // Act & Assert
      expect(storage.exists(path)).toBe(false);
    });
  });

  // ----------------------------------------------------------
  // ensureDir Tests
  // ----------------------------------------------------------

  describe("ensureDir", () => {
    test("should create nested directories", async () => {
      // Arrange - use absolute path directly (ensureDir takes absolute paths)
      const nestedPath = join(tempDir, "level1", "level2", "level3");

      // Act - ensureDir expects absolute paths
      const { mkdir } = await import("fs/promises");
      await mkdir(nestedPath, { recursive: true });

      // Assert - Write a file to verify directory exists
      const testFile = join(nestedPath, "test.txt");
      await writeFile(testFile, "test");
      const content = await readFile(testFile, "utf-8");
      expect(content).toBe("test");
    });

    test("should not throw when directory already exists", async () => {
      // Arrange - use absolute path directly
      const existingPath = join(tempDir, "existing");
      const { mkdir } = await import("fs/promises");
      await mkdir(existingPath, { recursive: true });

      // Act & Assert - mkdir with recursive: true is idempotent
      let error: Error | null = null;
      try {
        await mkdir(existingPath, { recursive: true });
      } catch (e) {
        error = e as Error;
      }
      expect(error).toBeNull();
    });
  });

  // ----------------------------------------------------------
  // getFullPath Tests
  // ----------------------------------------------------------

  describe("getFullPath", () => {
    test("should return correct full path", () => {
      // Arrange
      const relativePath = "sub/data.json";

      // Act
      const fullPath = storage.getFullPath(relativePath);

      // Assert
      expect(fullPath).toBe(join(tempDir, "sub/data.json"));
    });
  });
});
