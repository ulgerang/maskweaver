/**
 * @maskweaver/weave
 * 
 * Phase-Driven Development Workflow
 * "AI가 검증하고, 유저가 확인한다"
 * 
 * Integrates with all Maskweaver modules:
 * - core: Expert mask auto-selection per task
 * - memory: Cross-project knowledge sharing (troubleshooting, patterns)
 * - context: Phase-based file tracking
 * - verify: Self-verification loop with 3-tier escalation
 * - retrospect: Phase completion analysis
 */

// Types
export type {
    WeavePhase,
    WeavePlan,
    WeaveTask,
    WeaveStatus,
    WeaveConfig,
    TroubleshootingEntry,
    // Environment Analysis Types
    EnvironmentContext,
    EnvironmentAnalysis,
    PotentialIssue,
} from './types.js';

// Worktree utilities (parallel development)
export {
    createWeaveWorktree,
    listWeaveWorktrees,
    resolveWeaveWorktree,
    removeWeaveWorktree,
    bootstrapWeaveArtifacts,
} from './worktree.js';

// Core workflow stages
export { intake } from './stages/intake.js';
export { spec } from './stages/spec.js';
export { plan } from './stages/plan.js';
export { execute } from './stages/execute.js';
export { handoff } from './stages/handoff.js';

// Orchestrator (mask auto-selection)
export { WeaveOrchestrator } from './orchestrator.js';

// Global Knowledge Base (cross-project RAG)
export {
    GlobalKnowledge,
    recordTroubleshooting,
    searchTroubleshooting,
    getGlobalDbPath,
} from './knowledge/global.js';

// Environment Analysis (Proactive Knowledge)
export {
    analyzeEnvironment,
    detectEnvironment,
    collectPotentialIssues,
    filterIssuesBySeverity,
    filterIssuesByCategory,
    hasCriticalIssues,
    getEnvironmentOneLiner,
    // Phase/Feature context search
    searchPhaseIssues,
    searchFeatureIssues,
    formatContextResults,
} from './environment/index.js';

export type {
    PhaseContext,
    FeatureContext,
    ContextSearchResult,
} from './environment/index.js';

// Phase management
export {
    PhaseManager,
    createPhase,
    getPhase,
    updatePhaseStatus,
    listPhases,
} from './phase-manager.js';

// Git + Security
export {
    execGit,
    ensureGitRepo,
    stageAllChanges,
    listStagedFiles,
    hasStagedChanges,
    commitStagedChanges,
} from './git.js';

export {
    scanFilesForSecrets,
    loadSecretScanConfig,
    shouldBlockOnFindings,
    formatSecretScanReport,
    type SecretFinding,
    type SecretKind,
    type SecretSeverity,
    type SecretScanConfig,
} from './security/secret-scan.js';

// YAML Repair
export {
    yamlEscapeString,
    repairYamlContent,
    safeWriteFile,
    safeReadYaml,
    repairPlanFile,
    repairAllPlans,
    validatePlanStructure,
} from './yaml-repair.js';

export type { RepairResult, MissingInfo } from './yaml-repair.js';

// Verification System (Playwright, Visual, API)
export {
    // Playwright E2E Testing
    checkPlaywrightSetup,
    initPlaywright,
    runPlaywrightTests,
    runPlaywrightTestFile,
    runVisualRegressionTests,
    capturePageScreenshot,
    getTestScreenshots,
    analyzePlaywrightError,
    generatePlaywrightConfig,
    generateExampleTest,

    // Types
    type PlaywrightConfig,
    type PlaywrightTestResult,
    type PlaywrightFailure,
    type PlaywrightSetupStatus,
    type PlaywrightErrorAnalysis,
} from './verification/index.js';
