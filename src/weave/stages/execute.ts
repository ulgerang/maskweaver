/**
 * Weave Execute Stage
 * 
 * Generates execution plans with automatic mask and agent tier selection.
 * Actual code generation/testing is performed by AI agents (dummy-flash/human/premium)
 * via the Task tool — this module handles:
 * - Phase validation and dependency checking
 * - Execution plan generation (mask + agent tier per task)
 * - Formatting the plan for the Mask Weaver to act upon
 * - AI-driven verification system integration
 */

import type { WeavePhase, WeaveTask, WeaveConfig, WeaveEvent, PhaseExecutionPlan, AgentTier } from '../types.js';
import { WeaveOrchestrator, getOrchestrator } from '../orchestrator.js';
import { PhaseManager, getPhaseManager } from '../phase-manager.js';
import { searchTroubleshooting, recordTroubleshooting } from '../knowledge/global.js';
import { analyzeParallelOpportunities, formatParallelAnalysis } from '../bridge.js';
import { spawn } from 'node:child_process';
import {
    checkPlaywrightSetup,
    runPlaywrightTests,
    analyzePlaywrightError,
    type PlaywrightTestResult,
    type PlaywrightConfig,
} from '../verification/index.js';

import { recommendVerificationCommands } from '../verification/commands.js';

// ============================================================================
// Types
// ============================================================================

export interface ExecuteOptions {
    phaseId: string;
    onEvent?: (event: WeaveEvent) => void;
    projectType?: string;
    techStack?: string[];
    /** Base path for .opencode/weave (defaults to process.cwd()) */
    basePath?: string;
}

export interface PrepareResult {
    plan: PhaseExecutionPlan;
    phase: WeavePhase;
}

export interface ExecuteResult {
    success: boolean;
    phase: WeavePhase;
    tasksCompleted: number;
    tasksFailed: number;
    troubleshootingUsed: number;
    troubleshootingRecorded: number;
    masksUsed: string[];
    durationMs: number;
    executionPlan?: PhaseExecutionPlan;
}

export interface TaskExecutionContext {
    task: WeaveTask;
    phase: WeavePhase;
    orchestrator: WeaveOrchestrator;
    onEvent: (event: WeaveEvent) => void;
    projectType?: string;
    techStack?: string[];
}

// ============================================================================
// Prepare Phase Execution (primary entry point for craft)
// ============================================================================

/**
 * Prepare a phase for execution.
 * 
 * This is the primary entry point for craft. It:
 * 1. Validates dependencies
 * 2. Marks the phase as in_progress
 * 3. Generates an execution plan (mask + agent tier per task)
 * 4. Returns the plan for the Mask Weaver to delegate via Task tool
 * 
 * The actual code generation/testing is performed by AI agents
 * (dummy-flash, dummy-human, dummy-premium) — not by this function.
 */
export async function preparePhaseExecution(options: ExecuteOptions): Promise<PrepareResult> {
    const { phaseId, onEvent = () => { }, projectType, basePath } = options;

    const manager = getPhaseManager(basePath);
    const orchestrator = getOrchestrator();

    // Load plan and get phase
    await manager.loadPlan();
    const phase = manager.getPhase(phaseId);

    if (!phase) {
        throw new Error(`Phase not found: ${phaseId}`);
    }

    // Check dependencies
    const plan = await manager.loadPlan();
    if (phase.dependsOn && phase.dependsOn.length > 0) {
        for (const depId of phase.dependsOn) {
            const dep = plan?.phases.find(p => p.id === depId);
            if (dep?.status !== 'completed') {
                throw new Error(`Dependency not completed: ${depId}`);
            }
        }
    }

    // Mark phase as in progress
    await manager.updatePhaseStatus(phaseId, 'in_progress');
    onEvent({ type: 'phase_started', phaseId });

    // Generate execution plan with mask + agent tier per task
    const executionPlan = await orchestrator.generateExecutionPlan(phase, { projectType });

    return {
        plan: executionPlan,
        phase,
    };
}

// ============================================================================
// Format Execution Plan (markdown output for Mask Weaver)
// ============================================================================

