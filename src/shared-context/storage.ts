/**
 * Storage Adapter
 *
 * File-based storage with abstraction for future database migration.
 * Implements atomic writes and path traversal prevention.
 *
 * @author Kent Beck's Dummy Human
 */

import { join, resolve } from "path";
import { mkdir, rename, readFile, appendFile, writeFile, unlink } from "fs/promises";
import { existsSync } from "fs";
import { StorageError, ValidationError } from "../shared/errors.js";
import { LIMITS } from "./types.js";

// ============================================================================
// Lock Types
// ============================================================================

/**
 * Options for acquiring a file lock.
 * 
 * Distributed lock semantics:
 * - timeout: How long to wait for lock acquisition before giving up
 * - stale: Duration after which an unreleased lock is considered abandoned
 * - retries: Number of acquisition attempts with exponential backoff
 * 
 * @example
 * // Conservative settings for critical sections
 * const opts: LockOptions = { timeout: 10000, stale: 60000, retries: 5 };
 */
export interface LockOptions {
  /** Lock acquisition timeout in milliseconds (default: 5000) */
  timeout?: number;
  /** Time after which lock is considered stale and can be stolen (default: 30000) */
  stale?: number;
  /** Number of retry attempts (default: 3) */
  retries?: number;
}

// ============================================================================
// Lock File Helpers
// ============================================================================

/**
 * Structure stored in .lock files for ownership tracking.
 */
interface LockFileContent {
  pid: number;
  createdAt: string;
  path: string;
}

/**
 * Check if a process is still running.
 */
function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

/**
 * Sleep for specified milliseconds.
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ============================================================================
// Storage Interface
// ============================================================================

/**
 * Abstract storage interface for data persistence.
 * Enables swapping file storage with database or cloud storage.
 */
export interface StorageAdapter {
  /** Read and parse JSON data from the given path */
  read<T>(path: string): Promise<T | null>;
  /** Write data as JSON to the given path (atomic) */
  write<T>(path: string, data: T): Promise<void>;
  /** Append a line to the given file */
  append(path: string, line: string): Promise<void>;
  /** Check if a path exists */
  exists(path: string): boolean;
  /** Ensure a directory exists, creating it if necessary */
  ensureDir(path: string): Promise<void>;
  /** Get the absolute path for a relative storage path */
  getFullPath(path: string): string;
  /**
   * Acquire an exclusive lock on a file path.
   * Returns an unlock function that MUST be called to release the lock.
   * 
   * Correctness guarantees:
   * - Mutual exclusion: Only one holder at a time
   * - Stale lock detection: Abandoned locks are automatically reclaimable
   * - Fencing: Use returned unlock function within try/finally
   * 
   * @param path - Relative path to lock
   * @param options - Lock behavior options
   * @returns Unlock function - call to release the lock
   * @throws {StorageError} If lock cannot be acquired within timeout
   * 
   * @example
   * const unlock = await storage.lock("state.json", { timeout: 5000 });
   * try {
   *   const data = await storage.read("state.json");
   *   await storage.write("state.json", { ...data, updated: true });
   * } finally {
   *   await unlock();
   * }
   */
  lock(path: string, options?: LockOptions): Promise<() => Promise<void>>;
}

// ============================================================================
// Path Validation
// ============================================================================

/**
 * Validate that a path is within the allowed base directory.
 * Prevents path traversal attacks (e.g., "../../../etc/passwd").
 *
 * @param fullPath - The full path to validate
 * @param baseDir - The base directory that should contain the path
 * @returns True if the path is safe and within baseDir
 *
 * @example
 * validatePath("/data/sessions/abc/file.json", "/data/sessions"); // true
 * validatePath("/data/../etc/passwd", "/data/sessions"); // false
 */
export function validatePath(fullPath: string, baseDir: string): boolean {
  const resolvedFull = resolve(fullPath);
  const resolvedBase = resolve(baseDir);
  return resolvedFull.startsWith(resolvedBase) && !fullPath.includes("..");
}

// ============================================================================
// Atomic Write Helper
// ============================================================================

