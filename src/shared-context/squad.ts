/**
 * Squad Management
 *
 * Squads are work units within a session, each with their own mission,
 * constraints, and set of tasks. This module handles squad lifecycle.
 *
 * @author Kent Beck's Dummy Human
 */

import { randomUUID } from "crypto";
import type { SquadSpec, SquadState } from "./types.js";
import { LIMITS, validateSquadSpec, validateSquadState } from "./types.js";
import type { Session } from "./session.js";
import { StorageError, ValidationError } from "../shared/errors.js";

// ============================================================================
// Types
// ============================================================================

/**
 * Options for creating a new squad within a session.
 */
export interface CreateSquadOptions {
  /** The squad's mission objective */
  mission: string;
  /** Agent ID of the squad operator */
  operator: string;
  /** Optional resource constraints for the squad */
  constraints?: {
    /** Maximum duration (e.g., "1h", "30m") */
    timeout?: string;
    /** Maximum token budget for this squad */
    tokenBudget?: number;
    /** Maximum number of worker agents */
    maxWorkers?: number;
  };
  /** File/directory scope for the squad's work */
  scope?: {
    /** Files the squad can modify */
    files?: string[];
    /** Directories the squad can access */
    directories?: string[];
  };
}

// ============================================================================
// Squad Operations
// ============================================================================

/**
 * Create a new squad within a session.
 * A squad is a unit of work with its own mission and constraints.
 *
 * @param session - The parent session
 * @param options - Squad configuration options
 * @returns The created squad's spec and initial state
 * @throws {ValidationError} If session has reached max squad limit
 *
 * @example
 * const { spec, state } = await createSquad(session, {
 *   mission: "Implement user authentication",
 *   operator: "auth-operator",
 *   constraints: { maxWorkers: 3 },
 *   scope: { directories: ["src/auth"] }
 * });
 */
export async function createSquad(
  session: Session,
  options: CreateSquadOptions
): Promise<{ spec: SquadSpec; state: SquadState }> {
  // Enforce squad limit
  if (session.manifest.squads.length >= LIMITS.maxSquadsPerSession) {
    throw new ValidationError("Maximum squads per session exceeded", {
      limit: LIMITS.maxSquadsPerSession,
      current: session.manifest.squads.length,
      sessionId: session.manifest.sessionId,
    });
  }

  const squadId = `squad-${randomUUID().slice(0, 8)}`;
  const squadPath = `${session.sessionPath}/squads/${squadId}`;

  const spec: SquadSpec = {
    squadId,
    mission: options.mission,
    operator: options.operator,
    constraints: {
      timeout: options.constraints?.timeout,
      tokenBudget: options.constraints?.tokenBudget,
      maxWorkers: options.constraints?.maxWorkers ?? LIMITS.maxWorkersPerSquad,
    },
    scope: options.scope,
    createdAt: new Date().toISOString(),
  };

  const state: SquadState = {
    squadId,
    status: "pending",
    progress: 0,
    tasks: [],
    sharedContext: {},
    updatedAt: new Date().toISOString(),
  };

  // Create directory structure and persist data
  await session.storage.ensureDir(squadPath);
  await session.storage.ensureDir(`${squadPath}/scratch`);
  await session.storage.write(`${squadPath}/spec.json`, spec);
  await session.storage.write(`${squadPath}/state.json`, state);

  // Update session manifest with new squad
  session.manifest.squads.push(squadId);
  await session.storage.write(
    `${session.sessionPath}/manifest.json`,
    session.manifest
  );

  return { spec, state };
}

/**
 * Retrieve a squad's specification and current state.
 * Validates data at system boundary.
 *
 * @param session - The parent session
 * @param squadId - ID of the squad to retrieve
 * @returns Squad spec and state, or null if not found
 * @throws ValidationError if data is corrupted
 *
 * @example
 * const squad = await getSquad(session, "squad-a1b2c3d4");
 * if (squad) {
 *   console.log(`Squad status: ${squad.state.status}`);
 * }
 */
export async function getSquad(
  session: Session,
  squadId: string
): Promise<{ spec: SquadSpec; state: SquadState } | null> {
  const squadPath = `${session.sessionPath}/squads/${squadId}`;

  const rawSpec = await session.storage.read<unknown>(`${squadPath}/spec.json`);
  const rawState = await session.storage.read<unknown>(`${squadPath}/state.json`);

  if (!rawSpec || !rawState) return null;

  // 경계에서 검증 - Parse, don't validate
  try {
    const spec = validateSquadSpec(rawSpec);
    const state = validateSquadState(rawState);
    return { spec, state };
  } catch (error) {
    throw new ValidationError(
      `Invalid squad data for ${squadId}`,
      { squadId, error: error instanceof Error ? error.message : String(error) }
    );
  }
}

/**
 * Update a squad's state with partial changes.
 * Automatically updates the `updatedAt` timestamp.
 *
 * @param session - The parent session
 * @param squadId - ID of the squad to update
 * @param updates - Partial state updates to apply
 * @returns The new state after update
 * @throws {StorageError} If the squad doesn't exist
 *
 * @example
 * const newState = await updateSquadState(session, "squad-a1b2c3d4", {
 *   status: "active",
 *   progress: 50
 * });
 */
export async function updateSquadState(
  session: Session,
  squadId: string,
  updates: Partial<SquadState>
): Promise<SquadState> {
  const squad = await getSquad(session, squadId);

  if (!squad) {
    throw new StorageError(`Squad not found: ${squadId}`, {
      squadId,
      sessionId: session.manifest.sessionId,
      sessionPath: session.sessionPath,
    });
  }

  const newState: SquadState = {
    ...squad.state,
    ...updates,
    updatedAt: new Date().toISOString(),
  };

  const squadPath = `${session.sessionPath}/squads/${squadId}`;
  await session.storage.write(`${squadPath}/state.json`, newState);

  return newState;
}
