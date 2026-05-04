import * as fs from 'node:fs';
import * as path from 'node:path';
import { readFile } from 'node:fs/promises';
import type { WeavePlan, WeavePhase, WeaveTask, AgentTier, BuildDecision, WavePlan, WaveTaskEntry, TaskDelegationContract, TaskResult, WaveDelta, ContextIndex, FailureKind } from './types.js';
import { WeaveOrchestrator } from './orchestrator.js';
import { getPhaseManager } from './phase-manager.js';
import * as CM from './context-manager.js';
import { getChangeArtifactDir } from './change-artifacts.js';
import { searchTroubleshooting } from './knowledge/global.js';
import { getEffectiveGdcConfig } from './gdc.js';

export async function advanceBuildStep(options: {
    plan: WeavePlan;
    basePath: string;
    buildId: string;
    changeId: string;
    lastResults?: TaskResult[];
    maxRetries?: number;
    phaseIds?: string[];
    savePlan?: (plan: WeavePlan) => Promise<void>;
}): Promise<BuildDecision> {
    const { plan, basePath, buildId, changeId, maxRetries = 3, savePlan } = options;
    const orchestrator = new WeaveOrchestrator();

    async function persistPlan(): Promise<void> {
        if (savePlan) {
            await savePlan(plan);
        } else {
            try {
                const pm = getPhaseManager(basePath);
                await pm.savePlan(plan);
            } catch {
                // best-effort
            }
        }
    }

    let delta: WaveDelta | null = null;
    let allPassed = true;
    let hasFailures = false;

    if (options.lastResults && options.lastResults.length > 0) {
        const completed: string[] = [];
        const failed: string[] = [];
        const changedFiles: string[] = [];
        const newSymbols: string[] = [];
        const downstreamExports: Array<{ kind: string; path: string; summary: string }> = [];

        for (const result of options.lastResults) {
            try {
                await CM.writeResult(
                    CM.getTaskDir(basePath, changeId, buildId, result.taskId),
                    {
                        taskId: result.taskId,
                        status: result.status,
                        changedFiles: result.changedFiles,
                        createdSymbols: result.createdSymbols,
                        downstreamExports: result.downstreamExports,
                        notes: '',
                        errorSummary: result.errorSummary,
                    }
                );
            } catch {
                // best-effort
            }

            try {
                await CM.writeVerify(
                    CM.getTaskDir(basePath, changeId, buildId, result.taskId),
                    {
                        taskId: result.taskId,
                        status: result.status === 'succeeded' ? 'passed' : 'failed',
                        commands: [{
                            command: `task:${result.taskId}`,
                            status: result.status === 'succeeded' ? 'passed' : 'failed',
                            output: result.errorSummary,
                        }],
                    }
                );
            } catch {
                // best-effort
            }

            if (result.status === 'succeeded') {
                completed.push(result.taskId);
                if (result.changedFiles) changedFiles.push(...result.changedFiles);
                if (result.createdSymbols) newSymbols.push(...result.createdSymbols);
                if (result.downstreamExports) downstreamExports.push(...result.downstreamExports);

                const phase = plan.phases.find(p => p.id === result.phaseId);
                if (phase) {
                    const task = phase.tasks.find(t => t.id === result.taskId);
                    if (task) task.status = 'passed';
                }
            } else {
                failed.push(result.taskId);
                allPassed = false;
                hasFailures = true;

                const pm = getPhaseManager(basePath);
                const phase = plan.phases.find(p => p.id === result.phaseId);
                if (phase) {
                    const task = phase.tasks.find(t => t.id === result.taskId);
                    if (task) {
                        task.status = 'failed';
                        task.lastError = result.errorSummary;
                        task.retryCount = (task.retryCount || 0) + 1;
                    }
                }
            }
        }

        await persistPlan();

        delta = {
            waveIndex: 0,
            completed,
            failed,
            changedFiles: [...new Set(changedFiles)],
            newSymbols: [...new Set(newSymbols)],
            downstreamExports,
        };

        if (hasFailures) {
            const failureResult = options.lastResults.find(r => r.status === 'failed')!;
            const failureKind = classifyFailure(failureResult.errorSummary || '');
            const retryCount = countRetries(plan, failureResult.phaseId, failureResult.taskId);

            if (retryCount < maxRetries) {
                const phase = plan.phases.find(p => p.id === failureResult.phaseId);
                const task = phase?.tasks.find(t => t.id === failureResult.taskId);
                if (phase && task) {
                    const investigation = await investigateTaskContext(task, basePath);
                    const briefPrompt = buildBriefPrompt(task, phase, plan, investigation);
                    const mask = orchestrator.selectMaskForTask(task);
                    const tier = selectAgentTierForTask(task);

                    const contract: TaskDelegationContract = {
                        buildId,
                        phaseId: phase.id,
                        taskId: task.id,
                        waveIndex: 0,
                        subagentType: tier,
                        mask,
                        prompt: briefPrompt,
                        briefPath: toBriefPath(changeId, buildId, task.id),
                        contextPath: toContextPath(changeId, buildId, task.id),
                        allowedPaths: [],
                        forbiddenPaths: [],
                        verifyCommands: extractVerifyCommands(task),
                        resumeCommand: '',
                    };

                    try {
                        await CM.writeBrief(
                            CM.getTaskDir(basePath, changeId, buildId, task.id),
                            {
                                taskId: task.id,
                                buildId,
                                wave: 0,
                                dependsOn: task.dependsOn || [],
                                allowedPaths: contract.allowedPaths,
                                forbiddenPaths: contract.forbiddenPaths,
                                contextPaths: [toContextPath(changeId, buildId, task.id)],
                                acceptanceRefs: task.acceptanceRefs || [],
                                verifyCommands: extractVerifyCommands(task),
                                goal: briefPrompt.slice(0, 5000),
                                requiredOutcome: [],
                                criticalWarnings: task.lastError ? [`Retry after: ${task.lastError.slice(0, 200)}`] : [],
                            }
                        );
                    } catch {
                        // best-effort
                    }

                    return { kind: 'repair', contract, failureKind };
                }
            }

            const failedTasks = options.lastResults
                .filter(r => r.status === 'failed')
                .map(r => r.taskId);

            const phaseManager = getPhaseManager(basePath);
            for (const r of options.lastResults) {
                if (r.status === 'failed') {
                    try {
                        await phaseManager.updateTaskStatus(r.phaseId, r.taskId, 'failed');
                    } catch {
                        // best-effort
                    }
                }
            }

            return {
                kind: 'blocked',
                reason: `Max retries (${maxRetries}) exceeded for tasks: ${failedTasks.join(', ')}`,
                failedTasks,
            };
        }

        if (allPassed && delta) {
            const pm = getPhaseManager(basePath);
            for (const result of options.lastResults) {
                try {
                    await pm.updateTaskStatus(result.phaseId, result.taskId, 'passed');
                } catch {
                    // best-effort
                }
            }

            const waveResult = await advanceToNextWave(plan, basePath, buildId, changeId, orchestrator, options.phaseIds);
            if (waveResult) return waveResult;

            const completePhase = checkPhaseCompletion(plan);
            if (completePhase) {
                try {
                    const pm = getPhaseManager(basePath);
                    await pm.updatePhaseStatus(completePhase.id, 'completed');
                } catch {
                    // best-effort
                }
                completePhase.status = 'completed';
                await persistPlan();
            }

            const allPhasesDone = plan.phases.every(p => p.status === 'completed' || p.status === 'blocked');
            if (allPhasesDone) {
                return { kind: 'complete', summary: `All ${plan.phases.length} phases completed.` };
            }

            return { kind: 'verify', waveIndex: delta.waveIndex };
        }
    }

    const waveResult = await advanceToNextWave(plan, basePath, buildId, changeId, orchestrator, options.phaseIds);
    if (waveResult) return waveResult;

    const allPhasesDone = plan.phases.every(p => p.status === 'completed' || p.status === 'blocked');
    if (allPhasesDone) {
        return { kind: 'complete', summary: `All ${plan.phases.length} phases completed.` };
    }

    return { kind: 'blocked', reason: 'No dispatchable wave found and build is not complete.', failedTasks: [] };
}

