/**
 * Playwright E2E Testing Integration for Weave
 * 
 * Provides automated browser testing for web projects.
 * Integrates with the multi-layer verification system.
 * 
 * Key features:
 * - Auto-detection of Playwright installation
 * - Headless test execution with structured output parsing
 * - Screenshot capture on failure for visual debugging
 * - Test result integration with Global Knowledge RAG
 */

import { spawn, SpawnOptions } from 'child_process';
import { promises as fs } from 'fs';
import * as path from 'path';

// ============================================================================
// Types
// ============================================================================

export interface PlaywrightConfig {
    /** Project root directory */
    projectPath: string;

    /** Base URL for the dev server (e.g., "http://localhost:3000") */
    devServerUrl?: string;

    /** Run in headed mode for debugging */
    headed?: boolean;

    /** Specific test file or pattern to run */
    testMatch?: string;

    /** Browser(s) to test: 'chromium' | 'firefox' | 'webkit' | 'all' */
    browsers?: 'chromium' | 'firefox' | 'webkit' | 'all';

    /** Maximum timeout for tests in milliseconds */
    timeout?: number;

    /** Number of retries for flaky tests */
    retries?: number;

    /** Output directory for screenshots and traces */
    outputDir?: string;

    /** Capture screenshots on failure */
    screenshotOnFailure?: boolean;

    /** Record trace for debugging */
    traceOnFailure?: boolean;

    /** Update snapshots mode */
    updateSnapshots?: boolean;
}

export interface PlaywrightTestResult {
    passed: boolean;
    totalTests: number;
    passedTests: number;
    failedTests: number;
    skippedTests: number;
    duration: number;
    failures: PlaywrightFailure[];
    screenshots: string[];
    traces: string[];
    rawOutput: string;
}

export interface PlaywrightFailure {
    testName: string;
    file: string;
    error: string;
    expected?: string;
    actual?: string;
    screenshot?: string;
    trace?: string;
}

export interface PlaywrightSetupStatus {
    installed: boolean;
    version?: string;
    configExists: boolean;
    browsersInstalled: boolean;
    message: string;
}

// ============================================================================
// Setup & Detection
// ============================================================================

/**
 * Check if Playwright is properly set up in the project
 */
export async function checkPlaywrightSetup(projectPath: string): Promise<PlaywrightSetupStatus> {
    const result: PlaywrightSetupStatus = {
        installed: false,
        configExists: false,
        browsersInstalled: false,
        message: '',
    };

    // Check if @playwright/test is in package.json
    try {
        const packageJsonPath = path.join(projectPath, 'package.json');
        const packageJson = JSON.parse(await fs.readFile(packageJsonPath, 'utf-8'));
        const deps = { ...packageJson.dependencies, ...packageJson.devDependencies };

        if (deps['@playwright/test']) {
            result.installed = true;
            result.version = deps['@playwright/test'];
        }
    } catch {
        // package.json not found or parse error
    }

    // Check for playwright.config.ts or playwright.config.js
    const configFiles = [
        'playwright.config.ts',
        'playwright.config.js',
        'playwright.config.mjs',
    ];

    for (const configFile of configFiles) {
        try {
            await fs.access(path.join(projectPath, configFile));
            result.configExists = true;
            break;
        } catch {
            // Config file not found
        }
    }

    // Try to detect if browsers are installed by running playwright --version
    try {
        const versionOutput = await runCommand('npx', ['playwright', '--version'], projectPath);
        if (versionOutput.exitCode === 0) {
            result.browsersInstalled = true;
            result.version = versionOutput.stdout.trim();
        }
    } catch {
        // Playwright not available
    }

    // Generate message
    if (!result.installed) {
        result.message = 'Playwright is not installed. Run: npm install -D @playwright/test';
    } else if (!result.configExists) {
        result.message = 'Playwright config not found. Run: npx playwright init';
    } else if (!result.browsersInstalled) {
        result.message = 'Playwright browsers not installed. Run: npx playwright install';
    } else {
        result.message = `Playwright ${result.version} ready`;
    }

    return result;
}

/**
 * Initialize Playwright in a project
 */
