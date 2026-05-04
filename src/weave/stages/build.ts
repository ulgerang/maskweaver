import * as fs from 'node:fs';
import * as path from 'node:path';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { stringify as stringifyYaml } from 'yaml';

import type { WeavePlan, WeavePhase, WeaveTask, WeaveEvent, BuildOptions, BuildResult, BuildLoopState, BuildTaskState, AgentTier } from '../types.js';
import { getPhaseManager } from '../phase-manager.js';
import { WeaveOrchestrator } from '../orchestrator.js';
import { getBuildStateDir, getBuildStatePath, toOpenspecChangePath } from '../change-artifacts.js';
import { readMapResult, lightReMap } from './map.js';
import { updateOpenSpecTasks } from './openspec.js';
import { getEffectiveGdcConfig, runGdcMachineCommand, countGdcCheckIssues } from '../gdc.js';
// gherkin helpers used via formatExecutionPlan in execute.ts

export function generateBuildId(): string {
    const now = new Date();
    const dateStr = now.toISOString().slice(0, 10).replace(/-/g, '');
    const rand = Math.random().toString(36).slice(2, 6);
    return `build-${dateStr}-${rand}`;
}

export function generateBuildState(buildId: string, planName: string, maxRetries: number): BuildLoopState {
    return {
        buildId,
        planName,
        status: 'running',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        maxRetries,
        globalRetryCount: 0,
        noProgressCount: 0,
        tasks: [],
    };
}

async function saveBuildState(basePath: string, state: BuildLoopState): Promise<void> {
    const dir = getBuildStateDir(basePath);
    await mkdir(dir, { recursive: true });

    const content = stringifyYaml({
        build_id: state.buildId,
        plan_name: state.planName,
        status: state.status,
        created_at: state.createdAt,
        updated_at: new Date().toISOString(),
        started_at: state.startedAt,
        completed_at: state.completedAt,
        current_phase_id: state.currentPhaseId,
        current_task_id: state.currentTaskId,
        max_retries: state.maxRetries,
        global_retry_count: state.globalRetryCount,
        no_progress_count: state.noProgressCount,
        tasks: state.tasks.map(t => ({
            task_id: t.taskId,
            phase_id: t.phaseId,
            status: t.status,
            retry_count: t.retryCount,
            max_retries: t.maxRetries,
            last_error: t.lastError,
            last_failure_fingerprint: t.lastFailureFingerprint,
            started_at: t.startedAt,
            completed_at: t.completedAt,
            mask_used: t.maskUsed,
            agent_tier: t.agentTier,
            commit_hash: t.commitHash,
        })),
        escalation_reason: state.escalationReason,
        summary: state.summary,
    });

    await writeFile(getBuildStatePath(basePath, state.buildId), content, 'utf-8');
}

export async function loadBuildState(basePath: string, buildId: string): Promise<BuildLoopState | null> {
    const filePath = getBuildStatePath(basePath, buildId);
    if (!fs.existsSync(filePath)) return null;

    try {
        const { parse } = await import('yaml');
        const raw = await readFile(filePath, 'utf-8');
        const parsed = parse(raw);
        if (!parsed) return null;

        return {
            buildId: parsed.build_id || buildId,
            planName: parsed.plan_name || '',
            status: parsed.status || 'running',
            createdAt: parsed.created_at || '',
            updatedAt: parsed.updated_at || '',
            startedAt: parsed.started_at,
            completedAt: parsed.completed_at,
            currentPhaseId: parsed.current_phase_id,
            currentTaskId: parsed.current_task_id,
            maxRetries: parsed.max_retries || 3,
            globalRetryCount: parsed.global_retry_count || 0,
            noProgressCount: parsed.no_progress_count || 0,
            tasks: (parsed.tasks || []).map((t: any) => ({
                taskId: t.task_id,
                phaseId: t.phase_id,
                status: t.status || 'pending',
                retryCount: t.retry_count || 0,
                maxRetries: t.max_retries || 3,
                lastError: t.last_error,
                lastFailureFingerprint: t.last_failure_fingerprint,
                startedAt: t.started_at,
                completedAt: t.completed_at,
                maskUsed: t.mask_used,
                agentTier: t.agent_tier,
                commitHash: t.commit_hash,
            })),
            escalationReason: parsed.escalation_reason,
            summary: parsed.summary,
        };
    } catch {
        return null;
    }
}

