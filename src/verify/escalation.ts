/**
 * Escalation System
 * 
 * Handles escalation to higher-tier reviewers when issues are found
 */

import type { ReviewerTier, VerifyConfig, VerifyResult } from "./types.js";
import { ESCALATION_CHAIN } from "./types.js";

/**
 * Determine if escalation is needed based on result and config
 */
export function shouldEscalate(
  result: VerifyResult,
  config: VerifyConfig
): boolean {
  if (result === "pass") {
    return false;
  }
  
  if (result === "warn" && config.escalation.onWarn) {
    return true;
  }
  
  if (result === "fail" && config.escalation.onFail) {
    return true;
  }
  
  return false;
}

/**
 * Get next reviewer in escalation chain
 */
export function getNextReviewer(
  current: ReviewerTier,
  reason: "warn" | "fail",
  config: VerifyConfig
): ReviewerTier | null {
  // Check if config specifies explicit escalation target
  if (reason === "warn" && config.escalation.onWarn) {
    return config.escalation.onWarn;
  }
  
  if (reason === "fail" && config.escalation.onFail) {
    return config.escalation.onFail;
  }
  
  // Fall back to default escalation chain
  return ESCALATION_CHAIN[current];
}

/**
 * Get full escalation path from current reviewer
 */
export function getEscalationPath(
  from: ReviewerTier,
  config: VerifyConfig
): ReviewerTier[] {
  const path: ReviewerTier[] = [from];
  let current = from;
  
  while (true) {
    const next = ESCALATION_CHAIN[current];
    if (!next) break;
    path.push(next);
    current = next;
  }
  
  return path;
}

/**
 * Check if reviewer can escalate further
 */
export function canEscalate(reviewer: ReviewerTier): boolean {
  return ESCALATION_CHAIN[reviewer] !== null;
}

/**
 * Get escalation reason message
 */
export function getEscalationReason(
  result: VerifyResult,
  fromReviewer: ReviewerTier,
  toReviewer: ReviewerTier
): string {
  const reasonMap: Record<VerifyResult, string> = {
    pass: "No escalation needed",
    warn: `${fromReviewer} found warnings, escalating to ${toReviewer} for deeper review`,
    fail: `${fromReviewer} found critical issues, escalating to ${toReviewer} for expert analysis`,
  };
  
  return reasonMap[result];
}