export async function initPlaywright(projectPath: string): Promise<{
    success: boolean;
    message: string;
}> {
    // Check if already set up
    const status = await checkPlaywrightSetup(projectPath);
    if (status.installed && status.configExists && status.browsersInstalled) {
        return { success: true, message: 'Playwright is already set up' };
    }

    const steps: string[] = [];

    // Install @playwright/test if not present
    if (!status.installed) {
        const installResult = await runCommand('npm', ['install', '-D', '@playwright/test'], projectPath);
        if (installResult.exitCode !== 0) {
            return { success: false, message: `Failed to install Playwright: ${installResult.stderr}` };
        }
        steps.push('Installed @playwright/test');
    }

    // Initialize config if not present
    if (!status.configExists) {
        // Create a minimal configuration
        const config = generatePlaywrightConfig(projectPath);
        await fs.writeFile(path.join(projectPath, 'playwright.config.ts'), config);
        steps.push('Created playwright.config.ts');
    }

    // Install browsers
    if (!status.browsersInstalled) {
        const installResult = await runCommand('npx', ['playwright', 'install', '--with-deps', 'chromium'], projectPath);
        if (installResult.exitCode !== 0) {
            return { success: false, message: `Failed to install browsers: ${installResult.stderr}` };
        }
        steps.push('Installed Chromium browser');
    }

    // Create example test directory if it doesn't exist
    const testDir = path.join(projectPath, 'e2e');
    try {
        await fs.access(testDir);
    } catch {
        await fs.mkdir(testDir, { recursive: true });
        await fs.writeFile(
            path.join(testDir, 'example.spec.ts'),
            generateExampleTest()
        );
        steps.push('Created e2e/ directory with example test');
    }

    return {
        success: true,
        message: `Playwright setup complete:\n${steps.map(s => `  ✓ ${s}`).join('\n')}`,
    };
}

// ============================================================================
// Test Execution
// ============================================================================

/**
 * Run Playwright E2E tests
 */
export async function runPlaywrightTests(config: PlaywrightConfig): Promise<PlaywrightTestResult> {
    const { projectPath, headed, testMatch, browsers, timeout, retries, outputDir } = config;

    const args = ['playwright', 'test'];

    // Add options
    if (headed) {
        args.push('--headed');
    }

    if (testMatch) {
        args.push(testMatch);
    }

    if (browsers && browsers !== 'all') {
        args.push('--project', browsers);
    }

    if (timeout) {
        args.push('--timeout', timeout.toString());
    }

    if (retries !== undefined) {
        args.push('--retries', retries.toString());
    }

    if (outputDir) {
        args.push('--output', outputDir);
    }

    // JSON reporter for structured output
    args.push('--reporter', 'json');

    const startTime = Date.now();
    const result = await runCommand('npx', args, projectPath);
    const duration = Date.now() - startTime;

    // Parse JSON output
    return parsePlaywrightOutput(result.stdout, result.stderr, duration, projectPath);
}

/**
 * Run specific test file
 */
export async function runPlaywrightTestFile(
    projectPath: string,
    testFile: string,
    options?: Partial<PlaywrightConfig>
): Promise<PlaywrightTestResult> {
    return runPlaywrightTests({
        projectPath,
        testMatch: testFile,
        ...options,
    });
}

/**
 * Run tests with visual comparison
 */
export async function runVisualRegressionTests(
    projectPath: string,
    options?: Partial<PlaywrightConfig>
): Promise<PlaywrightTestResult> {
    const result = await runPlaywrightTests({
        projectPath,
        testMatch: '**/visual/**/*.spec.ts',
        screenshotOnFailure: true,
        ...options,
    });

    return result;
}

// ============================================================================
// Screenshot & Trace
// ============================================================================

/**
 * Capture a screenshot of the current page state
 */