function pickNextTask(plan: WeavePlan, state: BuildLoopState, phaseFilter?: string[]): { phase: WeavePhase; task: WeaveTask } | null {
    for (const phase of plan.phases) {
        if (phase.status === 'completed' || phase.status === 'blocked') continue;
        if (phaseFilter && phaseFilter.length > 0 && !phaseFilter.includes(phase.id)) continue;

        const phaseDepsMet = !phase.dependsOn || phase.dependsOn.every(depId => {
            const depPhase = plan.phases.find(p => p.id === depId);
            return depPhase?.status === 'completed';
        });
        if (!phaseDepsMet) continue;

        for (const task of phase.tasks) {
            if (task.status === 'passed') continue;

            const taskState = state.tasks.find(t => t.taskId === task.id && t.phaseId === phase.id);
            if (taskState && taskState.status === 'passed') continue;
            if (taskState && taskState.status === 'escalated') continue;

            const taskDepsMet = !task.dependsOn || task.dependsOn.every(depId => {
                const depTask = phase.tasks.find(t => t.id === depId);
                return depTask?.status === 'passed';
            });
            if (!taskDepsMet) continue;

            return { phase, task };
        }
    }

    return null;
}

function isPlanContractViolated(task: WeaveTask, plan: WeavePlan): boolean {
    if (!plan.structuralChanges || plan.structuralChanges.length === 0) return false;
    const agreedChanges = plan.structuralChanges.filter(sc => sc.agreed);
    if (agreedChanges.length === 0) return false;

    if (!task.files || task.files.length === 0) return false;

    // Violation: task touches files NOT covered by any agreed structural change
    const agreedFiles = new Set<string>();
    for (const sc of agreedChanges) {
        for (const file of sc.affectedFiles) agreedFiles.add(file);
    }

    for (const taskFile of task.files) {
        const isCovered = Array.from(agreedFiles).some(af =>
            taskFile.includes(af) || af.includes(taskFile)
        );
        if (!isCovered) return true;
    }

    return false;
}

async function executeTask(
    task: WeaveTask,
    phase: WeavePhase,
    plan: WeavePlan,
    orchestrator: WeaveOrchestrator,
    basePath: string,
    onEvent?: (event: WeaveEvent) => void,
): Promise<{ success: boolean; error?: string; commitHash?: string; instructions?: string }> {
    const mask = orchestrator.selectMaskForTask(task);
    const taskType = orchestrator.detectTaskType(task.name);
    const agentTier = selectAgentTier(task, taskType);

    const instructions = generateBrief(task, phase, plan, agentTier, mask);
    return { success: true, instructions };
}

function selectAgentTier(task: WeaveTask, _taskType: string): AgentTier {
    const checkDesc = (task.testCase || task.name).toLowerCase();
    const isComplex = /refactor|migration|auth|performance|architect|security|complex|리팩토링|마이그레이션|인증|성능|보안|복잡/i.test(checkDesc);
    const isStandard = /component|api|endpoint|test|database|hook|context|컴포넌트|api|엔드포인트|테스트|데이터베이스|훅|컨텍스트/i.test(checkDesc);
    if (isComplex) return 'dummy-premium';
    if (isStandard) return 'dummy-human';
    return 'dummy-flash';
}

function generateBrief(
    task: WeaveTask,
    phase: WeavePhase,
    plan: WeavePlan,
    agentTier: AgentTier,
    mask: string | null,
): string {
    const lines: string[] = [];
    lines.push(`---`);
    lines.push(`## Task Brief: ${task.name} (${task.id})`);
    lines.push(``);
    lines.push(`- **Phase**: ${phase.id} - ${phase.name}`);
    lines.push(`- **Agent**: ${agentTier}`);
    lines.push(`- **Mask**: ${mask || 'default'}`);
    lines.push(`- **Plan**: ${plan.planName || plan.projectName}`);
    lines.push(``);
    lines.push(`### Goal`);
    lines.push(task.testCase || phase.doneWhen || 'Complete the implementation');
    lines.push(``);
    if (task.files && task.files.length > 0) {
        lines.push(`### Target Files`);
        for (const f of task.files) lines.push(`- ${f}`);
        lines.push(``);
    }
    if (task.nodeIds && task.nodeIds.length > 0) {
        lines.push(`### GDC Nodes`);
        for (const n of task.nodeIds) lines.push(`- ${n}`);
        lines.push(``);
    }
    if (task.verify && task.verify.length > 0) {
        lines.push(`### Verification`);
        for (const v of task.verify) lines.push(`- [${v.kind}] ${v.value}`);
        lines.push(``);
    }
    if (task.acceptanceCriteria && task.acceptanceCriteria.length > 0) {
        lines.push(`### Acceptance Criteria (Gherkin)`);
        lines.push(``);
        lines.push(`Every scenario MUST pass before this task can be marked as completed.`);
        lines.push(``);
        for (const scenario of task.acceptanceCriteria) {
            lines.push(`**Scenario: ${scenario.scenario}**`);
            for (const g of scenario.given) lines.push(`  Given ${g}`);
            for (const w of scenario.when) lines.push(`  When ${w}`);
            for (const t of scenario.then) lines.push(`  Then ${t}`);
            lines.push(``);
        }
    }
    if (plan.structuralChanges && plan.structuralChanges.length > 0) {
        const agreed = plan.structuralChanges.filter(sc => sc.agreed);
        if (agreed.length > 0) {
            lines.push(`### ⚠️ Agreed Structural Changes`);
            for (const sc of agreed) {
                lines.push(`- **${sc.area}**: ${sc.proposedChange}`);
            }
            lines.push(``);
        }
    }
    lines.push(`### Plan Context`);
    lines.push(`${plan.vision}`);
    lines.push(``);
    lines.push(`After implementation, run verification: \`weave command=build-resume buildId="<CURRENT_BUILD>"\``);
    lines.push(`---`);
    return lines.join('\n');
}

