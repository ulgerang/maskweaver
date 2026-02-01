/**
 * Verify Types
 * 
 * Complete type definitions for the verification system
 */

export type VerifyMode = "auto" | "manual" | "off";
export type ReviewerTier = "dummy-flash" | "dummy-human" | "dummy-premium";
export type VerifyTrigger = "onWrite" | "onTestFail" | "onRequest" | "onCriticalFile";
export type VerifyResult = "pass" | "warn" | "fail";

/**
 * Configuration for the verification system
 */
export interface VerifyConfig {
  mode: VerifyMode;
  reviewer: ReviewerTier;
  escalation: {
    onWarn?: ReviewerTier;
    onFail?: ReviewerTier;
  };
  budget: {
    maxPerSessionUSD: number;
    maxPerCheckUSD: number;
  };
  triggers: {
    onWrite?: boolean;
    onTestFail?: boolean;
    onCriticalFile?: boolean;
  };
  criticalFiles?: string[]; // glob patterns
}

/**
 * Verification request
 */
export interface VerifyRequest {
  trigger: VerifyTrigger;
  content: string;       // Code/result to verify
  context?: string;      // Additional context
  filePath?: string;
  previousResult?: VerifyResponse;
}

/**
 * Verification response
 */
export interface VerifyResponse {
  result: VerifyResult;
  reviewer: ReviewerTier;
  summary: string;
  issues?: VerifyIssue[];
  suggestions?: string[];
  cost: number;          // USD
  escalated: boolean;
}

/**
 * Individual verification issue
 */
export interface VerifyIssue {
  severity: "error" | "warning" | "info";
  message: string;
  line?: number;
  suggestion?: string;
}

/**
 * Budget tracking state
 */
export interface BudgetState {
  sessionTotal: number;
  sessionLimit: number;
  checkTotal: number;
  checkLimit: number;
  exceeded: boolean;
}

/**
 * Cost rates per reviewer tier (USD per 1K tokens)
 */
export const COST_RATES: Record<ReviewerTier, number> = {
  "dummy-flash": 0.0001,
  "dummy-human": 0.003,
  "dummy-premium": 0.015,
};

/**
 * Escalation chain configuration
 */
export const ESCALATION_CHAIN: Record<ReviewerTier, ReviewerTier | null> = {
  "dummy-flash": "dummy-human",
  "dummy-human": "dummy-premium",
  "dummy-premium": null, // Cannot escalate further
};
