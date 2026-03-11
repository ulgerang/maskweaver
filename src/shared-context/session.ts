/**
 * Session Management
 *
 * Creates and manages shared context sessions for multi-agent collaboration.
 * A session is the top-level container that holds squads and their shared state.
 *
 * @author Kent Beck's Dummy Human
 */

import { randomUUID } from "crypto";
import type { Manifest } from "./types.js";
import { validateManifest } from "./types.js";
import type { StorageAdapter } from "./storage.js";
import { ValidationError } from "../shared/errors.js";

// ============================================================================
// Types
// ============================================================================

/**
 * Options for creating a new collaboration session.
 */
export interface CreateSessionOptions {
  /** The high-level goal for this session */
  goal: string;
  /** Agent ID of the session creator */
  createdBy: string;
  /** Optional resource constraints */
  constraints?: {
    /** Maximum duration (e.g., "1h", "30m") */
    timeout?: string;
    /** Maximum token budget across all squads */
    tokenBudget?: number;
  };
}

/**
 * Represents an active collaboration session.
 * Contains the manifest, storage adapter, and path information.
 */
export interface Session {
  /** Session metadata and configuration */
  manifest: Manifest;
  /** Storage adapter for persisting session data */
  storage: StorageAdapter;
  /** Relative path to session directory */
  sessionPath: string;
}

// ============================================================================
// Session Operations
// ============================================================================

/**
 * Create a new collaboration session with the specified goal.
 * Initializes the directory structure and persists the manifest.
 *
 * @param storage - Storage adapter for persistence
 * @param options - Session configuration options
 * @returns The created session with manifest and storage
 *
 * @example
 * const storage = new FileStorageAdapter("/data");
 * const session = await createSession(storage, {
 *   goal: "Implement OAuth login feature",
 *   createdBy: "operator-agent",
 *   constraints: { timeout: "2h", tokenBudget: 100000 }
 * });
 * console.log(session.manifest.sessionId);
 */
export async function createSession(
  storage: StorageAdapter,
  options: CreateSessionOptions
): Promise<Session> {
  const sessionId = randomUUID();
  const sessionPath = `shared/${sessionId}`;

  const manifest: Manifest = {
    sessionId,
    version: 1,
    goal: options.goal,
    createdAt: new Date().toISOString(),
    createdBy: options.createdBy,
    squads: [],
    constraints: options.constraints,
  };

  // Create directory structure
  await storage.ensureDir(sessionPath);
  await storage.ensureDir(`${sessionPath}/events`);
  await storage.ensureDir(`${sessionPath}/squads`);

  // Persist manifest
  await storage.write(`${sessionPath}/manifest.json`, manifest);

  return { manifest, storage, sessionPath };
}

/**
 * Load an existing session by its ID.
 * Returns null if the session doesn't exist.
 * Validates manifest data at system boundary.
 *
 * @param storage - Storage adapter to read from
 * @param sessionId - UUID of the session to load
 * @returns The session if found, null otherwise
 * @throws ValidationError if manifest data is corrupted
 *
 * @example
 * const session = await loadSession(storage, "550e8400-e29b-41d4-a716-446655440000");
 * if (session) {
 *   console.log(`Loaded session: ${session.manifest.goal}`);
 * }
 */
export async function loadSession(
  storage: StorageAdapter,
  sessionId: string
): Promise<Session | null> {
  const sessionPath = `shared/${sessionId}`;
  const rawManifest = await storage.read<unknown>(`${sessionPath}/manifest.json`);

  if (!rawManifest) return null;

  // 경계에서 검증 - Parse, don't validate
  try {
    const manifest = validateManifest(rawManifest);
    return { manifest, storage, sessionPath };
  } catch (error) {
    throw new ValidationError(
      `Invalid manifest for session ${sessionId}`,
      { sessionId, error: error instanceof Error ? error.message : String(error) }
    );
  }
}
