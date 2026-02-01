/**
 * Session Management
 * 
 * 공유 컨텍스트 세션 생성 및 관리
 */

import { randomUUID } from "crypto";
import type { Manifest, SquadSpec, SquadState } from "./types.js";
import type { StorageAdapter } from "./storage.js";
import { LIMITS } from "./types.js";

export interface CreateSessionOptions {
  goal: string;
  createdBy: string;
  constraints?: {
    timeout?: string;
    tokenBudget?: number;
  };
}

export interface Session {
  manifest: Manifest;
  storage: StorageAdapter;
  sessionPath: string;
}

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

  // 디렉토리 구조 생성
  await storage.ensureDir(sessionPath);
  await storage.ensureDir(`${sessionPath}/events`);
  await storage.ensureDir(`${sessionPath}/squads`);
  
  // manifest 저장
  await storage.write(`${sessionPath}/manifest.json`, manifest);

  return { manifest, storage, sessionPath };
}

export async function loadSession(
  storage: StorageAdapter,
  sessionId: string
): Promise<Session | null> {
  const sessionPath = `shared/${sessionId}`;
  const manifest = await storage.read<Manifest>(`${sessionPath}/manifest.json`);
  if (!manifest) return null;
  return { manifest, storage, sessionPath };
}