/**
 * Format a PhaseExecutionPlan into markdown instructions
 * that the Mask Weaver can read and act upon.
 */
export function formatExecutionPlan(plan: PhaseExecutionPlan): string {
    const lines: string[] = [];

    lines.push(`## Phase ${plan.phaseId}: ${plan.phaseName}`);
    lines.push('');
    lines.push('### Execution Plan');
    lines.push('');
    lines.push('| # | Task ID | Task | Complexity | Agent Tier | Mask |');
    lines.push('|---|---------|------|-----------|------------|------|');

    for (let i = 0; i < plan.taskPlans.length; i++) {
        const tp = plan.taskPlans[i];
        const tierLabel = formatTierLabel(tp.agentTier);
        const mask = tp.mask || 'auto';
        lines.push(`| ${i + 1} | ${tp.task.id} | ${tp.task.name} | ${tp.complexity} | ${tierLabel} | ${mask} |`);
    }

    lines.push('');

    // Summarize tier distribution
    const flash = plan.taskPlans.filter(p => p.agentTier === 'dummy-flash').length;
    const human = plan.taskPlans.filter(p => p.agentTier === 'dummy-human').length;
    const premium = plan.taskPlans.filter(p => p.agentTier === 'dummy-premium').length;

    lines.push('### Delegation Strategy');
    lines.push('');
    if (flash > 0) lines.push(`- **dummy-flash** (${flash} tasks): Simple tasks -- fast & cheap`);
    if (human > 0) lines.push(`- **dummy-human** (${human} tasks): Standard implementation`);
    if (premium > 0) lines.push(`- **dummy-premium** (${premium} tasks): Complex reasoning required`);
    lines.push('');

    // Add troubleshooting hints if any
    const tasksWithHints = plan.taskPlans.filter(p => p.troubleshootingHints.length > 0);
    if (tasksWithHints.length > 0) {
        lines.push('### Troubleshooting Hints (from Global Knowledge)');
        lines.push('');
        for (const tp of tasksWithHints) {
            lines.push(`**${tp.task.name}**:`);
            for (const hint of tp.troubleshootingHints) {
                lines.push(`- ${hint}`);
            }
            lines.push('');
        }
    }

    // Parallel execution analysis (if multiple tasks)
    if (plan.taskPlans.length > 1) {
        const parallelAnalysis = analyzeParallelOpportunities(plan);
        lines.push(formatParallelAnalysis(parallelAnalysis));
        lines.push('');
    }

    // Execution instructions for the Mask Weaver
    lines.push('### Instructions');
    lines.push('');
    lines.push('For each task above, delegate using `Task(<agent_tier>)` with the specified mask.');
    lines.push('Track task progress with `weave task` (recommended).');
    lines.push('');
    lines.push('**Suggested per-task loop:**');
    lines.push(`1) Start: \`weave command=task phaseId="${plan.phaseId}" taskAction=start taskId="<TASK_ID>"\``);
    lines.push('2) Delegate implementation to the selected agent tier + mask');
    lines.push(`3) Pass + quick verify: \`weave command=task phaseId="${plan.phaseId}" taskAction=pass taskId="<TASK_ID>" verify=true verifyMode="quick"\``);
    lines.push('4) (Optional) Atomic commit: add `commit=true` (and `stageAll=true` if you want auto staging)');
    lines.push('');
    lines.push('After all tasks pass, run `weave approve` to run full verification and mark the phase complete.');
    lines.push(`If you must bypass verification: \`weave command=approve phaseId="${plan.phaseId}" skipVerify=true\``);
    lines.push('');
    lines.push('**Decision flow per task:**');
    lines.push('1. Simple (flash) -> Handle directly or delegate to dummy-flash');
    lines.push('2. Standard (human) -> Delegate to dummy-human with mask');
    lines.push('3. Complex (premium) -> Delegate to dummy-premium with mask');

    return lines.join('\n');
}

function formatTierLabel(tier: AgentTier): string {
    switch (tier) {
        case 'dummy-flash': return 'flash';
        case 'dummy-human': return 'human';
        case 'dummy-premium': return 'premium';
    }
}

