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
    retryCount: number;
    maxRetries: number;
    lastError?: string;
    maskUsed?: string;             // Which mask was used for this task
}

export interface WeavePlan {
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