async function advanceToNextWave(
    plan: WeavePlan,
    basePath: string,
    buildId: string,
    changeId: string,
    orchestrator: WeaveOrchestrator,
    phaseIds?: string[]
): Promise<BuildDecision | null> {
    const discovered = discoverNextWave(plan, phaseIds);
    if (!discovered) return null;

    const { phase, tasks } = discovered;
    const waveIndex = computeNextWaveIndex(plan, phase.id);
    const taskEntries: WaveTaskEntry[] = [];
    const contracts: TaskDelegationContract[] = [];

    for (const task of tasks) {
        const mask = orchestrator.selectMaskForTask(task);
        const tier = selectAgentTierForTask(task);

        const entry: WaveTaskEntry = {
            taskId: task.id,
            phaseId: phase.id,
            status: 'pending',
            agentTier: tier,
            mask,
            allowedPaths: [],
            forbiddenPaths: [],
            dependsOn: task.dependsOn || [],
        };
        taskEntries.push(entry);

        const investigation = await investigateTaskContext(task, basePath);
        const briefPrompt = buildBriefPrompt(task, phase, plan, investigation);

        const contract: TaskDelegationContract = {
            buildId,
            phaseId: phase.id,
            taskId: task.id,
            waveIndex,
            subagentType: tier,
            mask,
            prompt: briefPrompt,
            briefPath: toBriefPath(changeId, buildId, task.id),
            contextPath: toContextPath(changeId, buildId, task.id),
            allowedPaths: [],
            forbiddenPaths: [],
            verifyCommands: extractVerifyCommands(task),
            resumeCommand: '',
        };
        contracts.push(contract);

        try {
            await CM.writeContext(
                CM.getTaskDir(basePath, changeId, buildId, task.id),
                {
                    taskId: task.id,
                    sourceHashes: {},
                    investigation: formatInvestigationContext(task, investigation),
                    constraints: [],
                    reuseCandidates: [],
                    knownRisks: [],
                }
            );
        } catch {
            // best-effort
        }

        try {
            await CM.writeBrief(
                CM.getTaskDir(basePath, changeId, buildId, task.id),
                {
                    taskId: task.id,
                    buildId,
                    wave: waveIndex,
                    dependsOn: task.dependsOn || [],
                    allowedPaths: contract.allowedPaths,
                    forbiddenPaths: contract.forbiddenPaths,
                    contextPaths: [toContextPath(changeId, buildId, task.id)],
                    acceptanceRefs: task.acceptanceRefs || [],
                    verifyCommands: extractVerifyCommands(task),
                    goal: briefPrompt.slice(0, 5000),
                    requiredOutcome: [],
                    criticalWarnings: [],
                }
            );
        } catch {
            // best-effort
        }
    }

    const wave: WavePlan = {
        waveIndex,
        tasks: taskEntries,
        parallelSafe: tasks.length > 1,
        startedAt: new Date().toISOString(),
    };

    try {
        await CM.writeWavePlan(
            CM.getWavesDir(basePath, changeId, buildId),
            {
                buildId,
                waveIndex: wave.waveIndex,
                tasks: wave.tasks.map(t => ({
                    taskId: t.taskId,
                    phaseId: t.phaseId,
                    allowedPaths: t.allowedPaths,
                    dependsOn: t.dependsOn,
                })),
                parallelSafe: wave.parallelSafe,
            }
        );
    } catch {
        // best-effort
    }

    try {
        await CM.snapshotWiki(
            basePath,
            CM.getSnapshotsDir(basePath, changeId, buildId),
        );
    } catch {
        // best-effort
    }

    const contextIndex = buildContextIndex(buildId, waveIndex, contracts);
    try {
        await CM.writeContextIndex(
            CM.getBuildDir(basePath, changeId, buildId),
            contextIndex,
        );
    } catch {
        // best-effort
    }

    try {
        const pm = getPhaseManager(basePath);
        await pm.updatePhaseStatus(phase.id, 'in_progress');
    } catch {
        // best-effort
    }

    for (const task of tasks) {
        try {
            const pm = getPhaseManager(basePath);
            await pm.updateTaskStatus(phase.id, task.id, 'in_progress');
        } catch {
            // best-effort
        }
    }

    return { kind: 'dispatch_wave', wave, contracts };
}