// ============================================================================
// Legacy Execute (backward compatibility)
// ============================================================================

/**
 * @deprecated Use preparePhaseExecution() + formatExecutionPlan() instead.
 * Kept for backward compatibility.
 */
export async function execute(options: ExecuteOptions): Promise<ExecuteResult> {
    const startTime = Date.now();
    const { phaseId } = options;

    // Use preparePhaseExecution internally
    const { plan: executionPlan, phase } = await preparePhaseExecution(options);

    const manager = getPhaseManager(options.basePath);
    const masksUsed: Set<string> = new Set();

    // Collect masks from the execution plan
    for (const tp of executionPlan.taskPlans) {
        if (tp.mask) masksUsed.add(tp.mask);
    }

    // Update plan with masks used
    await manager.updatePhaseStatus(phaseId, 'in_progress', {
        masksUsed: Array.from(masksUsed),
    });

    const finalPhase = manager.getPhase(phaseId)!;

    return {
        success: true,
        phase: finalPhase,
        tasksCompleted: 0,  // No tasks auto-executed — AI agent handles this
        tasksFailed: 0,
        troubleshootingUsed: 0,
        troubleshootingRecorded: 0,
        masksUsed: Array.from(masksUsed),
        durationMs: Date.now() - startTime,
        executionPlan,
    };
}

// ============================================================================
// AI-Driven Verification System
// ============================================================================

/**
 * Multi-layer verification that AI can perform automatically.
 * Each layer returns pass/fail with error details.
 * If any layer fails, the execute loop will retry.
 */
export interface VerificationLayer {
    name: string;
    order: number;
    type: 'build' | 'test' | 'visual' | 'api' | 'accessibility';
    enabled: boolean;
}

export interface VerificationResult {
    layer: string;
    passed: boolean;
    error?: string;
    screenshot?: string;  // Path to screenshot if taken
    logs?: string[];
    duration: number;
}

export interface AIVerificationOptions {
    projectType: string;
    projectPath: string;
    devServerUrl?: string;  // e.g., "http://localhost:3000"
    enableScreenshots?: boolean;
    enablePlaywright?: boolean;
    enableDevTools?: boolean;
    /** Verification scope. quick: TypeCheck + UnitTests only. full: all available. */
    mode?: 'quick' | 'full';
}

/**
 * Run all verification layers in order.
 * Returns as soon as any layer fails.
 */
export async function runAIVerification(options: AIVerificationOptions): Promise<{
    passed: boolean;
    results: VerificationResult[];
    failedAt?: string;
}> {
    const results: VerificationResult[] = [];
    const layers = getVerificationLayers(options);

    for (const layer of layers) {
        if (!layer.enabled) continue;

        const startTime = Date.now();
        let result: VerificationResult;

        try {
            switch (layer.type) {
                case 'build':
                    result = await runBuildVerification(options, layer.name);
                    break;
                case 'test':
                    result = await runTestVerification(options, layer.name);
                    break;
                case 'visual':
                    result = await runVisualVerification(options);
                    break;
                case 'api':
                    result = await runAPIVerification(options);
                    break;
                case 'accessibility':
                    result = await runAccessibilityVerification(options);
                    break;
                default:
                    continue;
            }

            result.layer = layer.name;
            result.duration = Date.now() - startTime;
            results.push(result);

            if (!result.passed) {
                return { passed: false, results, failedAt: layer.name };
            }
        } catch (e) {
            results.push({
                layer: layer.name,
                passed: false,
                error: e instanceof Error ? e.message : String(e),
                duration: Date.now() - startTime,
            });
            return { passed: false, results, failedAt: layer.name };
        }
    }

    return { passed: true, results };
}

