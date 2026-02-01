/**
 * Budget Tracker
 * 
 * Tracks verification costs and enforces budget limits
 */

import type { BudgetState, ReviewerTier, VerifyConfig } from "./types.js";
import { COST_RATES } from "./types.js";

/**
 * Estimates token count from text length
 * Rough approximation: 1 token ≈ 4 characters
 */
function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/**
 * Budget tracker class
 */
export class BudgetTracker {
  private sessionTotal: number = 0;
  private checkTotal: number = 0;

  constructor(
    private readonly sessionLimit: number,
    private readonly checkLimit: number
  ) {}

  /**
   * Estimate cost for a verification request
   */
  estimateCost(content: string, context: string | undefined, reviewer: ReviewerTier): number {
    const contentTokens = estimateTokens(content);
    const contextTokens = context ? estimateTokens(context) : 0;
    const totalTokens = contentTokens + contextTokens;
    
    // Add overhead for prompt template and response (~500 tokens)
    const totalWithOverhead = totalTokens + 500;
    
    const costPer1K = COST_RATES[reviewer];
    return (totalWithOverhead / 1000) * costPer1K;
  }

  /**
   * Check if a verification can proceed within budget
   */
  canProceed(estimatedCost: number): boolean {
    if (this.sessionTotal + estimatedCost > this.sessionLimit) {
      return false;
    }
    if (estimatedCost > this.checkLimit) {
      return false;
    }
    return true;
  }

  /**
   * Record actual cost
   */
  recordCost(cost: number): void {
    this.sessionTotal += cost;
    this.checkTotal = cost;
  }

  /**
   * Get current budget state
   */
  getState(): BudgetState {
    return {
      sessionTotal: this.sessionTotal,
      sessionLimit: this.sessionLimit,
      checkTotal: this.checkTotal,
      checkLimit: this.checkLimit,
      exceeded: this.sessionTotal >= this.sessionLimit,
    };
  }

  /**
   * Reset session budget
   */
  resetSession(): void {
    this.sessionTotal = 0;
    this.checkTotal = 0;
  }

  /**
   * Reset check budget
   */
  resetCheck(): void {
    this.checkTotal = 0;
  }
}

/**
 * Create budget tracker from config
 */
export function createBudgetTracker(config: VerifyConfig): BudgetTracker {
  return new BudgetTracker(
    config.budget.maxPerSessionUSD,
    config.budget.maxPerCheckUSD
  );
}