function discoverNextWave(plan: WeavePlan, phaseIds?: string[]): { phase: WeavePhase; tasks: WeaveTask[] } | null {
    const readyPhases = plan.phases.filter(phase => {
        if (phase.status === 'completed' || phase.status === 'blocked') return false;
        if (phaseIds && phaseIds.length > 0 && !phaseIds.includes(phase.id)) return false;

        if (phase.dependsOn && phase.dependsOn.length > 0) {
            const allDepsCompleted = phase.dependsOn.every(depId => {
                const depPhase = plan.phases.find(p => p.id === depId);
                return depPhase?.status === 'completed';
            });
            if (!allDepsCompleted) return false;
        }

        return true;
    });

    for (const phase of readyPhases) {
        const pendingTasks = phase.tasks.filter(t => t.status === 'pending');
        if (pendingTasks.length === 0) continue;

        const readyTasks = pendingTasks.filter(task => {
            if (!task.dependsOn || task.dependsOn.length === 0) return true;

            return task.dependsOn.every(depId => {
                const depTask = phase.tasks.find(t => t.id === depId);
                if (!depTask) {
                    const depFoundInOtherPhase = plan.phases.some(p =>
                        p.tasks.some(t => t.id === depId && t.status === 'passed')
                    );
                    return depFoundInOtherPhase;
                }
                return depTask.status === 'passed';
            });
        });

        if (readyTasks.length > 0) {
            return { phase, tasks: readyTasks };
        }
    }

    return null;
}