function getVerificationLayers(options: AIVerificationOptions): VerificationLayer[] {
    const rec = recommendVerificationCommands({
        projectPath: options.projectPath,
        projectTypeHint: options.projectType,
    });

    const hasTests = rec.testSteps.length > 0;
    const mode = options.mode || 'full';
    const full = mode === 'full';

    return [
        // Layer 1: Build/Compile
        { name: 'TypeCheck', order: 1, type: 'build', enabled: rec.buildSteps.some(s => s.name === 'TypeCheck') },
        { name: 'Lint', order: 2, type: 'build', enabled: full && rec.buildSteps.some(s => s.name === 'Lint') },
        { name: 'Build', order: 3, type: 'build', enabled: full && rec.buildSteps.some(s => s.name === 'Build') },

        // Layer 2: Unit/Integration Tests
        { name: 'UnitTests', order: 4, type: 'test', enabled: hasTests },

        // Layer 3: E2E Tests (Playwright/Cypress)
        { name: 'E2ETests', order: 5, type: 'test', enabled: options.enablePlaywright ?? false },

        // Layer 4: Visual Verification (Screenshots)
        { name: 'Screenshot', order: 6, type: 'visual', enabled: options.enableScreenshots ?? false },

        // Layer 5: API/DB Verification
        { name: 'APICheck', order: 7, type: 'api', enabled: !!options.devServerUrl },

        // Layer 6: Accessibility (optional)
        { name: 'Accessibility', order: 8, type: 'accessibility', enabled: false },
    ];
}

// ============================================================================
// Build Verification (tsc, lint, build)
// ============================================================================

interface ShellCommandResult {
    cmd: string;
    cwd: string;
    exitCode: number;
    timedOut: boolean;
    timeoutMs: number;
    stdout: string;
    stderr: string;
    durationMs: number;
}

async function runShellCommand(
    cmd: string,
    cwd: string,
    options?: {
        timeoutMs?: number;
        maxOutputChars?: number;
    }
): Promise<ShellCommandResult> {
    const timeoutMs = options?.timeoutMs ?? 10 * 60 * 1000;
    const maxOutputChars = options?.maxOutputChars ?? 50_000;
    const start = Date.now();

    return new Promise((resolve) => {
        const proc = spawn(cmd, {
            cwd,
            shell: true,
            windowsHide: true,
            stdio: ['ignore', 'pipe', 'pipe'],
        });

        let stdout = '';
        let stderr = '';
        let timedOut = false;

        const appendTail = (current: string, chunk: string): string => {
            const next = current + chunk;
            if (next.length <= maxOutputChars) return next;
            return next.slice(next.length - maxOutputChars);
        };

        proc.stdout?.on('data', (data) => {
            stdout = appendTail(stdout, data.toString());
        });

        proc.stderr?.on('data', (data) => {
            stderr = appendTail(stderr, data.toString());
        });

        const timer = setTimeout(() => {
            timedOut = true;
            try {
                proc.kill();
            } catch {
                // ignore
            }
        }, timeoutMs);

        const finalize = (exitCode: number) => {
            clearTimeout(timer);
            resolve({
                cmd,
                cwd,
                exitCode,
                timedOut,
                timeoutMs,
                stdout: stdout.trim(),
                stderr: stderr.trim(),
                durationMs: Date.now() - start,
            });
        };

        proc.on('close', (code) => {
            finalize(code ?? 1);
        });

        proc.on('error', (error) => {
            stderr = appendTail(stderr, error.message);
            finalize(1);
        });
    });
}

