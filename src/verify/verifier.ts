/**
 * Verifier System
 * 
 * Main verification logic with reviewer orchestration
 */

import type {
  VerifyConfig,
  VerifyRequest,
  VerifyResponse,
  VerifyResult,
  VerifyIssue,
  ReviewerTier,
} from "./types.js";
import { BudgetTracker, createBudgetTracker } from "./budget.js";
import { getPromptForReviewer, fillPrompt } from "./prompts.js";
import { shouldEscalate, getNextReviewer, getEscalationReason } from "./escalation.js";
import { isCriticalFile } from "./critical-files.js";

/**
 * Parse reviewer response
 * In a real implementation, this would call the actual AI reviewer
 */
function parseReviewerResponse(responseText: string): {
  result: VerifyResult;
  summary: string;
  issues: VerifyIssue[];
  suggestions: string[];
} {
  try {
    // Try to parse as JSON
    const parsed = JSON.parse(responseText);
    return {
      result: parsed.result || "pass",
      summary: parsed.summary || "Review completed",
      issues: parsed.issues || [],
      suggestions: parsed.suggestions || [],
    };
  } catch {
    // Fallback parsing logic
    return {
      result: "pass",
      summary: "Review completed (parsing fallback)",
      issues: [],
      suggestions: [],
    };
  }
}

/**
 * Simulate calling a reviewer (placeholder for actual AI call)
 */
async function callReviewer(
  prompt: string,
  reviewer: ReviewerTier
): Promise<string> {
  // In real implementation, this would call:
  // - Task tool to spawn a dummy-{tier} agent
  // - Or direct API call to the appropriate model
  
  // For now, return a mock response
  return JSON.stringify({
    result: "pass",
    summary: `Mock review by ${reviewer}`,
    issues: [],
    suggestions: [],
  });
}

/**
 * Main Verifier class
 */
export class Verifier {
  private budgetTracker: BudgetTracker;

  constructor(private config: VerifyConfig) {
    this.budgetTracker = createBudgetTracker(config);
  }

  /**
   * Verify code/content
   */
  async verify(request: VerifyRequest): Promise<VerifyResponse> {
    // Check if critical file requires escalation
    const startingReviewer = this.getStartingReviewer(request);
    
    // Verify with initial reviewer
    let response = await this.verifyWithReviewer(request, startingReviewer);
    
    // Check if escalation is needed
    if (shouldEscalate(response.result, this.config)) {
      const nextReviewer = getNextReviewer(
        response.reviewer,
        response.result === "warn" ? "warn" : "fail",
        this.config
      );
      
      if (nextReviewer) {
        // Escalate
        const escalatedRequest = {
          ...request,
          previousResult: response,
          context: `${request.context || ""}\n\nPrevious review by ${response.reviewer}:\n${response.summary}`,
        };
        
        const escalatedResponse = await this.verifyWithReviewer(
          escalatedRequest,
          nextReviewer
        );
        
        escalatedResponse.escalated = true;
        return escalatedResponse;
      }
    }
    
    return response;
  }

  /**
   * Verify with a specific reviewer
   */
  private async verifyWithReviewer(
    request: VerifyRequest,
    reviewer: ReviewerTier
  ): Promise<VerifyResponse> {
    // Check budget
    const estimatedCost = this.budgetTracker.estimateCost(
      request.content,
      request.context,
      reviewer
    );
    
    if (!this.budgetTracker.canProceed(estimatedCost)) {
      return {
        result: "fail",
        reviewer,
        summary: "Budget exceeded - cannot proceed with verification",
        issues: [{
          severity: "error",
          message: "Verification budget limit reached",
          suggestion: "Increase budget limits or run verification manually",
        }],
        cost: 0,
        escalated: false,
      };
    }
    
    // Build prompt
    const promptTemplate = getPromptForReviewer(reviewer);
    const prompt = fillPrompt(promptTemplate, request.content, request.context);
    
    // Call reviewer
    const responseText = await callReviewer(prompt, reviewer);
    
    // Parse response
    const parsed = parseReviewerResponse(responseText);
    
    // Record actual cost
    this.budgetTracker.recordCost(estimatedCost);
    
    return {
      result: parsed.result,
      reviewer,
      summary: parsed.summary,
      issues: parsed.issues,
      suggestions: parsed.suggestions,
      cost: estimatedCost,
      escalated: false,
    };
  }

  /**
   * Determine starting reviewer based on trigger and file criticality
   */
  private getStartingReviewer(request: VerifyRequest): ReviewerTier {
    // Critical files always start with human or premium
    if (request.filePath && isCriticalFile(request.filePath, this.config.criticalFiles)) {
      return this.config.escalation.onFail || "dummy-human";
    }
    
    // Test failures might need higher tier
    if (request.trigger === "onTestFail") {
      return this.config.escalation.onWarn || this.config.reviewer;
    }
    
    // Default to configured reviewer
    return this.config.reviewer;
  }

  /**
   * Get budget state
   */
  getBudgetState() {
    return this.budgetTracker.getState();
  }

  /**
   * Reset session budget
   */
  resetSessionBudget() {
    this.budgetTracker.resetSession();
  }
}

/**
 * Create a verifier instance
 */
export function createVerifier(config: VerifyConfig): Verifier {
  return new Verifier(config);
}

/**
 * Quick verify function for one-off checks
 */
export async function quickVerify(
  content: string,
  options?: {
    reviewer?: ReviewerTier;
    context?: string;
    filePath?: string;
  }
): Promise<VerifyResponse> {
  const config: VerifyConfig = {
    mode: "manual",
    reviewer: options?.reviewer || "dummy-flash",
    escalation: {},
    budget: {
      maxPerSessionUSD: 1.0,
      maxPerCheckUSD: 0.1,
    },
    triggers: {},
  };
  
  const verifier = createVerifier(config);
  
  return verifier.verify({
    trigger: "onRequest",
    content,
    context: options?.context,
    filePath: options?.filePath,
  });
}
