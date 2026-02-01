/**
 * Squad Management
 * 
 * Squad 생성, 조회, 업데이트
 */

import { randomUUID } from "crypto";
import type { SquadSpec, SquadState, Status } from "./types.js";
import type { Session } from "./session.js";
import { LIMITS } from "./types.js";

export interface CreateSquadOptions {
  mission: string;
  operator: string;
  constraints?: {
    timeout?: string;
    tokenBudget?: number;
    maxWorkers?: number;
  };
  scope?: {
    files?: string[];
    directories?: string[];
  };
}

export async function createSquad(
  session: Session,
  options: CreateSquadOptions
): Promise<{ spec: SquadSpec; state: SquadState }> {
  // 제한 확인
  if (session.manifest.squads.length >= LIMITS.maxSquadsPerSession) {
    throw new Error(`Max squads limit reached: ${LIMITS.maxSquadsPerSession}`);
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

  // 디렉토리 및 파일 생성
  await session.storage.ensureDir(squadPath);
  await session.storage.ensureDir(`${squadPath}/scratch`);
  await session.storage.write(`${squadPath}/spec.json`, spec);
  await session.storage.write(`${squadPath}/state.json`, state);

  // manifest 업데이트
  session.manifest.squads.push(squadId);
  await session.storage.write(
    `${session.sessionPath}/manifest.json`,
    session.manifest
  );

  return { spec, state };
}

export async function getSquad(
  session: Session,
  squadId: string
): Promise<{ spec: SquadSpec; state: SquadState } | null> {
  const squadPath = `${session.sessionPath}/squads/${squadId}`;
  const spec = await session.storage.read<SquadSpec>(`${squadPath}/spec.json`);
  const state = await session.storage.read<SquadState>(`${squadPath}/state.json`);
  if (!spec || !state) return null;
  return { spec, state };
}

export async function updateSquadState(
  session: Session,
  squadId: string,
  updates: Partial<SquadState>
): Promise<SquadState> {
  const squad = await getSquad(session, squadId);
  if (!squad) throw new Error(`Squad not found: ${squadId}`);

  const newState: SquadState = {
    ...squad.state,
    ...updates,
    updatedAt: new Date().toISOString(),
  };

  const squadPath = `${session.sessionPath}/squads/${squadId}`;
  await session.storage.write(`${squadPath}/state.json`, newState);
  return newState;
}