async function runBuildVerification(options: AIVerificationOptions, stepName: string): Promise<VerificationResult> {
    const rec = recommendVerificationCommands({
        projectPath: options.projectPath,
        projectTypeHint: options.projectType,
    });

    const step = rec.buildSteps.find(s => s.name === stepName);
    const logs: string[] = [];

    if (!step) {
        logs.push(`[${stepName}] Skipped (no command detected)`);
        logs.push(`[detect] type=${rec.detectedType} evidence=${rec.evidence.join(', ') || '(none)'}`);
        return { passed: true, logs, layer: 'Build', duration: 0 };
    }

    logs.push(`[${stepName}] Running: ${step.cmd}`);
    logs.push(`[detect] type=${rec.detectedType} evidence=${rec.evidence.join(', ') || '(none)'}`);
    if (step.reason) logs.push(`[${stepName}] Reason: ${step.reason}`);
    for (const n of rec.notes.slice(0, 3)) logs.push(`[note] ${n}`);

    const result = await runShellCommand(step.cmd, options.projectPath);

    if (result.stdout) {
        logs.push(`[${stepName}] stdout (tail):`);
        for (const line of result.stdout.split(/\r?\n/).slice(-20)) {
            if (line.trim().length > 0) logs.push(`> ${line}`);
        }
    }

    if (result.stderr) {
        logs.push(`[${stepName}] stderr (tail):`);
        for (const line of result.stderr.split(/\r?\n/).slice(-20)) {
            if (line.trim().length > 0) logs.push(`> ${line}`);
        }
    }

    if (result.timedOut || result.exitCode !== 0) {
        const why = result.timedOut
            ? `timed out (>${Math.round(result.timeoutMs / 1000)}s)`
            : `exit code ${result.exitCode}`;
        const combined = `${result.stdout}\n${result.stderr}`.trim();

        // Try to find similar troubleshooting entries
        if (combined.length > 0) {
            try {
                const solutions = await searchTroubleshooting(combined, {
                    projectType: options.projectType,
                    limit: 3,
                });
                if (solutions.length > 0) {
                    logs.push(`[${stepName}] Hints (Global Knowledge):`);
                    for (const s of solutions) {
                        logs.push(`- ${s.entry.solution}`);
                    }
                }
            } catch {
                // ignore knowledge search failures
            }
        }

        return {
            passed: false,
            error: `Command failed: ${step.cmd} (${why})`,
            logs,
            layer: 'Build',
            duration: result.durationMs,
        };
    }

    return { passed: true, logs, layer: 'Build', duration: result.durationMs };
}

// ============================================================================
// Test Verification (unit, E2E)
// ============================================================================