export async function capturePageScreenshot(
    projectPath: string,
    url: string,
    outputPath?: string
): Promise<string> {
    // Generate inline script to capture screenshot
    const screenshotPath = outputPath || path.join(
        projectPath,
        '.weave',
        'screenshots',
        `capture-${Date.now()}.png`
    );

    // Ensure directory exists
    await fs.mkdir(path.dirname(screenshotPath), { recursive: true });

    const script = `
const { chromium } = require('playwright');
(async () => {
    const browser = await chromium.launch();
    const page = await browser.newPage();
    await page.goto('${url}');
    await page.screenshot({ path: '${screenshotPath.replace(/\\/g, '/')}', fullPage: true });
    await browser.close();
    console.log('Screenshot saved to: ${screenshotPath.replace(/\\/g, '/')}');
})();
`;

    const scriptPath = path.join(projectPath, '.weave', 'temp-screenshot.js');
    await fs.mkdir(path.dirname(scriptPath), { recursive: true });
    await fs.writeFile(scriptPath, script);

    const result = await runCommand('node', [scriptPath], projectPath);

    // Cleanup temp script
    try {
        await fs.unlink(scriptPath);
    } catch { /* ignore */ }

    if (result.exitCode !== 0) {
        throw new Error(`Screenshot capture failed: ${result.stderr}`);
    }

    return screenshotPath;
}

/**
 * Get list of screenshots from a test run
 */
export async function getTestScreenshots(projectPath: string): Promise<string[]> {
    const screenshotDirs = [
        path.join(projectPath, 'test-results'),
        path.join(projectPath, 'playwright-report'),
        path.join(projectPath, '.weave', 'screenshots'),
    ];

    const screenshots: string[] = [];

    for (const dir of screenshotDirs) {
        try {
            await collectScreenshots(dir, screenshots);
        } catch {
            // Directory not found or other error
        }
    }

    return screenshots;
}

/**
 * Recursively collect screenshot files from a directory
 */
async function collectScreenshots(dir: string, screenshots: string[]): Promise<void> {
    const entries = await fs.readdir(dir, { withFileTypes: true });

    for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);

        if (entry.isDirectory()) {
            await collectScreenshots(fullPath, screenshots);
        } else if (entry.isFile()) {
            if (entry.name.endsWith('.png') || entry.name.endsWith('.jpg')) {
                screenshots.push(fullPath);
            }
        }
    }
}

// ============================================================================
// Output Parsing
// ============================================================================

function parsePlaywrightOutput(
    stdout: string,
    stderr: string,
    duration: number,
    projectPath: string
): PlaywrightTestResult {
    const result: PlaywrightTestResult = {
        passed: true,
        totalTests: 0,
        passedTests: 0,
        failedTests: 0,
        skippedTests: 0,
        duration,
        failures: [],
        screenshots: [],
        traces: [],
        rawOutput: stdout + '\n' + stderr,
    };

    // Try to parse JSON output
    try {
        // Find JSON in output (might be mixed with other output)
        const jsonMatch = stdout.match(/\{[\s\S]*"suites"[\s\S]*\}/);
        if (jsonMatch) {
            const json = JSON.parse(jsonMatch[0]);

            result.totalTests = json.stats?.expected || 0;
            result.passedTests = json.stats?.expected || 0;
            result.failedTests = json.stats?.unexpected || 0;
            result.skippedTests = json.stats?.skipped || 0;
            result.passed = result.failedTests === 0;

            // Extract failures
            if (json.suites) {
                extractFailures(json.suites, result.failures);
            }
        }
    } catch {
        // Fallback: parse text output
        result.passed = !stderr.includes('failed') && !stdout.includes('failed');

        // Try to extract test counts from text
        const passedMatch = stdout.match(/(\d+) passed/);
        const failedMatch = stdout.match(/(\d+) failed/);
        const skippedMatch = stdout.match(/(\d+) skipped/);

        if (passedMatch) result.passedTests = parseInt(passedMatch[1], 10);
        if (failedMatch) result.failedTests = parseInt(failedMatch[1], 10);
        if (skippedMatch) result.skippedTests = parseInt(skippedMatch[1], 10);
        result.totalTests = result.passedTests + result.failedTests + result.skippedTests;

        // Extract failure details from stderr
        if (!result.passed) {
            const errorLines = stderr.split('\n').filter(line =>
                line.includes('Error') || line.includes('expect') || line.includes('Timeout')
            );
            if (errorLines.length > 0) {
                result.failures.push({
                    testName: 'Unknown test',
                    file: 'Unknown file',
                    error: errorLines.join('\n'),
                });
            }
        }
    }

    return result;
}

