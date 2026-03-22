/**
 * Weave Types
 * 
 * Core type definitions for the phase-driven development workflow.
 */

// ============================================================================
// Phase & Plan Types
// ============================================================================

export type PhaseStatus = 'pending' | 'in_progress' | 'completed' | 'blocked';

export interface WeavePhase {
    id: string;                    // e.g., "P1", "P2"
    name: string;                  // e.g., "감정 선택 UI"
    status: PhaseStatus;
    doneWhen: string;              // Completion criteria
    checklist: string[];           // User verification items
    tasks: WeaveTask[];
    dependsOn?: string[];          // Phase dependencies
    estimatedHours?: number;
    actualHours?: number;
    masksUsed?: string[];          // Masks auto-selected during execution
    startedAt?: string;
    completedAt?: string;
}

export interface WeaveTask {
    id: string;
    name: string;
    status: 'pending' | 'in_progress' | 'passed' | 'failed';
    testCase?: string;             // Expected test case
    nodeIds?: string[];            // Linked GDC node IDs
    changeRefs?: string[];         // Linked change artifact IDs
    files?: string[];              // Primary file targets for this task
    dependsOn?: string[];          // Task-level dependencies inside a phase
    verify?: Array<{
        kind: 'command' | 'checklist';
        value: string;
    }>;                            // Task-specific verification guidance
    acceptanceRefs?: string[];     // Links back to acceptance criteria / spec refs
    retryCount: number;
    maxRetries: number;
    lastError?: string;
    maskUsed?: string;             // Which mask was used for this task
}

// ============================================================================
// Agent Tier & Complexity (Execution Optimization)
// ============================================================================

/** Agent tier for task delegation - maps to subagent_type */
export type AgentTier = 'dummy-flash' | 'dummy-human' | 'dummy-premium';

/** Task complexity assessment */
export type TaskComplexity = 'simple' | 'standard' | 'complex';

/** Execution plan for a single task within a phase */
export interface TaskExecutionPlan {
    task: WeaveTask;
    mask: string | null;
    agentTier: AgentTier;
    complexity: TaskComplexity;
    troubleshootingHints: string[];
}

/** Execution plan for an entire phase */
export interface PhaseExecutionPlan {
    phaseId: string;
    phaseName: string;
    status: PhaseStatus;
    taskPlans: TaskExecutionPlan[];
    gdcContextFiles?: Array<{
        taskId: string;
        nodeId: string;
        path: string;
        changePath?: string;
        status: 'generated' | 'skipped' | 'failed';
        note?: string;
    }>;
    summary: string;
}

// ============================================================================
// Plan Types
// ============================================================================

export interface WeaveChangeMetadata {
    changeId: string;
    planName: string;
    projectName: string;
    status: 'active' | 'verified' | 'archived';
    createdAt: string;
    updatedAt: string;
    verifiedAt?: string;
    archivedAt?: string;
    proposalPath: string;
    designPath: string;
    tasksPath: string;
    verifyPath: string;
    archivePath: string;
}

export type WeaveLoopStatus = 'running' | 'stopping' | 'stopped' | 'blocked' | 'verified' | 'failed';

export interface WeaveLoopRun {
    loopId: string;
    changeId: string;
    phaseId: string;
    status: WeaveLoopStatus;
    createdAt: string;
    updatedAt: string;
    startedAt?: string;
    stoppedAt?: string;
    stopReason?: string;
    maxIterations: number;
    iterationCount: number;
    maxNoProgress: number;
    noProgressCount: number;
    lastAttemptId?: string;
    lastVerifierResult?: 'pass' | 'fail';
    lastFailureFingerprint?: string;
    lastFailureSummary?: string;
    latestWorkerBriefPath?: string;
    collaborationSessionId?: string;
    latestSquadId?: string;
    latestTaskBundlePath?: string;
    verifyMode?: 'quick' | 'full';
}

export type WeaveLoopOperatorStatus = 'running' | 'idle' | 'completed' | 'timed_out' | 'blocked';

export interface WeaveLoopOperatorState {
    operatorId: string;
    status: WeaveLoopOperatorStatus;
    startedAt: string;
    updatedAt: string;
    finishedAt?: string;
    targetLoopId?: string;
    pollIntervalMs: number;
    pollCycles: number;
    lastCycle: number;
    syncedCount: number;
    failedCount: number;
    waitingCount: number;
    lastSummary?: string;
}