function detectTaskType(name: string): string {
    const patterns: Array<[RegExp, string]> = [
        [/architect|design pattern|refactor|structure|module|decouple|dependency|interface|abstraction|layer|separation/i, 'architecture'],
        [/test|tdd|spec|assert|mock|stub|coverage|unit|integration|e2e/i, 'testing'],
        [/react|vue|angular|component|ui|css|tailwind|style|layout|responsive|animation|jsx|tsx|hook|state/i, 'frontend'],
        [/api|endpoint|rest|graphql|server|controller|service|middleware|route|auth/i, 'backend'],
        [/performance|optimize|memory|cpu|cache|latency|throughput|profile|benchmark|race|concurrency|thread/i, 'performance'],
        [/database|sql|query|migration|schema|orm|prisma|postgres|mysql|mongo|redis|index/i, 'database'],
        [/machine learning|ml|ai|model|training|inference|tensor|neural|embedding|transformer/i, 'ml'],
        [/deploy|docker|kubernetes|ci\/cd|pipeline|container|helm|terraform|aws|gcp|azure/i, 'devops'],
    ];

    for (const [regex, type] of patterns) {
        if (regex.test(name)) return type;
    }

    return 'general';
}

function selectAgentTierForTask(task: WeaveTask): AgentTier {
    const complexitySignals: Array<[RegExp, number]> = [
        [/architect|refactor|design pattern|migration|state management|auth|performance|concurrency|debug|security|algorithm/i, 2],
        [/component|api|endpoint|route|test|spec|database|query|schema|hook|middleware|validation|integrate/i, 1],
    ];

    const simplePatterns = [
        /rename/i, /import/i, /format/i, /prettier/i, /typo/i,
        /config/i, /comment/i, /documentation/i, /remove unused/i,
        /update version/i, /add export/i, /fix lint/i,
    ];

    for (const pattern of simplePatterns) {
        if (pattern.test(task.name)) return 'dummy-flash';
    }

    let score = 0;
    for (const [regex, weight] of complexitySignals) {
        if (regex.test(task.name)) score += weight;
    }

    if (score >= 3) return 'dummy-premium';
    if (score >= 1) return 'dummy-human';
    return 'dummy-flash';
}

