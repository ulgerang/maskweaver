/**
 * Weave Orchestrator
 * 
 * Automatically selects expert masks based on task context.
 * This is the "brain" that decides which persona to wear for each task.
 */

import type { WeaveTask, WeaveConfig } from './types.js';

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