// Remove dead code: generateTaskBrief was duplicated inline above

async function runVerification(basePath: string, task: WeaveTask): Promise<{ passed: boolean; details: string }> {
    const checks: string[] = [];
    let allPassed = true;

    // 1. TypeScript / build check
    try {
        const tsConfigPath = path.join(basePath, 'tsconfig.json');
        if (fs.existsSync(tsConfigPath)) {
            const { execFile } = await import('node:child_process');
            const { promisify } = await import('node:util');
            const execAsync = promisify(execFile);

            try {
                await execAsync('npx', ['tsc', '--noEmit'], { cwd: basePath, timeout: 60_000, windowsHide: true });
                checks.push('✅ TypeScript type check passed');
            } catch (e: any) {
                checks.push(`❌ TypeScript type check failed: ${(e.stderr || e.message || '').slice(0, 200)}`);
                allPassed = false;
            }
        } else {
            checks.push('⏭️ TypeScript check skipped (no tsconfig.json)');
        }
    } catch {
        checks.push('⏭️ TypeScript check failed to run');
    }

    // 2. GDC sync
    const gdc = getEffectiveGdcConfig(basePath);
    if (gdc.enabled) {
        try {
            const syncResult = await runGdcMachineCommand({ basePath, command: 'sync', timeoutMs: 30_000, config: gdc });
            if (syncResult.exitCode === 0) {
                checks.push('✅ GDC sync passed');
            } else {
                checks.push('❌ GDC sync failed');
                allPassed = false;
            }
        } catch {
            checks.push('⏭️ GDC sync error');
        }
    }

    // 3. Task-specific verification
    if (task.verify) {
        for (const v of task.verify) {
            if (v.kind === 'checklist') {
                checks.push(`⏭️ Manual check: ${v.value}`);
            }
        }
    }

    return {
        passed: allPassed,
        details: checks.join('\n'),
    };
}

async function autoDiagnose(error: string): Promise<string> {
    const lower = error.toLowerCase();
    if (lower.includes('type') && (lower.includes('not assignable') || lower.includes('type mismatch'))) {
        return 'Type error detected. Check type definitions and ensure type consistency across changed files.';
    }
    if (lower.includes('cannot find module') || lower.includes('module not found')) {
        return 'Missing module import. Verify the import path and ensure the module is installed.';
    }
    if (lower.includes('gdc') && lower.includes('not found')) {
        return 'GDC binary not available. Run `gdc init` or check .gdc configuration.';
    }
    if (lower.includes('build') || lower.includes('compile')) {
        return 'Build error. Check for syntax errors, missing exports, or incorrect configuration.';
    }
    return `Task failed. Diagnose the root cause and fix accordingly. Error: ${error.slice(0, 300)}`;
}