export interface WeavePlan {
    /**
     * Stable, filesystem-safe identifier for the plan.
     * Used for plan filename and state.yaml active_plan.
     *
     * Example: "emotion-diary"
     */
    planName?: string;
    projectName: string;
    createdAt: string;
    updatedAt: string;
    vision: string;
    architecture: {
        frontend?: string;
        backend?: string;
        database?: string;
        notes?: string;
    };
    /** Optional research artifact path generated before planning. */
    researchPath?: string;
    researchUpdatedAt?: string;

    /** Plan approval gate metadata (required before implementation). */
    planApproved?: boolean;
    planApprovedAt?: string;
    planApprovalNotes?: string;

    /** Optional metadata for automatically split plans. */
    planRole?: 'standalone' | 'shard';
    parentPlanName?: string;
    shardIndex?: number;
    shardTotal?: number;
    nextPlanName?: string;
    activeChangeId?: string;
    changeIds?: string[];

    phases: WeavePhase[];
    currentPhase?: string;
}

// ============================================================================
// Workflow Status
// ============================================================================

export interface WeaveStatus {
    plan: WeavePlan | null;
    currentPhase: WeavePhase | null;
    completedPhases: number;
    totalPhases: number;
    overallProgress: number;       // 0-100
    activeMask?: string;
    lastActivity?: string;
}

// ============================================================================
// Configuration
// ============================================================================

export interface WeaveConfig {
    maxRetries: number;            // Default: 5
    autoSelectMasks: boolean;      // Default: true
    globalKnowledge: boolean;      // Default: true (cross-project sharing)
    verifyEscalation: boolean;     // Default: true (use 3-tier verify)

    // Mask preferences per task type
    maskPreferences?: {
        architecture?: string;       // e.g., "martin-fowler"
        testing?: string;            // e.g., "kent-beck"
        frontend?: string;           // e.g., "dan-abramov"
        performance?: string;        // e.g., "linus-torvalds"
        ml?: string;                 // e.g., "andrew-ng"
    };
}

// ============================================================================
// Troubleshooting Knowledge (Cross-Project RAG)
// ============================================================================

export interface TroubleshootingEntry {
    id?: number;
    errorSignature?: string;       // Normalized error pattern (auto-generated)
    errorMessage: string;          // Original error message
    context: string;               // What was being done
    solution: string;              // How it was fixed
    projectType?: string;          // e.g., "react", "nextjs", "go"
    techStack?: string[];          // e.g., ["typescript", "tailwind"]
    tags?: string[];               // e.g., ["build-error", "type-error"]
    effectiveness: number;         // 1-10 rating
    createdAt: string;
    usedCount: number;             // How many times this solution was used
    lastUsedAt?: string;
}

export interface KnowledgeSearchResult {
    entry: TroubleshootingEntry;
    score: number;
    matchType: 'exact' | 'similar' | 'related';
}

// ============================================================================
// Environment Analysis (Proactive Knowledge)
// ============================================================================

export interface EnvironmentContext {
    os: 'windows' | 'macos' | 'linux';
    shell: 'powershell' | 'bash' | 'zsh' | 'cmd' | 'unknown';
    nodeVersion: string;
    bunVersion?: string;
    packageManager: 'npm' | 'pnpm' | 'bun' | 'yarn' | 'unknown';
    stack: string[];
    cwd: string;
}

export interface PotentialIssue {
    id: string;
    category: 'environment' | 'compatibility' | 'config' | 'shell' | 'version';
    severity: 'info' | 'warning' | 'critical';
    title: string;
    description: string;
    prevention: string;
    appliesWhen: string;
    source: 'builtin' | 'project_history';
}

export interface EnvironmentAnalysis {
    context: EnvironmentContext;
    issues: PotentialIssue[];
    summary: string;  // Markdown formatted summary
    analyzedAt: string;
}

// ============================================================================
// Events
// ============================================================================

export type WeaveEvent =
    | { type: 'phase_started'; phaseId: string }
    | { type: 'phase_completed'; phaseId: string; duration: number }
    | { type: 'task_started'; phaseId: string; taskId: string }
    | { type: 'task_passed'; phaseId: string; taskId: string }
    | { type: 'task_failed'; phaseId: string; taskId: string; error: string }
    | { type: 'mask_selected'; maskId: string; reason: string }
    | { type: 'troubleshooting_found'; query: string; solutions: number }
    | { type: 'troubleshooting_recorded'; errorSignature: string }
    | { type: 'user_handoff'; phaseId: string; checklist: string[] };

export type WeaveEventHandler = (event: WeaveEvent) => void;
