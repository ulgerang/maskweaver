/**
 * Weave Workflow Test Script
 * 
 * Run with: npx tsx test/weave-demo.ts
 * Or: bun test/weave-demo.ts
 */

import {
    GlobalKnowledge,
    recordTroubleshooting,
    searchTroubleshooting
} from '../dist/weave/index.js';

async function main() {
    console.log('🌀 Weave Workflow Demo\n');
    console.log('='.repeat(50));

    // 1. Test Global Knowledge Base
    console.log('\n📚 1. Testing Global Knowledge Base...\n');

    const knowledge = new GlobalKnowledge();
    await knowledge.init();

    // Record a sample troubleshooting entry
    const testId = await recordTroubleshooting({
        errorMessage: "Cannot find module 'react-dom/client'",
        context: "React 18 migration issue - createRoot import",
        solution: "Update the import from 'react-dom' to 'react-dom/client':\nimport { createRoot } from 'react-dom/client';",
        projectType: 'react',
        effectiveness: 9,
    });
    console.log(`✅ Recorded solution with ID: ${testId}`);

    // Search for similar issues
    console.log('\n🔍 Searching for similar issues...');
    const results = await searchTroubleshooting("react-dom module not found", {
        projectType: 'react',
        limit: 3
    });

    console.log(`Found ${results.length} solutions:`);
    for (const { entry, score, matchType } of results) {
        console.log(`  - [${matchType}] Score: ${(score * 100).toFixed(0)}%`);
        console.log(`    Context: ${entry.context}`);
        console.log(`    Solution: ${entry.solution.substring(0, 50)}...`);
    }

    // Get stats
    const stats = await knowledge.getStats();
    console.log(`\n📊 Knowledge Base Stats:`);
    console.log(`  - Total entries: ${stats.totalEntries}`);
    console.log(`  - Avg effectiveness: ${stats.averageEffectiveness?.toFixed(1) || 'N/A'}`);

    // 2. Show available Weave exports
    console.log('\n' + '='.repeat(50));
    console.log('\n🧵 2. Available Weave Exports:\n');

    const weaveExports = [
        'intake - Document analysis',
        'plan - Phase planning',
        'execute - Phase execution with verification',
        'handoff - User handoff with checklist',
        'PhaseManager - Phase state management',
        'WeaveOrchestrator - Mask auto-selection',
        'GlobalKnowledge - Cross-project troubleshooting',
        'Playwright utilities - E2E testing integration',
    ];

    for (const exp of weaveExports) {
        console.log(`  ✓ ${exp}`);
    }

    console.log('\n' + '='.repeat(50));
    console.log('\n✅ Weave Demo Complete!\n');
    console.log('🚀 To use Weave in OpenCode:');
    console.log('   @maskweaver weave design docs/');
    console.log('   @maskweaver weave craft P1');
    console.log('   @maskweaver weave status');
}

main().catch(console.error);
