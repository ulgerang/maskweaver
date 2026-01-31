/**
 * @maskweaver/verify
 * 
 * Complete verification system for code quality checks
 */

// Core types
export type {
  VerifyMode,
  ReviewerTier,
  VerifyTrigger,
  VerifyResult,
  VerifyConfig,
  VerifyRequest,
  VerifyResponse,
  VerifyIssue,
  BudgetState,
} from "./types.js";

// Constants
export {
  COST_RATES,
  ESCALATION_CHAIN,
} from "./types.js";

// Verifier
export {
  Verifier,
  createVerifier,
  quickVerify,
} from "./verifier.js";

// Budget tracking
export {
  BudgetTracker,
  createBudgetTracker,
} from "./budget.js";

// Escalation
export {
  shouldEscalate,
  getNextReviewer,
  getEscalationPath,
  canEscalate,
  getEscalationReason,
} from "./escalation.js";

// Critical file detection
export {
  isCriticalFile,
  getMatchedPatterns,
  getCriticalityLevel,
  DEFAULT_CRITICAL_PATTERNS,
} from "./critical-files.js";

// Prompts
export {
  getPromptForReviewer,
  fillPrompt,
  FLASH_REVIEW_PROMPT,
  HUMAN_REVIEW_PROMPT,
  PREMIUM_REVIEW_PROMPT,
} from "./prompts.js";
