/**
 * Weave Verification System
 * 
 * Multi-layer AI verification for zero-defect development.
 * Exports platform-specific verification integrations.
 */

// Playwright E2E Testing (Web)
export {
    // Setup & Detection
    checkPlaywrightSetup,
    initPlaywright,

    // Test Execution
    runPlaywrightTests,
    runPlaywrightTestFile,
    runVisualRegressionTests,

    // Screenshots
    capturePageScreenshot,
    getTestScreenshots,

    // Error Analysis (for Global Knowledge RAG)
    analyzePlaywrightError,

    // Config Generation
    generatePlaywrightConfig,
    generateExampleTest,

    // Types
    type PlaywrightConfig,
    type PlaywrightTestResult,
    type PlaywrightFailure,
    type PlaywrightSetupStatus,
    type PlaywrightErrorAnalysis,
} from './playwright.js';

// Generic build/test command recommendations
export {
    recommendVerificationCommands,
    formatRecommendedCommandsAsBash,
    type VerificationCommandRecommendation,
    type VerificationCommandStep,
    type DetectedProjectType,
} from './commands.js';
