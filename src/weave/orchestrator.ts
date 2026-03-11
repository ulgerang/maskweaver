/**
 * Weave Orchestrator
 * 
 * Automatically selects expert masks based on task context.
 * This is the "brain" that decides which persona to wear for each task.
 */

import type { WeaveTask, WeaveConfig, AgentTier, TaskComplexity, TaskExecutionPlan, PhaseExecutionPlan } from './types.js';
import type { WeavePhase } from './types.js';
import { searchTroubleshooting } from './knowledge/global.js';
import { getModelRegistry } from '../shared/model-registry.js';
import type { ModelCapability, ModelTier } from '../shared/config.js';

// ============================================================================
// Task Type Detection
// ============================================================================

export type TaskType =
    | 'architecture'
    | 'testing'
    | 'frontend'
    | 'backend'
    | 'performance'
    | 'database'
    | 'ml'
    | 'devops'
    | 'general';

const TASK_PATTERNS: Record<TaskType, RegExp[]> = {
    architecture: [
        /architect/i, /design pattern/i, /refactor/i, /structure/i,
        /module/i, /decouple/i, /dependency/i, /interface/i,
        /abstraction/i, /layer/i, /separation/i
    ],
    testing: [
        /test/i, /tdd/i, /spec/i, /assert/i, /mock/i,
        /stub/i, /coverage/i, /unit/i, /integration/i, /e2e/i
    ],
    frontend: [
        /react/i, /vue/i, /angular/i, /component/i, /ui/i,
        /css/i, /tailwind/i, /style/i, /layout/i, /responsive/i,
        /animation/i, /jsx/i, /tsx/i, /hook/i, /state/i
    ],
    backend: [
        /api/i, /endpoint/i, /rest/i, /graphql/i, /server/i,
        /controller/i, /service/i, /middleware/i, /route/i,
        /authentication/i, /authorization/i
    ],
    performance: [
        /performance/i, /optimize/i, /memory/i, /cpu/i, /cache/i,
        /latency/i, /throughput/i, /profile/i, /benchmark/i,
        /race condition/i, /concurrency/i, /thread/i
    ],
    database: [
        /database/i, /sql/i, /query/i, /migration/i, /schema/i,
        /orm/i, /prisma/i, /postgres/i, /mysql/i, /mongo/i,
        /redis/i, /index/i
    ],
    ml: [
        /machine learning/i, /ml/i, /ai/i, /model/i, /training/i,
        /inference/i, /tensor/i, /neural/i, /embedding/i,
        /transformer/i, /pytorch/i, /tensorflow/i
    ],
    devops: [
        /deploy/i, /docker/i, /kubernetes/i, /ci\/cd/i, /pipeline/i,
        /container/i, /helm/i, /terraform/i, /aws/i, /gcp/i, /azure/i
    ],
    general: []
};

// Default mask recommendations per task type
const DEFAULT_MASKS: Record<TaskType, string> = {
    architecture: 'martin-fowler',
    testing: 'kent-beck',
    frontend: 'dan-abramov',
    backend: 'martin-fowler',
    performance: 'linus-torvalds',
    database: 'martin-fowler',
    ml: 'andrew-ng',
    devops: 'linus-torvalds',
    general: 'kent-beck'  // Good all-rounder with TDD focus
};

// ============================================================================
// Orchestrator Class
// ============================================================================

export class WeaveOrchestrator {
    private config: WeaveConfig;

    constructor(config: Partial<WeaveConfig> = {}) {
        this.config = {
            maxRetries: config.maxRetries ?? 5,
            autoSelectMasks: config.autoSelectMasks ?? true,
            globalKnowledge: config.globalKnowledge ?? true,
            verifyEscalation: config.verifyEscalation ?? true,
            maskPreferences: config.maskPreferences ?? {},
        };
    }