async function investigateTaskContext(task: WeaveTask, basePath: string): Promise<{
    targetFiles: Array<{ path: string; content: string }>;
    imports: string[];
    relatedPatterns: Array<{ file: string; snippet: string }>;
    gdcSpecs: string[];
    troubleshootingHints: string[];
}> {
    const targetFiles: Array<{ path: string; content: string }> = [];
    const allImports = new Set<string>();
    const relatedPatterns: Array<{ file: string; snippet: string }> = [];
    const gdcSpecs: string[] = [];
    const troubleshootingHints: string[] = [];

    if (task.files && task.files.length > 0) {
        for (const filePath of task.files) {
            const absPath = path.resolve(basePath, filePath);
            if (!absPath.startsWith(path.resolve(basePath) + path.sep) && absPath !== path.resolve(basePath)) continue;
            if (!fs.existsSync(absPath)) continue;

            try {
                let content = await readFile(absPath, 'utf-8');
                if (content.length > 3000) {
                    content = content.slice(0, 3000) + '\n// ... truncated';
                }

                targetFiles.push({ path: filePath, content });

                const importRegex = /import\s+(?:(?:\{[^}]*\})\s+from\s+)?['"](.+?)['"]/g;
                let match;
                while ((match = importRegex.exec(content)) !== null) {
                    if (match[1]) {
                        allImports.add(match[1]);
                    }
                }

                const exportRegex = /export\s+(?:default\s+)?(?:function|class|const|let|var|interface|type|enum)\s+(\w+)/g;
                let exportMatch;
                while ((exportMatch = exportRegex.exec(content)) !== null) {
                    const start = Math.max(0, exportMatch.index - 20);
                    const end = Math.min(content.length, exportMatch.index + exportMatch[0].length + 20);
                    relatedPatterns.push({
                        file: filePath,
                        snippet: content.slice(start, end).replace(/\n/g, ' ').trim(),
                    });
                }
            } catch {
                // skip unreadable files
            }
        }
    }

    try {
        const gdcConfig = getEffectiveGdcConfig(basePath);
        if (gdcConfig.enabled && task.nodeIds && task.nodeIds.length > 0) {
            const nodesDir = path.join(basePath, '.gdc', 'nodes');
            if (fs.existsSync(nodesDir)) {
                for (const nodeId of task.nodeIds) {
                    const specPath = path.join(nodesDir, `${nodeId}.yaml`);
                    if (fs.existsSync(specPath)) {
                        try {
                            const specContent = await readFile(specPath, 'utf-8');
                            gdcSpecs.push(`--- ${nodeId}.yaml ---\n${specContent.slice(0, 2000)}`);
                        } catch {
                            gdcSpecs.push(`--- ${nodeId}.yaml ---\n(unreadable)`);
                        }
                    }

                    const implPath = path.join(nodesDir, nodeId, 'impl.ts');
                    if (fs.existsSync(implPath)) {
                        try {
                            const implContent = await readFile(implPath, 'utf-8');
                            gdcSpecs.push(`--- ${nodeId}/impl.ts ---\n${implContent.slice(0, 2000)}`);
                        } catch {
                            // skip
                        }
                    }
                }
            }
        }
    } catch {
        // GDC is best-effort
    }

    try {
        const results = await searchTroubleshooting(task.name, { limit: 3 });
        for (const result of results) {
            if (result.score > 0.3) {
                troubleshootingHints.push(result.entry.solution.slice(0, 300));
            }
        }
    } catch {
        // knowledge search is best-effort
    }

    return {
        targetFiles,
        imports: [...allImports],
        relatedPatterns,
        gdcSpecs,
        troubleshootingHints,
    };
}