function extractFailures(suites: any[], failures: PlaywrightFailure[]): void {
    for (const suite of suites) {
        if (suite.suites) {
            extractFailures(suite.suites, failures);
        }
        if (suite.specs) {
            for (const spec of suite.specs) {
                if (spec.tests) {
                    for (const test of spec.tests) {
                        if (test.status === 'unexpected' || test.status === 'failed') {
                            failures.push({
                                testName: spec.title,
                                file: suite.file || 'Unknown file',
                                error: test.results?.[0]?.error?.message || 'Test failed',
                                expected: test.results?.[0]?.error?.expected,
                                actual: test.results?.[0]?.error?.actual,
                                screenshot: test.results?.[0]?.attachments?.find(
                                    (a: any) => a.name === 'screenshot'
                                )?.path,
                                trace: test.results?.[0]?.attachments?.find(
                                    (a: any) => a.name === 'trace'
                                )?.path,
                            });
                        }
                    }
                }
            }
        }
    }
}

// ============================================================================
// Error Analysis (for Global Knowledge RAG integration)
// ============================================================================

export interface PlaywrightErrorAnalysis {
    errorType: 'timeout' | 'assertion' | 'element' | 'network' | 'navigation' | 'script' | 'unknown';
    selector?: string;
    expectedValue?: string;
    actualValue?: string;
    url?: string;
    suggestedFix?: string;
    errorSignature: string;
}

/**
 * Analyze Playwright error for knowledge base indexing
 */
