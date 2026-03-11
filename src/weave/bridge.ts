/**
 * Weave-Squad Bridge
 * 
 * Converts between Weave types (WeaveTask, WeavePhase) and Squad types (TaskState)
 * to enable parallel execution of Weave phase tasks through the Squad system.
 * 
 * This is the missing link between the two systems:
 * - Weave: Project-level milestone tracking (YAML plans)
 * - Squad: Multi-agent parallel execution (JSON sessions)
 */

import type { WeaveTask, WeavePhase, PhaseExecutionPlan, TaskExecutionPlan, AgentTier } from './types.js';
import type { TaskState, Priority } from '../shared-context/types.js';
import { buildDAG, type DAGAnalysis, type ExecutionWave } from '../shared-context/dag.js';

// ============================================================================
// WeaveTask -> TaskState Conversion
// ============================================================================

/**
 * Convert a WeaveTask to a TaskState for use in the Squad system.
 * Maps Weave concepts to Squad concepts:
 * - WeaveTask.id -> TaskState.taskId
 * - WeaveTask.status -> TaskState.status (with mapping)
 * - Complexity -> TaskState.priority
 */
export function weaveTaskToSquadTask(
    task: WeaveTask,
    options: {
        assignee: string;
        priority?: Priority;
        dependencies?: string[];
    }
): TaskState {
    return {
        taskId: task.id,
        assignee: options.assignee,
        status: mapWeaveStatusToSquad(task.status),
        priority: options.priority || 'medium',
        description: task.name,
        dependencies: options.dependencies || [],
        createdAt: new Date().toISOString(),
    };
}

/**
 * Map Weave task status to Squad task status.
 */
function mapWeaveStatusToSquad(weaveStatus: WeaveTask['status']): TaskState['status'] {
    switch (weaveStatus) {
        case 'pending': return 'pending';
        case 'in_progress': return 'active';
        case 'passed': return 'completed';
        case 'failed': return 'failed';
    }
}

/**
 * Map TaskComplexity to Squad Priority.
 */
export function complexityToPriority(complexity: 'simple' | 'standard' | 'complex'): Priority {
    switch (complexity) {
        case 'simple': return 'low';
        case 'standard': return 'medium';
        case 'complex': return 'high';
    }
}

// ============================================================================
// Phase -> Squad Task List Conversion
// ============================================================================

/**
 * Convert a PhaseExecutionPlan into a list of TaskStates for the Squad system.
 * Each TaskExecutionPlan determines the assignee (agent tier) and priority.
 */
export function executionPlanToSquadTasks(plan: PhaseExecutionPlan): TaskState[] {
    return plan.taskPlans.map(tp => weaveTaskToSquadTask(tp.task, {
        assignee: tp.agentTier,
        priority: complexityToPriority(tp.complexity),
        dependencies: tp.task.dependsOn || [],
    }));
}

// ============================================================================
// Parallel Execution Analysis
// ============================================================================

/**
 * Analyze a PhaseExecutionPlan for parallel execution opportunities.
 * 
 * Uses task-level dependencies when available (`task.dependsOn`).
 * If there are no explicit dependencies, tasks are treated as fully parallel.
 * 
 * Returns DAG analysis with wave grouping for parallel execution.
 */
export function analyzeParallelOpportunities(plan: PhaseExecutionPlan): ParallelAnalysis {
    const squadTasks = executionPlanToSquadTasks(plan);

    // If no dependencies, all tasks are in wave 0 (fully parallel)
    const allIndependent = squadTasks.every(t => !t.dependencies || t.dependencies.length === 0);

    let dagAnalysis: DAGAnalysis;

    if (allIndependent && squadTasks.length > 1) {
        // All tasks are independent — one big parallel wave
        dagAnalysis = {
            nodes: new Map(),
            waves: [{ waveIndex: 0, taskIds: squadTasks.map(t => t.taskId) }],
            criticalPath: [squadTasks[0].taskId],
            hasCycle: false,
            parallelismFactor: squadTasks.length,
        };
    } else {
        // Use DAG analysis for dependency-aware wave grouping
        dagAnalysis = buildDAG(squadTasks);
    }

    // Map waves back to execution plans
    const waveDetails: WaveDetail[] = dagAnalysis.waves.map(wave => ({
        waveIndex: wave.waveIndex,
        tasks: wave.taskIds.map(taskId => {
            const tp = plan.taskPlans.find(p => p.task.id === taskId);
            return tp!;
        }).filter(Boolean),
    }));

    return {
        totalTasks: plan.taskPlans.length,
        totalWaves: dagAnalysis.waves.length,
        parallelismFactor: dagAnalysis.parallelismFactor,
        isFullyParallel: allIndependent,
        waves: waveDetails,
        criticalPath: dagAnalysis.criticalPath,
    };
}

// ============================================================================
// Types
// ============================================================================

export interface WaveDetail {
    waveIndex: number;
    tasks: TaskExecutionPlan[];
}

export interface ParallelAnalysis {
    totalTasks: number;
    totalWaves: number;
    parallelismFactor: number;
    isFullyParallel: boolean;
    waves: WaveDetail[];
    criticalPath: string[];
}

/**
 * Format parallel analysis as markdown for the Mask Weaver.
 */
export function formatParallelAnalysis(analysis: ParallelAnalysis): string {
    const lines: string[] = [];

    lines.push('### Parallel Execution Analysis');
    lines.push('');
    lines.push(`- Total tasks: ${analysis.totalTasks}`);
    lines.push(`- Execution waves: ${analysis.totalWaves}`);
    lines.push(`- Parallelism factor: ${analysis.parallelismFactor.toFixed(1)}x`);
    lines.push(`- Fully parallel: ${analysis.isFullyParallel ? 'yes' : 'no'}`);
    lines.push('');

    for (const wave of analysis.waves) {
        lines.push(`**Wave ${wave.waveIndex}** (${wave.tasks.length} tasks in parallel):`);
        for (const tp of wave.tasks) {
            const tierLabel = tp.agentTier === 'dummy-flash' ? 'flash'
                : tp.agentTier === 'dummy-human' ? 'human'
                : 'premium';
            lines.push(`  - [${tierLabel}] ${tp.task.name} (${tp.mask || 'auto'})`);
        }
        lines.push('');
    }

    if (analysis.criticalPath.length > 1) {
        lines.push(`Critical path: ${analysis.criticalPath.join(' -> ')}`);
    }

    return lines.join('\n');
}