function buildBriefPrompt(
    task: WeaveTask,
    phase: WeavePhase,
    plan: WeavePlan,
    investigation: Awaited<ReturnType<typeof investigateTaskContext>>
): string {
    const lines: string[] = [];

    lines.push(`# Task: ${task.name}`);
    lines.push('');
    lines.push(`**Phase**: ${phase.id} - ${phase.name}`);
    lines.push(`**Project**: ${plan.projectName}`);
    if (plan.vision) lines.push(`**Vision**: ${plan.vision.slice(0, 200)}`);
    lines.push('');

    if (task.testCase) {
        lines.push('## Test Case');
        lines.push(task.testCase);
        lines.push('');
    }

    if (task.acceptanceCriteria && task.acceptanceCriteria.length > 0) {
        lines.push('## Acceptance Criteria');
        for (const ac of task.acceptanceCriteria) {
            lines.push(`- **${ac.scenario}**: ${ac.feature}`);
            for (const g of ac.given) lines.push(`  - Given: ${g}`);
            for (const w of ac.when) lines.push(`  - When: ${w}`);
            for (const t of ac.then) lines.push(`  - Then: ${t}`);
        }
        lines.push('');
    }

    lines.push('## Target Files');
    if (investigation.targetFiles.length > 0) {
        for (const f of investigation.targetFiles) {
            lines.push(`- \`${f.path}\``);
        }
    } else if (task.files && task.files.length > 0) {
        for (const f of task.files) {
            lines.push(`- \`${f}\``);
        }
    } else {
        lines.push('_(no specific files targeted)_');
    }
    lines.push('');

    if (investigation.imports.length > 0) {
        lines.push('## Detected Imports');
        for (const imp of investigation.imports.slice(0, 20)) {
            lines.push(`- \`${imp}\``);
        }
        lines.push('');
    }

    if (investigation.relatedPatterns.length > 0) {
        lines.push('## Related Code Patterns');
        for (const p of investigation.relatedPatterns.slice(0, 10)) {
            lines.push(`- \`${p.file}\`: \`${p.snippet}\``);
        }
        lines.push('');
    }

    if (investigation.gdcSpecs.length > 0) {
        lines.push('## GDC Specifications');
        for (const spec of investigation.gdcSpecs) {
            lines.push(spec);
        }
        lines.push('');
    }

    if (investigation.troubleshootingHints.length > 0) {
        lines.push('## Troubleshooting Hints');
        for (const hint of investigation.troubleshootingHints) {
            lines.push(`- ${hint}`);
        }
        lines.push('');
    }

    if (phase.doneWhen) {
        lines.push('## Phase Completion Criteria');
        lines.push(phase.doneWhen);
        lines.push('');
    }

    if (phase.checklist && phase.checklist.length > 0) {
        lines.push('## Verification Checklist');
        for (const item of phase.checklist) {
            lines.push(`- [ ] ${item}`);
        }
        lines.push('');
    }

    if (task.verify && task.verify.length > 0) {
        lines.push('## Verification Commands');
        for (const v of task.verify) {
            if (v.kind === 'command') {
                lines.push(`- \`${v.value}\``);
            } else if (v.kind === 'checklist') {
                lines.push(`- ${v.value}`);
            }
        }
        lines.push('');
    }

    lines.push('## Goal');
    lines.push(`Implement or fix: **${task.name}**`);
    lines.push('');

    if (task.lastError) {
        lines.push('## Previous Error');
        lines.push(`\`\`\`\n${task.lastError.slice(0, 500)}\n\`\`\``);
        lines.push('');
    }

    return lines.join('\n').slice(0, 6000);
}

function classifyFailure(error: string): FailureKind {
    const lower = error.toLowerCase();

    if (/cannot find module|module not found|import.*failed|require.*fail|resolve.*error/i.test(lower)) {
        return 'dependency_failure';
    }

    if (/type.*(?:error|mismatch|not assignable|cannot be used)|interface.*missing/i.test(lower)) {
        return 'implementation_failure';
    }

    if (/build failed|compile error|compilation|tsc.*error|syntax error|unexpected token/i.test(lower)) {
        return 'validation_failure';
    }

    if (/conflict|merge conflict|multiple definitions|duplicate/i.test(lower)) {
        return 'conflict_failure';
    }

    if (/environment|ENOENT|EACCES|permission denied|not found|command.*not|network|timeout/i.test(lower)) {
        return 'environment_failure';
    }

    if (/prompt|instruction|misunders|unexpected output|empty result|no response/i.test(lower)) {
        return 'prompt_failure';
    }

    return 'implementation_failure';
}

function countRetries(plan: WeavePlan, phaseId: string, taskId: string): number {
    const phase = plan.phases.find(p => p.id === phaseId);
    if (!phase) return 0;
    const task = phase.tasks.find(t => t.id === taskId);
    return task?.retryCount ?? 0;
}

function computeNextWaveIndex(plan: WeavePlan, phaseId: string): number {
    let maxWave = 0;
    for (const phase of plan.phases) {
        if (phase.id === phaseId) {
            for (const task of phase.tasks) {
                if (task.status !== 'pending') {
                    maxWave++;
                }
            }
        }
    }
    return maxWave + 1;
}

function checkPhaseCompletion(plan: WeavePlan): WeavePhase | null {
    for (const phase of plan.phases) {
        if (phase.status === 'in_progress') {
            const allPassed = phase.tasks.every(t => t.status === 'passed');
            if (allPassed && phase.tasks.length > 0) {
                return phase;
            }
        }
    }
    return null;
}