    /**
     * Detect the type of task from its description.
     */
    detectTaskType(taskDescription: string): TaskType {
        // Check each pattern set
        for (const [type, patterns] of Object.entries(TASK_PATTERNS)) {
            if (type === 'general') continue;

            for (const pattern of patterns) {
                if (pattern.test(taskDescription)) {
                    return type as TaskType;
                }
            }
        }

        return 'general';
    }

    /**
     * Select the best mask for a task.
     * Considers: task type, user preferences, and context.
     */
    selectMaskForTask(task: WeaveTask): string | null {
        if (!this.config.autoSelectMasks) {
            return null;
        }

        const taskType = this.detectTaskType(task.name);

        // Check user preferences first
        if (this.config.maskPreferences) {
            const preferred = this.config.maskPreferences[taskType as keyof typeof this.config.maskPreferences];
            if (preferred) {
                return preferred;
            }
        }

        // Fall back to defaults
        return DEFAULT_MASKS[taskType] || null;
    }

    /**
     * Select mask for error analysis/debugging.
     * Performance/system errors → Linus, Architecture errors → Martin, etc.
     */
    selectMaskForError(errorMessage: string): string {
        const lower = errorMessage.toLowerCase();

        // Performance/memory issues → Linus
        if (/memory|leak|performance|slow|timeout|race|concurrent/.test(lower)) {
            return 'linus-torvalds';
        }

        // Type/structure issues → Martin (architecture perspective)
        if (/type|interface|abstract|pattern|coupling|dependency/.test(lower)) {
            return 'martin-fowler';
        }

        // Test failures → Kent
        if (/test|assert|expect|mock|spec|coverage/.test(lower)) {
            return 'kent-beck';
        }

        // React/frontend issues → Dan
        if (/react|component|hook|state|render|jsx|tsx/.test(lower)) {
            return 'dan-abramov';
        }

        // Default to Kent for methodical debugging
        return 'kent-beck';
    }

    /**
     * Suggest mask rotation for stuck situations.
     * If current mask isn't solving the problem, try a different perspective.
     */
    suggestAlternativeMask(currentMask: string, taskType: TaskType): string {
        const alternatives: Record<string, string[]> = {
            'kent-beck': ['martin-fowler', 'linus-torvalds'],
            'martin-fowler': ['kent-beck', 'linus-torvalds'],
            'linus-torvalds': ['kent-beck', 'martin-fowler'],
            'dan-abramov': ['kent-beck', 'martin-fowler'],
            'andrew-ng': ['kent-beck', 'martin-fowler'],
        };

        const options = alternatives[currentMask] || ['kent-beck'];
        return options[0];
    }

    /**
     * Get configuration.
     */
    getConfig(): WeaveConfig {
        return { ...this.config };
    }

    // ========================================================================
    // Task Complexity Assessment
    // ========================================================================

    /**
     * Complexity signal patterns.
     * Each pattern adds to a complexity score when matched.
     */
    private static readonly COMPLEXITY_SIGNALS: { pattern: RegExp; weight: number }[] = [
        // High complexity signals (+2)
        { pattern: /architect/i, weight: 2 },
        { pattern: /refactor/i, weight: 2 },
        { pattern: /design pattern/i, weight: 2 },
        { pattern: /migration/i, weight: 2 },
        { pattern: /state management/i, weight: 2 },
        { pattern: /authentication|authorization|auth/i, weight: 2 },
        { pattern: /performance|optimi[sz]/i, weight: 2 },
        { pattern: /concurrency|parallel|async/i, weight: 2 },
        { pattern: /debug|troubleshoot|diagnos/i, weight: 2 },
        { pattern: /security|encrypt|vulnerab/i, weight: 2 },
        { pattern: /algorithm|data structure/i, weight: 2 },

        // Medium complexity signals (+1)
        { pattern: /component/i, weight: 1 },
        { pattern: /api|endpoint|route/i, weight: 1 },
        { pattern: /test|spec/i, weight: 1 },
        { pattern: /database|query|schema/i, weight: 1 },
        { pattern: /hook|context|provider/i, weight: 1 },
        { pattern: /middleware/i, weight: 1 },
        { pattern: /validation/i, weight: 1 },
        { pattern: /integrate/i, weight: 1 },
    ];

