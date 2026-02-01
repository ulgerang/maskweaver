/**
 * Event Logger
 * 
 * Append-only 이벤트 로그
 */

import type { LogEvent } from "./types.js";
import type { Session } from "./session.js";

export async function logEvent(
  session: Session,
  squadId: string,
  event: Omit<LogEvent, "ts">
): Promise<void> {
  const logPath = `${session.sessionPath}/squads/${squadId}/log.jsonl`;
  const fullEvent = {
    ...event,
    ts: new Date().toISOString(),
  };
  await session.storage.append(logPath, JSON.stringify(fullEvent));
}

export async function readLog(
  session: Session,
  squadId: string
): Promise<LogEvent[]> {
  const logPath = `${session.sessionPath}/squads/${squadId}/log.jsonl`;
  const fullPath = session.storage.getFullPath(logPath);
  
  try {
    const content = await Bun.file(fullPath).text();
    return content
      .split("\n")
      .filter(Boolean)
      .map((line) => JSON.parse(line) as LogEvent);
  } catch {
    return [];
  }
}
