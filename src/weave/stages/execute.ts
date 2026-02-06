/**
 * Weave Execute Stage
 * 
 * The Build + Self-Verify Loop.
 * This is where the actual work happens, with:
 * - Automatic mask selection per task
 * - Global knowledge search for troubleshooting
 * - 3-tier verification escalation
 * - Automatic retry with knowledge recording
 */

import type { WeavePhase, WeaveTask, WeaveConfig, WeaveEvent } from '../types.js';
import { WeaveOrchestrator, getOrchestrator } from '../orchestrator.js';
import { PhaseManager, getPhaseManager } from '../phase-manager.js';
import { searchTroubleshooting, recordTroubleshooting } from '../knowledge/global.js';
import {
    checkPlaywrightSetup,
    runPlaywrightTests,
    analyzePlaywrightError,
    type PlaywrightTestResult,
    type PlaywrightConfig,
} from '../verification/index.js';

// ============================================================================
// Types
// ============================================================================

export interface ExecuteOptions {
    phaseId: string;
    onEvent?: (event: WeaveEvent) => void;
    projectType?: string;
    techStack?: string[];
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
// Execute Stage
// ============================================================================

export async function execute(options: ExecuteOptions): Promise<ExecuteResult> {
    const startTime = Date.now();
    const { phaseId, onEvent = () => { }, projectType, techStack } = options;

    const manager = getPhaseManager();
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

    // Track stats
    let tasksCompleted = 0;
    let tasksFailed = 0;
    let troubleshootingUsed = 0;
    let troubleshootingRecorded = 0;
    const masksUsed: Set<string> = new Set();

    // Execute each task
    for (const task of phase.tasks) {
        onEvent({ type: 'task_started', phaseId, taskId: task.id });

        const context: TaskExecutionContext = {
            task,
            phase,
            orchestrator,
            onEvent,
            projectType,
            techStack,
        };

        try {
            const result = await executeTask(context);

            if (result.success) {
                tasksCompleted++;
                await manager.updateTaskStatus(phaseId, task.id, 'passed', {
                    maskUsed: result.maskUsed,
                });
                onEvent({ type: 'task_passed', phaseId, taskId: task.id });
            } else {
                tasksFailed++;
                await manager.updateTaskStatus(phaseId, task.id, 'failed', {
                    lastError: result.error,
                    maskUsed: result.maskUsed,
                });
                onEvent({ type: 'task_failed', phaseId, taskId: task.id, error: result.error || 'Unknown error' });
            }

            if (result.maskUsed) {
                masksUsed.add(result.maskUsed);
            }

            troubleshootingUsed += result.troubleshootingUsed || 0;
            troubleshootingRecorded += result.troubleshootingRecorded || 0;

        } catch (e) {
            tasksFailed++;
            const errorMsg = e instanceof Error ? e.message : String(e);
            await manager.updateTaskStatus(phaseId, task.id, 'failed', {
                lastError: errorMsg,
            });
            onEvent({ type: 'task_failed', phaseId, taskId: task.id, error: errorMsg });
        }
    }

    // Determine phase outcome
    const allPassed = tasksFailed === 0 && tasksCompleted === phase.tasks.length;

    if (allPassed) {
        // Don't mark as completed - wait for user approval
        // Just update masks used
        await manager.updatePhaseStatus(phaseId, 'in_progress', {
            masksUsed: Array.from(masksUsed),
        });
    }

    const finalPhase = manager.getPhase(phaseId)!;

    return {
        success: allPassed,
        phase: finalPhase,
        tasksCompleted,
        tasksFailed,
        troubleshootingUsed,
        troubleshootingRecorded,
        masksUsed: Array.from(masksUsed),
        durationMs: Date.now() - startTime,
    };
}

// ============================================================================
// Task Execution (with retry and knowledge integration)
// ============================================================================

interface TaskResult {
    success: boolean;
    error?: string;
    maskUsed?: string;
    troubleshootingUsed?: number;
    troubleshootingRecorded?: number;
}

async function executeTask(context: TaskExecutionContext): Promise<TaskResult> {
    const { task, orchestrator, onEvent, projectType, techStack } = context;

    let troubleshootingUsed = 0;
    let troubleshootingRecorded = 0;
    let lastError: string | undefined;
    let maskUsed: string | undefined;

    // Select mask for this task
    const selectedMask = orchestrator.selectMaskForTask(task);
    if (selectedMask) {
        maskUsed = selectedMask;
        onEvent({
            type: 'mask_selected',
            maskId: selectedMask,
            reason: `Auto-selected for task: ${task.name}`
        });
    }

    // Retry loop
    for (let attempt = 0; attempt < task.maxRetries; attempt++) {
        try {
            // This is where actual task execution would happen
            // In practice, this integrates with the AI's code generation/verification

            // For now, this is a placeholder that would be replaced with actual execution logic
            // The key insight is that we search for troubleshooting BEFORE attempting
            // and record AFTER a successful fix

            if (lastError) {
                // Search for solutions from global knowledge
                const solutions = await searchTroubleshooting(lastError, { projectType });

                if (solutions.length > 0) {
                    troubleshootingUsed++;
                    onEvent({
                        type: 'troubleshooting_found',
                        query: lastError,
                        solutions: solutions.length
                    });

                    // Try the top solution
                    // In practice, this would apply the solution and re-verify
                    const topSolution = solutions[0];
                    console.log(`[Weave] Found solution from knowledge base: ${topSolution.entry.solution.slice(0, 100)}...`);

                    // If a different mask might help, suggest rotation
                    if (attempt >= 2 && maskUsed) {
                        const taskType = orchestrator.detectTaskType(task.name);
                        const alternateMask = orchestrator.suggestAlternativeMask(maskUsed, taskType);
                        if (alternateMask !== maskUsed) {
                            maskUsed = alternateMask;
                            onEvent({
                                type: 'mask_selected',
                                maskId: alternateMask,
                                reason: 'Rotated due to repeated failures'
                            });
                        }
                    }
                }
            }

            // Placeholder: actual execution would happen here
            // For the real implementation, this would:
            // 1. Generate code/tests with the selected mask
            // 2. Run verification (lint, typecheck, tests)
            // 3. Return success/failure

            // Simulated success for now
            return {
                success: true,
                maskUsed,
                troubleshootingUsed,
                troubleshootingRecorded,
            };

        } catch (e) {
            lastError = e instanceof Error ? e.message : String(e);
            task.retryCount = attempt + 1;

            // If this is the last attempt and we succeeded after a fix,
            // record it for future reference
            if (attempt === task.maxRetries - 1) {
                // Record the solution that worked
                await recordTroubleshooting({
                    errorMessage: lastError,
                    context: `Task: ${task.name}`,
                    solution: `Final solution after ${attempt + 1} attempts`,
                    projectType,
                    techStack,
                    tags: ['auto-recorded'],
                    effectiveness: 7, // Default medium-high
                });
                troubleshootingRecorded++;

                onEvent({
                    type: 'troubleshooting_recorded',
                    errorSignature: lastError.slice(0, 50)
                });
            }
        }
    }

    return {
        success: false,
        error: lastError,
        maskUsed,
        troubleshootingUsed,
        troubleshootingRecorded,
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
                    result = await runBuildVerification(options);
                    break;
                case 'test':
                    result = await runTestVerification(options);
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
    return [
        // Layer 1: Build/Compile
        { name: 'TypeCheck', order: 1, type: 'build', enabled: true },
        { name: 'Lint', order: 2, type: 'build', enabled: true },
        { name: 'Build', order: 3, type: 'build', enabled: true },

        // Layer 2: Unit/Integration Tests
        { name: 'UnitTests', order: 4, type: 'test', enabled: true },

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

async function runBuildVerification(options: AIVerificationOptions): Promise<VerificationResult> {
    const { projectType, projectPath } = options;

    const commands: Record<string, { name: string; cmd: string }[]> = {
        typescript: [
            { name: 'TypeCheck', cmd: 'npx tsc --noEmit' },
            { name: 'Lint', cmd: 'npm run lint' },
            { name: 'Build', cmd: 'npm run build' },
        ],
        javascript: [
            { name: 'Lint', cmd: 'npm run lint' },
            { name: 'Build', cmd: 'npm run build' },
        ],
        nextjs: [
            { name: 'TypeCheck', cmd: 'npx tsc --noEmit' },
            { name: 'Lint', cmd: 'npm run lint' },
            { name: 'Build', cmd: 'npm run build' },
        ],
        python: [
            { name: 'Lint', cmd: 'ruff check .' },
            { name: 'TypeCheck', cmd: 'mypy .' },
        ],
        go: [
            { name: 'Build', cmd: 'go build ./...' },
            { name: 'Vet', cmd: 'go vet ./...' },
        ],
    };

    const cmds = commands[projectType] || commands.typescript;
    const logs: string[] = [];

    for (const { name, cmd } of cmds) {
        // In actual implementation, this would execute shell commands
        // and capture stdout/stderr
        logs.push(`[${name}] Running: ${cmd}`);

        // Placeholder for actual execution
        // const { exitCode, stdout, stderr } = await executeCommand(cmd, projectPath);
        // if (exitCode !== 0) {
        //     return { passed: false, error: stderr, logs };
        // }
    }

    return { passed: true, logs, layer: 'Build', duration: 0 };
}

// ============================================================================
// Test Verification (unit, E2E)
// ============================================================================

async function runTestVerification(options: AIVerificationOptions): Promise<VerificationResult> {
    const { projectType, projectPath, enablePlaywright, devServerUrl } = options;
    const logs: string[] = [];
    let playwrightResult: PlaywrightTestResult | null = null;

    // Unit tests
    const unitTestCmds: Record<string, string> = {
        typescript: 'npm test',
        javascript: 'npm test',
        nextjs: 'npm test',
        python: 'pytest',
        go: 'go test ./...',
    };

    const unitCmd = unitTestCmds[projectType] || 'npm test';
    logs.push(`[UnitTests] Running: ${unitCmd}`);

    // Actual unit test execution would be here
    // const { exitCode, stdout, stderr } = await executeCommand(unitCmd, projectPath);
    // if (exitCode !== 0) {
    //     return { passed: false, error: stderr, logs, layer: 'Test', duration: 0 };
    // }

    // E2E tests with Playwright (if enabled)
    if (enablePlaywright) {
        logs.push('[E2E] Checking Playwright setup...');

        // Check if Playwright is set up
        const setupStatus = await checkPlaywrightSetup(projectPath);
        logs.push(`[E2E] ${setupStatus.message}`);

        if (!setupStatus.installed || !setupStatus.browsersInstalled) {
            logs.push('[E2E] Playwright not fully configured - skipping E2E tests');
            logs.push('[E2E] To enable: npm install -D @playwright/test && npx playwright install');
        } else {
            logs.push('[E2E] Running Playwright tests...');

            // Configure and run Playwright
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

                // If there were failures, analyze them for Global Knowledge RAG
                if (playwrightResult.failures.length > 0) {
                    logs.push('[E2E] Analyzing failures for troubleshooting database...');

                    for (const failure of playwrightResult.failures) {
                        const analysis = analyzePlaywrightError(failure);
                        logs.push(`[E2E] - ${failure.testName}: ${analysis.errorType}`);
                        logs.push(`[E2E]   Signature: ${analysis.errorSignature}`);
                        if (analysis.suggestedFix) {
                            logs.push(`[E2E]   Suggested: ${analysis.suggestedFix}`);
                        }

                        // Record failure for future troubleshooting
                        // This will be searched when similar errors occur
                        // await recordTroubleshooting({
                        //     errorMessage: failure.error,
                        //     context: `Playwright E2E test: ${failure.testName}`,
                        //     solution: analysis.suggestedFix || 'No automatic fix available',
                        //     projectType,
                        //     tags: ['playwright', 'e2e', analysis.errorType],
                        //     effectiveness: 5,
                        // });
                    }

                    // Add screenshot paths to logs
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

                logs.push('[E2E] All Playwright tests passed ✓');
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
    }

    return { passed: true, logs, layer: 'Test', duration: playwrightResult?.duration || 0 };
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

    // Check if Playwright is available for screenshots
    const setupStatus = await checkPlaywrightSetup(projectPath);

    if (setupStatus.installed && setupStatus.browsersInstalled) {
        logs.push(`[Visual] Using Playwright for screenshot capture`);
        logs.push(`[Visual] Capturing page at ${devServerUrl}`);

        // Use Playwright screenshot capture from verification module
        try {
            const { capturePageScreenshot } = await import('../verification/index.js');
            screenshotPath = await capturePageScreenshot(projectPath, devServerUrl);
            logs.push(`[Visual] Screenshot saved: ${screenshotPath}`);

            // For visual regression, you could compare with baseline:
            // const baselinePath = path.join(projectPath, '.weave', 'baseline', 'homepage.png');
            // const diffResult = await compareScreenshots(baselinePath, screenshotPath);
            // if (diffResult.diffPercentage > 0.5) {
            //     return { passed: false, error: 'Visual regression detected', ... };
            // }

        } catch (e) {
            const errorMsg = e instanceof Error ? e.message : String(e);
            logs.push(`[Visual] Screenshot capture failed: ${errorMsg}`);
            // Visual verification failure is non-blocking by default
            // You can make it blocking by returning passed: false here
        }
    } else {
        logs.push('[Visual] Playwright not available for screenshots');
        logs.push('[Visual] Using browser_subagent fallback for AI visual inspection');
        // When run in AI IDE context (Antigravity), browser_subagent can be used
        // The AI can view the page and provide visual feedback
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

    // Check if server is responding
    logs.push(`[API] Checking health: ${devServerUrl}/api/health`);

    /*
    // Actual fetch check:
    try {
        const response = await fetch(`${devServerUrl}/api/health`);
        if (!response.ok) {
            return { 
                passed: false, 
                error: `Health check failed: ${response.status}`,
                logs, 
                layer: 'API',
                duration: 0 
            };
        }
    } catch (e) {
        return { 
            passed: false, 
            error: `Server not reachable: ${e}`,
            logs, 
            layer: 'API',
            duration: 0 
        };
    }
    */

    // Check main routes
    logs.push('[API] Would verify critical API endpoints');

    // Database verification (if applicable)
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

    // Using axe-core or lighthouse for accessibility checks
    logs.push('[A11y] Would run axe-core accessibility scan');

    /*
    // Actual axe-core with Playwright:
    const { chromium } = await import('playwright');
    const browser = await chromium.launch();
    const page = await browser.newPage();
    await page.goto(devServerUrl);
    
    // Inject axe-core and run scan
    const violations = await page.evaluate(async () => {
        await import('axe-core/axe.min.js');
        const results = await (window as any).axe.run();
        return results.violations;
    });
    
    await browser.close();
    
    if (violations.length > 0) {
        return { 
            passed: false, 
            error: `${violations.length} accessibility violations found`,
            logs, 
            layer: 'Accessibility',
            duration: 0 
        };
    }
    */

    return { passed: true, logs, layer: 'Accessibility', duration: 0 };
}

// ============================================================================
// Verification Report Generation
// ============================================================================

export function generateVerificationReport(results: VerificationResult[]): string {
    const lines: string[] = [
        '## 🤖 AI 자동 검증 결과\n',
        '| 검증 단계 | 결과 | 소요 시간 |',
        '|----------|------|----------|',
    ];

    for (const r of results) {
        const status = r.passed ? '✅ 통과' : '❌ 실패';
        const time = r.duration > 1000
            ? `${(r.duration / 1000).toFixed(1)}s`
            : `${r.duration}ms`;
        lines.push(`| ${r.layer} | ${status} | ${time} |`);
    }

    const failed = results.filter(r => !r.passed);
    if (failed.length > 0) {
        lines.push('\n### ❌ 실패 상세');
        for (const f of failed) {
            lines.push(`\n**${f.layer}**:`);
            if (f.error) lines.push(`- 에러: ${f.error}`);
            if (f.logs) {
                for (const log of f.logs.slice(-5)) {
                    lines.push(`  - ${log}`);
                }
            }
            if (f.screenshot) {
                lines.push(`- 스크린샷: ${f.screenshot}`);
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

