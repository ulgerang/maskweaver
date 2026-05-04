/**
 * Weave Intake Types
 *
 * Type definitions for the intake and interview stages.
 */

import type { WeaveEvent, EnvironmentAnalysis, MapResult, StructuralChange, ConsentPrompt, GherkinScenario } from '../types.js';

export interface IntakeOptions {
    docsPath: string;
    onEvent?: (event: WeaveEvent) => void;
}

export interface IntakeResult {
    documents: DocumentAnalysis[];
    features: string[];
    domainTerms: { term: string; description?: string }[];
    technicalRequirements: {
        frontend?: string[];
        backend?: string[];
        database?: string[];
        other?: string[];
    };
    questions: Question[];
    similarProjects?: string[];
    environment?: EnvironmentAnalysis;
    codebaseMapPath?: string;
    structuralChanges?: StructuralChange[];
    consentPrompts?: ConsentPrompt[];
    ambiguityScore?: AmbiguityScore;
    generatedScenarios?: GherkinScenario[];
}

export interface DocumentAnalysis {
    path: string;
    title: string;
    sections: string[];
    keyPoints: string[];
}

export interface Question {
    id: string;
    topic: string;
    question: string;
    options?: string[];
    required: boolean;
    questionType?: 'clarification' | 'gherkin-given' | 'gherkin-when' | 'gherkin-then' | 'edge-case' | 'constraint' | 'priority' | 'technical';
    targetFeature?: string;
}

// ============================================================================
// Ambiguity Scoring Types
// ============================================================================

export interface AmbiguityComponent {
    name: string;
    clarityScore: number;
    weight: number;
    justification: string;
    thresholds: { label: string; minScore: number; description: string }[];
}

export interface AmbiguityBreakdown {
    goalClarity: AmbiguityComponent;
    constraintClarity: AmbiguityComponent;
    successCriteriaClarity: AmbiguityComponent;
    contextClarity?: AmbiguityComponent;
}

export interface AmbiguityScore {
    overallScore: number;
    breakdown: AmbiguityBreakdown;
    isReadyForSeed: boolean;
    readinessForGherkin: boolean;
    milestone: 'initial' | 'progress' | 'refined' | 'ready';
    milestoneDescription: string;
    weakestArea: string;
    nextMilestone?: { threshold: number; label: string; description: string };
}

// ============================================================================
// Interview State Types
// ============================================================================

export interface InterviewRound {
    roundNumber: number;
    questions: Question[];
    answers: Record<string, string>;
    ambiguityBefore?: AmbiguityScore;
    ambiguityAfter?: AmbiguityScore;
    gherkinGenerated?: GherkinScenario[];
    timestamp: string;
}

export interface InterviewState {
    interviewId: string;
    status: 'in_progress' | 'completed' | 'aborted';
    initialContext: string;
    rounds: InterviewRound[];
    currentRound: number;
    features: string[];
    isBrownfield: boolean;
    createdAt: string;
    updatedAt: string;
}

// ============================================================================
// Interview Public API Types
// ============================================================================

export interface InterviewOptions {
    docsPath: string;
    basePath?: string;
    mapResult?: MapResult | null;
    onEvent?: (event: WeaveEvent) => void;
    resumeId?: string;
    userAnswers?: Record<string, string>;
    skipGherkinQuestions?: boolean;
}

export interface InterviewResult {
    intake: IntakeResult;
    agreedStructuralChanges: StructuralChange[];
    userAnswers: Record<string, string>;
    satisfied: boolean;
    ambiguityScore?: AmbiguityScore;
    generatedScenarios?: GherkinScenario[];
    interviewState?: InterviewState;
    isMultiRound?: boolean;
}

export interface IntakeWithAnalysisOptions extends IntakeOptions {
    skipEnvironmentAnalysis?: boolean;
    warningsOnly?: boolean;
}