    /**
     * Simple task patterns — if matched, override to simple.
     */
    private static readonly SIMPLE_PATTERNS: RegExp[] = [
        /rename|renames/i,
        /import|imports/i,
        /format|formatting|prettier/i,
        /typo|spelling/i,
        /config|configuration file/i,
        /comment|documentation/i,
        /remove unused/i,
        /update version/i,
        /add export/i,
        /fix lint/i,
    ];

    /**
     * Assess complexity of a task based on its name/description.
     * Returns: simple (score 0), standard (score 1-2), complex (score 3+)
     */
    assessComplexity(taskDescription: string): TaskComplexity {
        // Check for explicit simple patterns first
        for (const pattern of WeaveOrchestrator.SIMPLE_PATTERNS) {
            if (pattern.test(taskDescription)) {
                return 'simple';
            }
        }

        let score = 0;
        for (const { pattern, weight } of WeaveOrchestrator.COMPLEXITY_SIGNALS) {
            if (pattern.test(taskDescription)) {
                score += weight;
            }
        }

        if (score >= 3) return 'complex';
        if (score >= 1) return 'standard';
        return 'simple';
    }

    /**
     * Select the appropriate agent tier based on task complexity.
     *
     * Strategy:
     * - simple   -> dummy-flash   (fast, cheap: file renames, formatting, config)
     * - standard -> dummy-human   (balanced: component implementation, API endpoints)
     * - complex  -> dummy-premium (powerful: architecture, debugging, multi-step reasoning)
     */
    selectAgentTier(complexity: TaskComplexity): AgentTier {
        switch (complexity) {
            case 'simple':
                return 'dummy-flash';
            case 'standard':
                return 'dummy-human';
            case 'complex':
                return 'dummy-premium';
        }
    }

    // ========================================================================
    // Model Pool Integration
    // ========================================================================

    /** Map TaskType to ModelCapability tags for pool-based selection */
    private static readonly TASK_TYPE_CAPABILITIES: Record<TaskType, ModelCapability[]> = {
        architecture: ['architecture', 'reasoning', 'complex-coding'],
        testing:      ['testing', 'coding'],
        frontend:     ['frontend', 'coding'],
        backend:      ['backend', 'coding'],
        performance:  ['debugging', 'reasoning'],
        database:     ['database', 'backend'],
        ml:           ['ml', 'reasoning'],
        devops:       ['devops', 'file-ops'],
        general:      ['coding'],
    };

    /** Map complexity to ModelTier for pool queries */
    private static readonly COMPLEXITY_TIER_MAP: Record<TaskComplexity, ModelTier> = {
        simple:   'flash',
        standard: 'human',
        complex:  'premium',
    };

    /**
     * Select the best available agent from the model pool.
     * This considers:
     * 1. Task complexity -> preferred tier
     * 2. Task type -> required capabilities
     * 3. Model availability -> concurrency limits
     * 4. Cost awareness -> prefer cheaper when possible
     *
     * Returns the agent name to use (e.g., "dummy-gemini-flash")
     * or falls back to the legacy tier name (e.g., "dummy-flash")
     */
    selectAgentFromPool(task: WeaveTask): { agentName: string; tier: AgentTier; poolManaged: boolean } {
        const complexity = this.assessComplexity(task.name);
        const defaultTier = this.selectAgentTier(complexity);
        const taskType = this.detectTaskType(task.name);

        try {
            const registry = getModelRegistry();
            const pool = registry.getPool();

            // If no pool configured, fall back to legacy
            if (pool.length === 0) {
                return { agentName: defaultTier, tier: defaultTier, poolManaged: false };
            }

            const preferredModelTier = WeaveOrchestrator.COMPLEXITY_TIER_MAP[complexity];
            const requiredCapabilities = WeaveOrchestrator.TASK_TYPE_CAPABILITIES[taskType] || ['coding'];

            const result = registry.acquire({
                tier: preferredModelTier,
                capabilities: requiredCapabilities,
                preferCheap: complexity === 'simple',
            });

            if (result.success && result.agentName) {
                return {
                    agentName: result.agentName,
                    tier: defaultTier,
                    poolManaged: true,
                };
            }

            // Pool exhausted -- fall back to legacy tier name
            return { agentName: defaultTier, tier: defaultTier, poolManaged: false };
        } catch {
            // Registry not initialized -- fall back to legacy
            return { agentName: defaultTier, tier: defaultTier, poolManaged: false };
        }
    }

