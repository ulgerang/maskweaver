/**
 * Event Logger
 *
 * Append-only event logging for squad activities.
 * Uses JSONL format for efficient streaming and recovery.
 *
 * @author Kent Beck's Dummy Human
 */

import type { LogEvent, LogEventInput } from "./types.js";
import type { Session } from "./session.js";

// ============================================================================
// Event Logging
// ============================================================================

/**
 * Append an event to a squad's log.
 * Automatically adds a timestamp to the event.
 *
 * @param session - The parent session
 * @param squadId - ID of the squad to log to
 * @param event - Event data (without timestamp)
 *
 * @example
 * await logEvent(session, "squad-a1b2c3d4", {
 *   type: "task_assigned",
 *   taskId: "task-001",
 *   assignee: "worker-1",
 *   description: "Implement login form"
 * });
 */
export async function logEvent(
  session: Session,
  squadId: string,
  event: LogEventInput
): Promise<void> {
  const logPath = `${session.sessionPath}/squads/${squadId}/log.jsonl`;

  const fullEvent = {
    ...event,
    ts: new Date().toISOString(),
  };

  await session.storage.append(logPath, JSON.stringify(fullEvent));
}

/**
 * Read all events from a squad's log.
 * Returns an empty array if the log doesn't exist.
 *
 * @param session - The parent session
 * @param squadId - ID of the squad to read from
 * @returns Array of log events in chronological order
 *
 * @example
 * const events = await readLog(session, "squad-a1b2c3d4");
 * const completedTasks = events.filter(e => e.type === "task_completed");
 * console.log(`Completed tasks: ${completedTasks.length}`);
 */
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
    // Log doesn't exist yet - return empty array
    return [];
  }
}
