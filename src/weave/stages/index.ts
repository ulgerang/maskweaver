/**
 * Weave Stages Index
 */

export { intake } from './intake.js';
export type { IntakeOptions, IntakeResult, DocumentAnalysis, Question } from './intake.js';

export { buildResearchReport, writeResearchReport } from './research.js';
export type { ResearchOptions, ResearchResult } from './research.js';

export { refinePlanFromNotes } from './refine.js';
export type { RefinePlanResult } from './refine.js';

export { plan, modifyPlan } from './plan.js';
export type { PlanOptions, PlanResult } from './plan.js';

export { execute, runAIVerification, generateVerificationReport } from './execute.js';
export type {
    ExecuteOptions,
    ExecuteResult,
    TaskExecutionContext,
    AIVerificationOptions,
    VerificationResult,
    VerificationLayer,
    WeaveVerifyConfig,
} from './execute.js';

export { handoff, handleUserResponse, generateStatusReport } from './handoff.js';
export type { HandoffOptions, HandoffResult, TestResults, UserResponse } from './handoff.js';