function generateSummary(state: BuildLoopState, plan: WeavePlan): string {
    const lines: string[] = [];
    const totalTasks = plan.phases.reduce((sum, p) => sum + p.tasks.length, 0);
    const completedTasks = state.tasks.filter(t => t.status === 'passed').length;
    const failedTasks = state.tasks.filter(t => t.status === 'failed').length;
    const escalatedTasks = state.tasks.filter(t => t.status === 'escalated').length;

    lines.push(`## Build Summary: ${state.buildId}`);
    lines.push(``);
    lines.push(`- Status: ${state.status}`);
    lines.push(`- Phases: ${plan.phases.filter(p => p.status === 'completed').length}/${plan.phases.length}`);
    lines.push(`- Tasks: ${completedTasks}/${totalTasks} completed, ${failedTasks} failed, ${escalatedTasks} escalated`);
    lines.push(`- Retries: ${state.globalRetryCount}`);
    const durationEnd = state.completedAt ? new Date(state.completedAt).getTime() : Date.now();
    const durationSec = state.startedAt ? Math.round((durationEnd - new Date(state.startedAt).getTime()) / 1000) : 0;
    lines.push(`- Duration: ${durationSec}s`);
    lines.push(``);

    if (state.escalationReason) {
        lines.push(`### ⚠️ Escalated`);
        lines.push(state.escalationReason);
        lines.push(``);
    }

    if (failedTasks > 0 || escalatedTasks > 0) {
        lines.push(`### Failed / Escalated Tasks`);
        lines.push(``);
        for (const t of state.tasks) {
            if (t.status === 'failed' || t.status === 'escalated') {
                lines.push(`- **${t.taskId}** (${t.status}): ${t.lastError || 'Unknown'}`);
            }
        }
        lines.push(``);
    }

    if (state.status === 'completed') {
        lines.push(`✅ Build completed successfully.`);
    } else if (state.status === 'blocked') {
        lines.push(`🔄 Build blocked. Review escalated tasks and run \`/weave build --resume ${state.buildId}\`.`);
    } else if (state.status === 'failed') {
        lines.push(`❌ Build failed. Review errors and rerun.`);
    }

    return lines.join('\n');
}