    /**
     * Release a model back to the pool after task completion.
     */
    releaseAgent(agentName: string): boolean {
        try {
            const registry = getModelRegistry();
            // Agent name format: "dummy-{modelId}"
            const modelId = agentName.replace(/^dummy-/, '');
            return registry.release(modelId);
        } catch {
            return false;
        }
    }

    /**
     * Generate execution plan for a phase.
     * Analyzes each task and determines:
     * 1. Which expert mask to use
     * 2. Which agent tier (model) to delegate to
     * 3. Any relevant troubleshooting hints from global knowledge
     */
    async generateExecutionPlan(phase: WeavePhase, options?: {
        projectType?: string;
    }): Promise<PhaseExecutionPlan> {
        const taskPlans: TaskExecutionPlan[] = [];

        for (const task of phase.tasks) {
            const mask = this.selectMaskForTask(task);
            const complexity = this.assessComplexity(task.name);
            const agentTier = this.selectAgentTier(complexity);

            // Pre-fetch troubleshooting hints for known error patterns
            let troubleshootingHints: string[] = [];
            if (this.config.globalKnowledge) {
                try {
                    const solutions = await searchTroubleshooting(
                        task.name,
                        { projectType: options?.projectType, limit: 2 }
                    );
                    troubleshootingHints = solutions
                        .filter(s => s.score > 0.5)
                        .map(s => s.entry.solution.slice(0, 200));
                } catch {
                    // Knowledge search is best-effort
                }
            }

            taskPlans.push({
                task,
                mask,
                agentTier,
                complexity,
                troubleshootingHints,
            });
        }

        // Generate human-readable summary
        const tierCounts = { flash: 0, human: 0, premium: 0 };
        for (const p of taskPlans) {
            if (p.agentTier === 'dummy-flash') tierCounts.flash++;
            else if (p.agentTier === 'dummy-human') tierCounts.human++;
            else tierCounts.premium++;
        }

        const summaryParts: string[] = [];
        summaryParts.push(`Phase ${phase.id}: ${phase.name}`);
        summaryParts.push(`Tasks: ${taskPlans.length} total`);
        if (tierCounts.flash > 0) summaryParts.push(`  flash: ${tierCounts.flash} (simple)`);
        if (tierCounts.human > 0) summaryParts.push(`  human: ${tierCounts.human} (standard)`);
        if (tierCounts.premium > 0) summaryParts.push(`  premium: ${tierCounts.premium} (complex)`);

        return {
            phaseId: phase.id,
            phaseName: phase.name,
            status: phase.status,
            taskPlans,
            summary: summaryParts.join('\n'),
        };
    }

    /**
     * Update configuration.
     */
    updateConfig(updates: Partial<WeaveConfig>): void {
        this.config = { ...this.config, ...updates };
    }
}

// ============================================================================
// Singleton Instance
// ============================================================================

let orchestratorInstance: WeaveOrchestrator | null = null;

export function getOrchestrator(config?: Partial<WeaveConfig>): WeaveOrchestrator {
    if (!orchestratorInstance) {
        orchestratorInstance = new WeaveOrchestrator(config);
    } else if (config) {
        orchestratorInstance.updateConfig(config);
    }
    return orchestratorInstance;
}
