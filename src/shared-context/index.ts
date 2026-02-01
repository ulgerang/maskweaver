/**
 * @maskweaver/shared-context
 * 
 * Multi-agent collaboration with shared context
 */

// Types
export * from "./types.js";

// Storage
export { 
  FileStorageAdapter, 
  validatePath,
  type StorageAdapter 
} from "./storage.js";

// Session
export { 
  createSession, 
  loadSession,
  type Session,
  type CreateSessionOptions 
} from "./session.js";

// Squad
export { 
  createSquad, 
  getSquad, 
  updateSquadState,
  type CreateSquadOptions 
} from "./squad.js";

// Logger
export { logEvent, readLog } from "./logger.js";