/**
 * Write data atomically by first writing to a temp file then renaming.
 * Prevents partial writes and data corruption on crash.
 */
async function atomicWrite(filePath: string, data: string): Promise<void> {
  const tempPath = `${filePath}.tmp.${Date.now()}`;
  await Bun.write(tempPath, data);
  await rename(tempPath, filePath);
}

// ============================================================================
// File Storage Adapter
// ============================================================================

/**
 * File-based implementation of the StorageAdapter interface.
 * All paths are relative to the baseDir and validated for security.
 *
 * @example
 * const storage = new FileStorageAdapter("/data/sessions");
 * await storage.write("session-1/manifest.json", { id: "session-1" });
 * const data = await storage.read("session-1/manifest.json");
 */
export class FileStorageAdapter implements StorageAdapter {
  /**
   * Create a new file storage adapter.
   *
   * @param baseDir - The root directory for all storage operations
   */
  constructor(private readonly baseDir: string) {}

  /**
   * Read and parse a JSON file from storage.
   *
   * @param path - Relative path within baseDir
   * @returns Parsed JSON data, or null if file doesn't exist
   * @throws {ValidationError} If path escapes baseDir
   * @throws {StorageError} If file read or parse fails
   */
  async read<T>(path: string): Promise<T | null> {
    const fullPath = join(this.baseDir, path);
    if (!validatePath(fullPath, this.baseDir)) {
      throw new ValidationError("Path traversal detected", {
        path,
        baseDir: this.baseDir,
        reason: "Path escapes base directory",
      });
    }

    if (!existsSync(fullPath)) return null;

    try {
      const content = await readFile(fullPath, "utf-8");
      return JSON.parse(content) as T;
    } catch (error) {
      throw new StorageError(`Failed to read file: ${path}`, {
        path,
        fullPath,
        cause: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Write data to storage as formatted JSON (atomic operation).
   *
   * @param path - Relative path within baseDir
   * @param data - Data to serialize and write
   * @throws {ValidationError} If path escapes baseDir
   * @throws {StorageError} If write fails
   */
  async write<T>(path: string, data: T): Promise<void> {
    const fullPath = join(this.baseDir, path);
    if (!validatePath(fullPath, this.baseDir)) {
      throw new ValidationError("Path traversal detected", {
        path,
        baseDir: this.baseDir,
        reason: "Path escapes base directory",
      });
    }

    await this.ensureDir(dirname(path));

    try {
      await atomicWrite(fullPath, JSON.stringify(data, null, 2));
    } catch (error) {
      throw new StorageError(`Failed to write file: ${path}`, {
        path,
        fullPath,
        cause: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Append a line to a file (for log files).
   *
   * @param path - Relative path within baseDir
   * @param line - Line to append (newline added automatically)
   * @throws {ValidationError} If path escapes baseDir
   * @throws {StorageError} If append fails
   */
  async append(path: string, line: string): Promise<void> {
    const fullPath = join(this.baseDir, path);
    if (!validatePath(fullPath, this.baseDir)) {
      throw new ValidationError("Path traversal detected", {
        path,
        baseDir: this.baseDir,
        reason: "Path escapes base directory",
      });
    }

    try {
      await appendFile(fullPath, line + "\n");
    } catch (error) {
      throw new StorageError(`Failed to append to file: ${path}`, {
        path,
        fullPath,
        cause: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Check if a path exists in storage.
   *
   * @param path - Relative path within baseDir
   * @returns True if the path exists
   */
  exists(path: string): boolean {
    return existsSync(join(this.baseDir, path));
  }

  /**
   * Get the absolute filesystem path for a relative storage path.
   *
   * @param path - Relative path within baseDir
   * @returns Absolute filesystem path
   */
  getFullPath(path: string): string {
    return join(this.baseDir, path);
  }

  /**
   * Ensure a directory exists, creating it recursively if necessary.
   *
   * @param path - Relative directory path within baseDir
   */
  async ensureDir(path: string): Promise<void> {
    const fullPath = join(this.baseDir, path);
    if (!existsSync(fullPath)) {
      await mkdir(fullPath, { recursive: true });
    }
  }

  /**
   * Acquire an exclusive lock on a file path.
   * Uses .lock files with PID tracking for stale lock detection.
   *
   * @param path - Relative path to lock
   * @param options - Lock behavior options
   * @returns Unlock function that MUST be called to release
   * @throws {StorageError} If lock cannot be acquired within timeout
   */
  async lock(path: string, options?: LockOptions): Promise<() => Promise<void>> {
    const timeout = options?.timeout ?? LIMITS.lockTimeout;
    const staleThreshold = options?.stale ?? LIMITS.lockStale;
    const maxRetries = options?.retries ?? LIMITS.lockRetries;

    const lockPath = `${path}.lock`;
    const fullLockPath = join(this.baseDir, lockPath);

    if (!validatePath(fullLockPath, this.baseDir)) {
      throw new ValidationError("Path traversal detected", {
        path: lockPath,
        baseDir: this.baseDir,
        reason: "Path escapes base directory",
      });
    }

    const startTime = Date.now();
    let attempt = 0;

    while (true) {
      const elapsed = Date.now() - startTime;
      if (elapsed >= timeout) {
        throw new StorageError(`Failed to acquire lock: ${path}`, {
          path,
          lockPath,
          elapsed,
          timeout,
          attempts: attempt,
        });
      }

      attempt++;

      // Check if lock file exists
      if (existsSync(fullLockPath)) {
        try {
          const content = await readFile(fullLockPath, "utf-8");
          const lockInfo: LockFileContent = JSON.parse(content);
          const lockAge = Date.now() - new Date(lockInfo.createdAt).getTime();

          const isStale = lockAge > staleThreshold;
          const isOrphan = !isProcessAlive(lockInfo.pid);

          if (isStale || isOrphan) {
            try {
              await unlink(fullLockPath);
            } catch {
              // Another process may have removed it
            }
          } else {
            if (attempt > maxRetries) {
              throw new StorageError(`Failed to acquire lock: ${path}`, {
                path,
                lockPath,
                reason: "Max retries exceeded",
                currentHolder: lockInfo.pid,
                lockAge,
              });
            }

            const backoffMs = Math.min(50 * Math.pow(2, attempt - 1), 1000);
            await sleep(backoffMs);
            continue;
          }
        } catch (error) {
          if (error instanceof StorageError) throw error;
          try {
            await unlink(fullLockPath);
          } catch {
            // Continue - file might have been removed
          }
        }
      }

      // Attempt to create lock file atomically
      const lockContent: LockFileContent = {
        pid: process.pid,
        createdAt: new Date().toISOString(),
        path,
      };

      try {
        await this.ensureDir(dirname(lockPath) || ".");
        await writeFile(fullLockPath, JSON.stringify(lockContent, null, 2), {
          flag: "wx",
        });

        // Success - return unlock function
        let released = false;

        const unlock = async (): Promise<void> => {
          if (released) return;

          try {
            if (existsSync(fullLockPath)) {
              const content = await readFile(fullLockPath, "utf-8");
              const lockInfo: LockFileContent = JSON.parse(content);

              if (lockInfo.pid === process.pid) {
                await unlink(fullLockPath);
              }
            }
          } catch {
            // Best effort release
          } finally {
            released = true;
          }
        };

        return unlock;
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "EEXIST") {
          if (attempt > maxRetries) {
            throw new StorageError(`Failed to acquire lock: ${path}`, {
              path,
              lockPath,
              reason: "Race condition - max retries exceeded",
              attempts: attempt,
            });
          }

          const backoffMs = Math.min(50 * Math.pow(2, attempt - 1), 1000);
          await sleep(backoffMs);
          continue;
        }

        throw new StorageError(`Failed to acquire lock: ${path}`, {
          path,
          lockPath,
          cause: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Extract directory portion from a path.
 * Works with both forward slashes and backslashes.
 */
function dirname(path: string): string {
  return path.split(/[/\\]/).slice(0, -1).join("/");
}