export async function executeBuildLoop(options: BuildOptions & {
    plan: WeavePlan;
    state: BuildLoopState;
    orchestrator: WeaveOrchestrator;
    basePath: string;
    onEvent?: (event: WeaveEvent) => void;
    onMessage?: (msg: string) => void;
}): Promise<BuildResult> {
    const { plan, state, orchestrator, basePath, onEvent } = options;
    const onMsg = options.onMessage || (() => {});
    const startTime = Date.now();
    const phaseFilter = options.phaseIds || undefined;

    state.startedAt = state.startedAt || new Date().toISOString();

    let iterationsWithoutProgress = 0;
    const maxIterationsWithoutProgress = options.maxRetries || 3;
    const instructions: string[] = [];

    while (state.status === 'running') {
        const next = pickNextTask(plan, state, phaseFilter);

        if (!next) {
            // Check if all tasks completed
            const allPassed = plan.phases.every(p =>
                p.tasks.every(t => {
                    const ts = state.tasks.find(s => s.taskId === t.id && s.phaseId === p.id);
                    return ts?.status === 'passed' || t.status === 'passed';
                })
            );

            if (allPassed) {
                state.status = 'completed';
                onMsg('✅ All tasks completed');
            } else {
                state.status = 'blocked';
                state.escalationReason = 'No runnable task found — check dependencies';
                onMsg('⛔ No runnable task found');
            }
            break;
        }

        const { phase, task } = next;
        state.currentPhaseId = phase.id;
        state.currentTaskId = task.id;

        // Check plan contract violation
        if (isPlanContractViolated(task, plan)) {
            state.status = 'blocked';
            state.escalationReason = `Task ${task.id} violates agreed plan contract (structural changes)`;
            onEvent?.({ type: 'build_task_escalated', phaseId: phase.id, taskId: task.id, reason: state.escalationReason });
            onMsg(`⛔ Escalated: ${state.escalationReason}`);
            break;
        }

        const taskMask = orchestrator.selectMaskForTask(task);
        const taskType = orchestrator.detectTaskType(task.name);
        const taskAgentTier = selectAgentTier(task, taskType);
        const existingState = state.tasks.find(t => t.taskId === task.id && t.phaseId === phase.id);

        if (!existingState) {
            state.tasks.push({
                taskId: task.id,
                phaseId: phase.id,
                status: 'in_progress',
                retryCount: 0,
                maxRetries: taskAgentTier === 'dummy-premium' ? maxIterationsWithoutProgress + 1 : maxIterationsWithoutProgress,
                startedAt: new Date().toISOString(),
                maskUsed: taskMask || undefined,
                agentTier: taskAgentTier,
            });
        }

        onEvent?.({ type: 'task_started', phaseId: phase.id, taskId: task.id });
        onMsg(`▶️ Running ${task.id} (${taskAgentTier})`);

        // Execute task — generate brief for AI agent
        const taskStatus = state.tasks.find(t => t.taskId === task.id && t.phaseId === phase.id);
        const taskResult = await executeTask(task, phase, plan, orchestrator, basePath, onEvent);

        if (taskStatus && taskResult.instructions) {
            taskStatus.lastError = taskResult.instructions;
        }

        if (taskResult.instructions) {
            instructions.push(taskResult.instructions);
        }

        if (taskResult.success) {
            // Verify
            const verification = await runVerification(basePath, task);

            if (verification.passed) {
                // Mark task as passed
                task.status = 'passed';
                const ts = state.tasks.find(t => t.taskId === task.id && t.phaseId === phase.id);
                if (ts) {
                    ts.status = 'passed';
                    ts.completedAt = new Date().toISOString();
                    ts.commitHash = taskResult.commitHash;
                }

                // Update OpenSpec tasks
                try {
                    if (plan.openspecDir) {
                        const changeId = plan.planName || 'main';
                        await updateOpenSpecTasks(basePath, changeId, phase.id, task.id, true);
                    }
                } catch { }

                // GDC sync per task
                try {
                    // Verification already ran GDC sync (no need to repeat)
                    await lightReMap(basePath);
                } catch { }

                phase.status = phase.tasks.every(t => t.status === 'passed') ? 'completed' : 'in_progress';

                onEvent?.({ type: 'task_passed', phaseId: phase.id, taskId: task.id });
                onMsg(`✅ ${task.id} passed`);
                iterationsWithoutProgress = 0;
            } else {
                handleTaskFailure(task, phase, state, verification.details, iterationsWithoutProgress);
                iterationsWithoutProgress++;
                const ts2 = state.tasks.find(t => t.taskId === task.id && t.phaseId === phase.id);
                onMsg(`❌ ${task.id} failed (attempt ${ts2?.retryCount || 1}/${ts2?.maxRetries || maxIterationsWithoutProgress})`);
            }
        } else {
            handleTaskFailure(task, phase, state, taskResult.error || 'Execution failed', iterationsWithoutProgress);
            iterationsWithoutProgress++;
            onMsg(`❌ ${task.id} failed: ${(taskResult.error || '').slice(0, 100)}`);
        }

        // Check no-progress limit
        if (iterationsWithoutProgress >= maxIterationsWithoutProgress) {
            state.status = 'blocked';
            state.escalationReason = `No progress after ${iterationsWithoutProgress} consecutive task failures. Last: ${state.tasks.filter(t => t.status === 'failed').pop()?.taskId || 'unknown'}`;
            onMsg(`⛔ Blocked: ${state.escalationReason}`);
            break;
        }

        // Save state after each task
        state.updatedAt = new Date().toISOString();
        await saveBuildState(basePath, state);
    }

    state.completedAt = new Date().toISOString();
    state.summary = generateSummary(state, plan);
    await saveBuildState(basePath, state);

    return {
        success: state.status === 'completed',
        buildId: state.buildId,
        planName: plan.planName || plan.projectName,
        phasesCompleted: plan.phases.filter(p => p.status === 'completed').length,
        phasesTotal: plan.phases.length,
        tasksCompleted: state.tasks.filter(t => t.status === 'passed').length,
        tasksFailed: state.tasks.filter(t => t.status === 'failed').length,
        tasksEscalated: state.tasks.filter(t => t.status === 'escalated').length,
        verificationPassed: state.status === 'completed',
        durationMs: Date.now() - startTime,
        completedAt: new Date().toISOString(),
        summary: state.summary || '',
    };
}

function handleTaskFailure(
    task: WeaveTask,
    phase: WeavePhase,
    state: BuildLoopState,
    errorDetails: string,
    iterationCount: number
): void {
    task.status = 'failed';
    task.retryCount++;
    task.lastError = errorDetails.slice(0, 500);
    const ts = state.tasks.find(t => t.taskId === task.id && t.phaseId === phase.id);
    if (ts) {
        ts.status = ts.retryCount >= ts.maxRetries ? 'escalated' : 'failed';
        ts.retryCount++;
        ts.lastError = errorDetails.slice(0, 500);
        if (ts.status === 'escalated') {
            state.status = 'blocked';
            state.escalationReason = `Task ${task.id} exceeded max retries (${ts.maxRetries}). Last error: ${errorDetails.slice(0, 200)}`;
        }
    }
    state.globalRetryCount++;
    state.noProgressCount = iterationCount;
}