export function analyzePlaywrightError(failure: PlaywrightFailure): PlaywrightErrorAnalysis {
    const error = failure.error.toLowerCase();
    const analysis: PlaywrightErrorAnalysis = {
        errorType: 'unknown',
        errorSignature: '',
        suggestedFix: '',
    };

    // Timeout errors
    if (error.includes('timeout') || error.includes('exceeded')) {
        analysis.errorType = 'timeout';

        const selectorMatch = failure.error.match(/locator\(['"]([^'"]+)['"]\)/);
        if (selectorMatch) {
            analysis.selector = selectorMatch[1];
            analysis.suggestedFix = `Element "${analysis.selector}" not found in time. Check if the selector is correct or increase timeout.`;
        } else {
            analysis.suggestedFix = 'Page or action took too long. Check network conditions or increase timeout.';
        }

        analysis.errorSignature = `playwright:timeout:${analysis.selector || 'page'}`;
    }
    // Assertion errors
    else if (error.includes('expect') || error.includes('assertion')) {
        analysis.errorType = 'assertion';
        analysis.expectedValue = failure.expected;
        analysis.actualValue = failure.actual;
        analysis.suggestedFix = `Expected "${analysis.expectedValue}" but got "${analysis.actualValue}". Verify the application state or update the test.`;
        analysis.errorSignature = `playwright:assertion:${failure.testName}`;
    }
    // Element not found
    else if (error.includes('element') || error.includes('locator') || error.includes('selector')) {
        analysis.errorType = 'element';

        const selectorMatch = failure.error.match(/['"]([^'"]+)['"]/);
        if (selectorMatch) {
            analysis.selector = selectorMatch[1];
        }

        analysis.suggestedFix = 'Element not found. Check if the selector is correct and the element exists in the DOM.';
        analysis.errorSignature = `playwright:element:${analysis.selector || 'unknown'}`;
    }
    // Network errors
    else if (error.includes('net::') || error.includes('network') || error.includes('fetch')) {
        analysis.errorType = 'network';
        analysis.suggestedFix = 'Network request failed. Check if the server is running and accessible.';
        analysis.errorSignature = 'playwright:network:failed';
    }
    // Navigation errors
    else if (error.includes('navigation') || error.includes('goto')) {
        analysis.errorType = 'navigation';

        const urlMatch = failure.error.match(/https?:\/\/[^\s'"]+/);
        if (urlMatch) {
            analysis.url = urlMatch[0];
        }

        analysis.suggestedFix = `Navigation to "${analysis.url}" failed. Check if the URL is correct and the server is running.`;
        analysis.errorSignature = `playwright:navigation:${analysis.url || 'unknown'}`;
    }
    // Script errors
    else if (error.includes('script') || error.includes('evaluate')) {
        analysis.errorType = 'script';
        analysis.suggestedFix = 'JavaScript error in the page. Check browser console for details.';
        analysis.errorSignature = 'playwright:script:error';
    }
    else {
        analysis.errorSignature = `playwright:unknown:${failure.testName}`;
        analysis.suggestedFix = 'Unknown error. Check the full error message and screenshots for more details.';
    }

    return analysis;
}

// ============================================================================
// Config Generation
// ============================================================================

function generatePlaywrightConfig(projectPath: string): string {
    return `import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright E2E Test Configuration
 * Generated by Maskweaver Weave
 * 
 * @see https://playwright.dev/docs/test-configuration
 */
export default defineConfig({
  // Test directory
  testDir: './e2e',

  // Run tests in parallel
  fullyParallel: true,

  // Fail the build on test.only in CI
  forbidOnly: !!process.env.CI,

  // Retry on CI only
  retries: process.env.CI ? 2 : 0,

  // Number of workers
  workers: process.env.CI ? 1 : undefined,

  // Reporter
  reporter: [
    ['html', { open: 'never' }],
    ['json', { outputFile: 'test-results/results.json' }],
  ],

  // Shared settings for all projects
  use: {
    // Base URL for navigation
    baseURL: 'http://localhost:3000',

    // Collect trace when retrying
    trace: 'on-first-retry',

    // Screenshot on failure
    screenshot: 'only-on-failure',

    // Record video on failure
    video: 'on-first-retry',
  },

  // Configure projects for browsers
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    // Uncomment for additional browsers
    // {
    //   name: 'firefox',
    //   use: { ...devices['Desktop Firefox'] },
    // },
    // {
    //   name: 'webkit',
    //   use: { ...devices['Desktop Safari'] },
    // },
    // Mobile testing
    // {
    //   name: 'mobile-chrome',
    //   use: { ...devices['Pixel 5'] },
    // },
  ],

  // Run local dev server before tests
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
    timeout: 120 * 1000,
  },
});
`;
}

function generateExampleTest(): string {
    return `import { test, expect } from '@playwright/test';

/**
 * Example E2E Test
 * Generated by Maskweaver Weave
 *
 * Run with: npx playwright test
 */

test.describe('Application', () => {
  test('should load home page', async ({ page }) => {
    // Navigate to home
    await page.goto('/');

    // Check if page loaded
    await expect(page).toHaveTitle(/.+/);
  });

  test('should have working navigation', async ({ page }) => {
    await page.goto('/');

    // Example: check for a navigation element
    const nav = page.locator('nav');
    // await expect(nav).toBeVisible();
  });
});

test.describe('Visual Regression', () => {
  test('home page screenshot', async ({ page }) => {
    await page.goto('/');
    
    // Wait for any animations to complete
    await page.waitForTimeout(1000);
    
    // Take a screenshot for visual comparison
    await expect(page).toHaveScreenshot('home.png', {
      fullPage: true,
      // Allow 0.2% pixel difference for anti-aliasing
      maxDiffPixelRatio: 0.002,
    });
  });
});
`;
}

// ============================================================================
// Utility: Command Runner
// ============================================================================

interface CommandResult {
    exitCode: number;
    stdout: string;
    stderr: string;
}

async function runCommand(
    command: string,
    args: string[],
    cwd: string
): Promise<CommandResult> {
    return new Promise((resolve) => {
        const options: SpawnOptions = {
            cwd,
            shell: true,
            stdio: 'pipe',
        };

        const proc = spawn(command, args, options);

        let stdout = '';
        let stderr = '';

        proc.stdout?.on('data', (data) => {
            stdout += data.toString();
        });

        proc.stderr?.on('data', (data) => {
            stderr += data.toString();
        });

        proc.on('close', (code) => {
            resolve({
                exitCode: code ?? 1,
                stdout,
                stderr,
            });
        });

        proc.on('error', (error) => {
            resolve({
                exitCode: 1,
                stdout: '',
                stderr: error.message,
            });
        });
    });
}

// ============================================================================
// Exports
// ============================================================================

export {
    generatePlaywrightConfig,
    generateExampleTest,
};