function extractVerifyCommands(task: WeaveTask): string[] {
    if (!task.verify) return [];
    return task.verify
        .filter(v => v.kind === 'command')
        .map(v => v.value);
}

function buildContextIndex(
    buildId: string,
    waveIndex: number,
    contracts: TaskDelegationContract[]
): ContextIndex {
    const tasks: ContextIndex['tasks'] = {};

    for (const contract of contracts) {
        tasks[contract.taskId] = {
            context: [contract.contextPath, contract.briefPath],
            upstream: [],
        };
    }

    return {
        buildId,
        lastWaveIndex: waveIndex,
        tasks,
    };
}

function formatTaskResult(result: TaskResult): string {
    const lines: string[] = [];
    lines.push(`# Task Result: ${result.taskId}`);
    lines.push('');
    lines.push(`- **Status**: ${result.status}`);
    lines.push(`- **Phase**: ${result.phaseId}`);
    lines.push('');

    if (result.changedFiles && result.changedFiles.length > 0) {
        lines.push('## Changed Files');
        for (const f of result.changedFiles) lines.push(`- ${f}`);
        lines.push('');
    }

    if (result.createdSymbols && result.createdSymbols.length > 0) {
        lines.push('## New Symbols');
        for (const s of result.createdSymbols) lines.push(`- ${s}`);
        lines.push('');
    }

    if (result.errorSummary) {
        lines.push('## Error');
        lines.push(`\`\`\`\n${result.errorSummary}\n\`\`\``);
        lines.push('');
    }

    if (result.downstreamExports && result.downstreamExports.length > 0) {
        lines.push('## Downstream Exports');
        for (const e of result.downstreamExports) {
            lines.push(`- [${e.kind}] ${e.path}: ${e.summary}`);
        }
        lines.push('');
    }

    return lines.join('\n');
}

function formatTaskVerify(result: TaskResult): string {
    const lines: string[] = [];
    lines.push(`# Verification: ${result.taskId}`);
    lines.push('');
    lines.push(`- **Result**: ${result.status === 'succeeded' ? 'PASS' : 'FAIL'}`);
    lines.push(`- **Task**: ${result.taskId}`);
    lines.push(`- **Phase**: ${result.phaseId}`);
    lines.push('');

    if (result.status === 'succeeded') {
        lines.push('All checks passed.');
        if (result.changedFiles && result.changedFiles.length > 0) {
            lines.push('');
            lines.push('## Files Modified');
            for (const f of result.changedFiles) lines.push(`- \`${f}\``);
        }
    } else {
        lines.push('## Failures');
        lines.push(`\`\`\`\n${result.errorSummary || 'Unknown error'}\n\`\`\``);
        if (result.failureKind) {
            lines.push(`- **Failure Kind**: ${result.failureKind}`);
        }
    }

    return lines.join('\n');
}

function formatInvestigationContext(
    task: WeaveTask,
    investigation: Awaited<ReturnType<typeof investigateTaskContext>>
): string {
    const lines: string[] = [];
    lines.push(`# Context: ${task.name}`);
    lines.push('');

    if (investigation.targetFiles.length > 0) {
        lines.push('## Target File Contents');
        for (const f of investigation.targetFiles) {
            lines.push('');
            lines.push(`### \`${f.path}\``);
            lines.push('```');
            lines.push(f.content.slice(0, 2500));
            lines.push('```');
        }
        lines.push('');
    }

    if (investigation.imports.length > 0) {
        lines.push('## Imports Found');
        for (const imp of investigation.imports) {
            lines.push(`- \`${imp}\``);
        }
        lines.push('');
    }

    if (investigation.troubleshootingHints.length > 0) {
        lines.push('## Troubleshooting Hints');
        for (const hint of investigation.troubleshootingHints) {
            lines.push(`- ${hint}`);
        }
        lines.push('');
    }

    return lines.join('\n');
}

function toBriefPath(changeId: string, buildId: string, taskId: string): string {
    return path.posix.join('.opencode', 'weave', 'changes', changeId, 'builds', buildId, 'tasks', taskId, 'brief.md');
}

function toContextPath(changeId: string, buildId: string, taskId: string): string {
    return path.posix.join('.opencode', 'weave', 'changes', changeId, 'builds', buildId, 'tasks', taskId, 'context.md');
}