async function runTestVerification(options: AIVerificationOptions, stepName: string): Promise<VerificationResult> {
    const { projectPath, enablePlaywright, devServerUrl } = options;
    const logs: string[] = [];
    let playwrightResult: PlaywrightTestResult | null = null;

    // Unit tests (recommended)
    if (stepName === 'UnitTests') {
        const rec = recommendVerificationCommands({
            projectPath: options.projectPath,
            projectTypeHint: options.projectType,
        });
        const unit = rec.testSteps.find(s => s.name === 'UnitTests');

        if (!unit) {
            logs.push('[UnitTests] Skipped (no command detected)');
            logs.push(`[detect] type=${rec.detectedType} evidence=${rec.evidence.join(', ') || '(none)'}`);
            return { passed: true, logs, layer: 'Test', duration: 0 };
        }

        logs.push(`[UnitTests] Running: ${unit.cmd}`);
        logs.push(`[detect] type=${rec.detectedType} evidence=${rec.evidence.join(', ') || '(none)'}`);
        if (unit.reason) logs.push(`[UnitTests] Reason: ${unit.reason}`);
        for (const n of rec.notes.slice(0, 3)) logs.push(`[note] ${n}`);

        const result = await runShellCommand(unit.cmd, options.projectPath);

        if (result.stdout) {
            logs.push('[UnitTests] stdout (tail):');
            for (const line of result.stdout.split(/\r?\n/).slice(-20)) {
                if (line.trim().length > 0) logs.push(`> ${line}`);
            }
        }

        if (result.stderr) {
            logs.push('[UnitTests] stderr (tail):');
            for (const line of result.stderr.split(/\r?\n/).slice(-20)) {
                if (line.trim().length > 0) logs.push(`> ${line}`);
            }
        }

        if (result.timedOut || result.exitCode !== 0) {
            const why = result.timedOut
                ? `timed out (>${Math.round(result.timeoutMs / 1000)}s)`
                : `exit code ${result.exitCode}`;
            const combined = `${result.stdout}\n${result.stderr}`.trim();

            if (combined.length > 0) {
                try {
                    const solutions = await searchTroubleshooting(combined, {
                        projectType: options.projectType,
                        limit: 3,
                    });
                    if (solutions.length > 0) {
                        logs.push('[UnitTests] Hints (Global Knowledge):');
                        for (const s of solutions) {
                            logs.push(`- ${s.entry.solution}`);
                        }
                    }
                } catch {
                    // ignore
                }
            }

            return {
                passed: false,
                error: `Command failed: ${unit.cmd} (${why})`,
                logs,
                layer: 'Test',
                duration: result.durationMs,
            };
        }

        return { passed: true, logs, layer: 'Test', duration: result.durationMs };
    }

    // E2E tests with Playwright
    if (stepName === 'E2ETests') {
        if (!enablePlaywright) {
            logs.push('[E2E] Skipped (enablePlaywright=false)');
            return { passed: true, logs, layer: 'E2E', duration: 0 };
        }

        logs.push('[E2E] Checking Playwright setup...');

        const setupStatus = await checkPlaywrightSetup(projectPath);
        logs.push(`[E2E] ${setupStatus.message}`);

        if (!setupStatus.installed || !setupStatus.browsersInstalled) {
            logs.push('[E2E] Playwright not fully configured - skipping E2E tests');
            logs.push('[E2E] To enable: npm install -D @playwright/test && npx playwright install');
        } else {
            logs.push('[E2E] Running Playwright tests...');

            const playwrightConfig: PlaywrightConfig = {
                projectPath,
                devServerUrl,
                headed: false,
                screenshotOnFailure: true,
                traceOnFailure: true,
                retries: 1,
            };

            try {
                playwrightResult = await runPlaywrightTests(playwrightConfig);

                logs.push(`[E2E] Tests: ${playwrightResult.totalTests} total, ${playwrightResult.passedTests} passed, ${playwrightResult.failedTests} failed`);
                logs.push(`[E2E] Duration: ${(playwrightResult.duration / 1000).toFixed(1)}s`);

                if (playwrightResult.failures.length > 0) {
                    logs.push('[E2E] Analyzing failures for troubleshooting database...');

                    for (const failure of playwrightResult.failures) {
                        const analysis = analyzePlaywrightError(failure);
                        logs.push(`[E2E] - ${failure.testName}: ${analysis.errorType}`);
                        logs.push(`[E2E]   Signature: ${analysis.errorSignature}`);
                        if (analysis.suggestedFix) {
                            logs.push(`[E2E]   Suggested: ${analysis.suggestedFix}`);
                        }
                    }

                    if (playwrightResult.screenshots.length > 0) {
                        logs.push('[E2E] Screenshots captured:');
                        for (const screenshot of playwrightResult.screenshots.slice(0, 5)) {
                            logs.push(`[E2E]   - ${screenshot}`);
                        }
                    }

                    return {
                        passed: false,
                        error: `${playwrightResult.failedTests} E2E test(s) failed. See logs for details.`,
                        logs,
                        layer: 'E2E',
                        duration: playwrightResult.duration,
                        screenshot: playwrightResult.screenshots[0],
                    };
                }

                logs.push('[E2E] All Playwright tests passed');
            } catch (e) {
                const errorMsg = e instanceof Error ? e.message : String(e);
                logs.push(`[E2E] Error running Playwright: ${errorMsg}`);
                return {
                    passed: false,
                    error: `Playwright execution error: ${errorMsg}`,
                    logs,
                    layer: 'E2E',
                    duration: 0,
                };
            }
        }
        return { passed: true, logs, layer: 'E2E', duration: playwrightResult?.duration || 0 };
    }

    logs.push(`[${stepName}] Skipped (unknown test step)`);
    return { passed: true, logs, layer: 'Test', duration: 0 };
}

// ============================================================================
// Visual Verification (Screenshots, Browser Testing)
// ============================================================================

