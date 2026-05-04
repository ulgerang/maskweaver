/**
 * Weave Types
 * 
 * Core type definitions for the phase-driven development workflow.
 */

// ============================================================================
// Phase & Plan Types
// ============================================================================

export type PhaseStatus = 'pending' | 'in_progress' | 'completed' | 'blocked';

// ============================================================================
// Map / Codebase Analysis Types
// ============================================================================

export interface StructuralIssue {
    area: string;
    severity: 'info' | 'warning' | 'critical';
    title: string;
    description: string;
    suggestion: string;
    affectedFiles: string[];
}

export interface StructuralChange {
    area: string;
    currentState: string;
    proposedChange: string;
    rationale: string;
    impact: 'low' | 'medium' | 'high';
    affectedFiles: string[];
    breaking: boolean;
    agreed: boolean;
}

export interface CodebaseCluster {
    name: string;
    nodeCount: number;
    description: string;
    keyFiles: string[];
    dependencies: string[];
}

export interface MapResult {
    mapPath: string;
    generatedAt: string;
    projectType: string;
    techStack: string[];
    gdcDetected: boolean;
    dependencyGraph: {
        nodes: number;
        edges: number;
        clusters: CodebaseCluster[];
    };
    structuralIssues: StructuralIssue[];
    reuseCandidates: Array<{
        filePath: string;
        score: number;
        matchedNeedles: string[];
        snippet?: string;
    }>;
    summary: string;
}

export interface ConsentPrompt {
    id: string;
    topic: string;
    currentState: string;
    proposedChange: string;
    rationale: string;
    impact: 'low' | 'medium' | 'high';
    breaking: boolean;
    options: string[];
    agreed: boolean;
}

// ============================================================================
// Build / Ralph-loop Types
// ============================================================================

export type BuildTaskStatus = 'pending' | 'in_progress' | 'passed' | 'failed' | 'escalated';

export interface BuildTaskState {
    taskId: string;
    phaseId: string;
    status: BuildTaskStatus;
    retryCount: number;
    maxRetries: number;
    lastError?: string;
    lastFailureFingerprint?: string;
    startedAt?: string;
    completedAt?: string;
    maskUsed?: string;
    agentTier?: AgentTier;
    commitHash?: string;
}

export type BuildStatus = 'running' | 'paused' | 'completed' | 'blocked' | 'failed';

export interface BuildOptions {
    phaseIds?: string[];
    projectType?: string;
    verifyMode?: 'quick' | 'full';
    maxIterations?: number;
    maxRetries?: number;
    basePath?: string;
}

export interface BuildResult {
    success: boolean;
    buildId: string;
    planName: string;
    phasesCompleted: number;
    phasesTotal: number;
    tasksCompleted: number;
    tasksFailed: number;
    tasksEscalated: number;
    verificationPassed: boolean;
    durationMs: number;
    completedAt: string;
    summary: string;
}

export interface BuildLoopState {
    buildId: string;
    planName: string;
    status: BuildStatus;
    createdAt: string;
    updatedAt: string;
    startedAt?: string;
    completedAt?: string;
    currentPhaseId?: string;
    currentTaskId?: string;
    maxRetries: number;
    globalRetryCount: number;
    noProgressCount: number;
    tasks: BuildTaskState[];
    escalationReason?: string;
    summary?: string;
}

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
    acceptanceCriteria?: GherkinScenario[]; // Phase-level BDD/Gherkin acceptance criteria
    featurePath?: string;          // Path to generated .feature file
}

export interface GherkinScenario {
    feature: string;
    scenario: string;
    given: string[];
    when: string[];
    then: string[];
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
        kind: 'command' | 'checklist' | 'gherkin';
        value: string;
    }>;                            // Task-specific verification guidance
    acceptanceRefs?: string[];     // Links back to acceptance criteria / spec refs
    acceptanceCriteria?: GherkinScenario[]; // BDD/Gherkin acceptance criteria
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

    /** Map / codebase analysis metadata. */
    mapGeneratedAt?: string;
    mapReportPath?: string;
    structuralChanges?: StructuralChange[];

    /** OpenSpec artifact directory (relative path). */
    openspecDir?: string;

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
// Build Wave & Wiki Context Types (Adaptive Wave Batching)
// ============================================================================

export type WaveTaskStatus = 'pending' | 'dispatched' | 'succeeded' | 'failed' | 'blocked' | 'verified';

export type FailureKind =
    | 'prompt_failure'
    | 'implementation_failure'
    | 'validation_failure'
    | 'conflict_failure'
    | 'dependency_failure'
    | 'environment_failure';

export interface WavePlan {
    waveIndex: number;
    tasks: WaveTaskEntry[];
    parallelSafe: boolean;
    wikiSnapshotDir?: string;
    startedAt?: string;
    completedAt?: string;
}

export interface WaveTaskEntry {
    taskId: string;
    phaseId: string;
    status: WaveTaskStatus;
    agentTier: AgentTier;
    mask: string | null;
    allowedPaths: string[];
    forbiddenPaths: string[];
    dependsOn: string[];
}

export interface TaskDelegationContract {
    buildId: string;
    phaseId: string;
    taskId: string;
    waveIndex: number;
    subagentType: string;
    mask: string | null;
    prompt: string;
    briefPath: string;
    contextPath: string;
    allowedPaths: string[];
    forbiddenPaths: string[];
    verifyCommands: string[];
    resumeCommand: string;
}

export interface TaskResult {
    taskId: string;
    phaseId: string;
    status: 'succeeded' | 'failed';
    changedFiles: string[];
    createdSymbols: string[];
    errorSummary?: string;
    failureKind?: FailureKind;
    downstreamExports: Array<{
        kind: string;
        path: string;
        summary: string;
    }>;
}

export interface WaveDelta {
    waveIndex: number;
    completed: string[];
    failed: string[];
    changedFiles: string[];
    newSymbols: string[];
    downstreamExports: Array<{ kind: string; path: string; summary: string }>;
}

export interface ContextIndex {
    buildId: string;
    lastWaveIndex: number;
    tasks: Record<string, {
        context: string[];
        upstream: Array<{
            taskId: string;
            result: string;
            verified: boolean;
            exports: string[];
        }>;
    }>;
}

export type BuildDecision =
    | { kind: 'dispatch_wave'; wave: WavePlan; contracts: TaskDelegationContract[] }
    | { kind: 'verify'; waveIndex: number }
    | { kind: 'repair'; contract: TaskDelegationContract; failureKind: FailureKind }
    | { kind: 'blocked'; reason: string; failedTasks: string[] }
    | { kind: 'complete'; summary: string };

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
    | { type: 'user_handoff'; phaseId: string; checklist: string[] }
    | { type: 'map_generated'; mapPath: string; issues: number }
    | { type: 'structural_change_detected'; change: string; rationale: string }
    | { type: 'structural_change_agreed'; change: string }
    | { type: 'build_started'; buildId: string; phasesTotal: number }
    | { type: 'build_task_escalated'; phaseId: string; taskId: string; reason: string }
    | { type: 'build_completed'; buildId: string; success: boolean; tasksCompleted: number }
    | { type: 'openspec_artifacts_generated'; path: string };

export type WeaveEventHandler = (event: WeaveEvent) => void;