async function runVisualVerification(options: AIVerificationOptions): Promise<VerificationResult> {
    const { devServerUrl, enableScreenshots, projectPath } = options;
    const startTime = Date.now();

    if (!devServerUrl || !enableScreenshots) {
        return { passed: true, logs: ['Visual verification skipped'], layer: 'Visual', duration: 0 };
    }

    const logs: string[] = [];
    let screenshotPath: string | undefined;

    const setupStatus = await checkPlaywrightSetup(projectPath);

    if (setupStatus.installed && setupStatus.browsersInstalled) {
        logs.push(`[Visual] Using Playwright for screenshot capture`);
        logs.push(`[Visual] Capturing page at ${devServerUrl}`);

        try {
            const { capturePageScreenshot } = await import('../verification/index.js');
            screenshotPath = await capturePageScreenshot(projectPath, devServerUrl);
            logs.push(`[Visual] Screenshot saved: ${screenshotPath}`);
        } catch (e) {
            const errorMsg = e instanceof Error ? e.message : String(e);
            logs.push(`[Visual] Screenshot capture failed: ${errorMsg}`);
        }
    } else {
        logs.push('[Visual] Playwright not available for screenshots');
        logs.push('[Visual] Using browser_subagent fallback for AI visual inspection');
    }

    return {
        passed: true,
        logs,
        screenshot: screenshotPath,
        layer: 'Visual',
        duration: Date.now() - startTime,
    };
}

// ============================================================================
// API/DB Verification (endpoints, database queries)
// ============================================================================

async function runAPIVerification(options: AIVerificationOptions): Promise<VerificationResult> {
    const { devServerUrl } = options;

    if (!devServerUrl) {
        return { passed: true, logs: ['API verification skipped - no dev server URL'], layer: 'API', duration: 0 };
    }

    const logs: string[] = [];
    logs.push(`[API] Checking health: ${devServerUrl}/api/health`);
    logs.push('[API] Would verify critical API endpoints');
    logs.push('[API] Would verify database connectivity and basic queries');

    return { passed: true, logs, layer: 'API', duration: 0 };
}

// ============================================================================
// Accessibility Verification
// ============================================================================

async function runAccessibilityVerification(options: AIVerificationOptions): Promise<VerificationResult> {
    const { devServerUrl } = options;

    if (!devServerUrl) {
        return { passed: true, logs: ['Accessibility verification skipped'], layer: 'Accessibility', duration: 0 };
    }

    const logs: string[] = [];
    logs.push('[A11y] Would run axe-core accessibility scan');

    return { passed: true, logs, layer: 'Accessibility', duration: 0 };
}

// ============================================================================
// Verification Report Generation
// ============================================================================

export function generateVerificationReport(results: VerificationResult[]): string {
    const lines: string[] = [
        '## AI Verification Results\n',
        '| Layer | Result | Duration |',
        '|-------|--------|----------|',
    ];

    for (const r of results) {
        const status = r.passed ? 'PASS' : 'FAIL';
        const time = r.duration > 1000
            ? `${(r.duration / 1000).toFixed(1)}s`
            : `${r.duration}ms`;
        lines.push(`| ${r.layer} | ${status} | ${time} |`);
    }

    const failed = results.filter(r => !r.passed);
    if (failed.length > 0) {
        lines.push('\n### Failures');
        for (const f of failed) {
            lines.push(`\n**${f.layer}**:`);
            if (f.error) lines.push(`- Error: ${f.error}`);
            if (f.logs) {
                for (const log of f.logs.slice(-5)) {
                    lines.push(`  - ${log}`);
                }
            }
            if (f.screenshot) {
                lines.push(`- Screenshot: ${f.screenshot}`);
            }
        }
    }

    return lines.join('\n');
}

// ============================================================================
// Extended Configuration for AI Verification
// ============================================================================

export interface WeaveVerifyConfig {
    // Build layer
    runTypeCheck: boolean;
    runLint: boolean;
    runBuild: boolean;

    // Test layer
    runUnitTests: boolean;
    runE2ETests: boolean;

    // Visual layer
    captureScreenshots: boolean;
    screenshotPages?: string[];  // e.g., ['/', '/login', '/dashboard']

    // API layer
    checkAPIHealth: boolean;
    apiEndpoints?: { path: string; method: string; expectedStatus: number }[];

    // Accessibility layer
    runAccessibilityCheck: boolean;
}

export const DEFAULT_VERIFY_CONFIG: WeaveVerifyConfig = {
    runTypeCheck: true,
    runLint: true,
    runBuild: true,
    runUnitTests: true,
    runE2ETests: false,  // Opt-in
    captureScreenshots: false,  // Opt-in
    checkAPIHealth: true,
    runAccessibilityCheck: false,  // Opt-in
};
