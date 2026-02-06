/**
 * Environment Analysis Test Script
 * 
 * Tests the proactive environment analysis system.
 * Run: npx ts-node scripts/test-environment.ts
 */

import {
    analyzeEnvironment,
    detectEnvironment,
    getEnvironmentOneLiner,
    searchPhaseIssues,
    searchFeatureIssues,
    formatContextResults,
} from '../src/weave/environment/index.js';

async function main() {
    console.log('🔍 Weave Environment Analysis Test\n');
    console.log('='.repeat(60));

    // 1. Basic detection
    console.log('\n📋 1. Environment Detection');
    console.log('-'.repeat(40));
    const context = detectEnvironment();
    console.log('OS:', context.os);
    console.log('Shell:', context.shell);
    console.log('Node.js:', context.nodeVersion);
    console.log('Bun:', context.bunVersion || 'Not installed');
    console.log('Package Manager:', context.packageManager);
    console.log('Tech Stack:', context.stack.join(', ') || 'None detected');
    console.log('CWD:', context.cwd);

    // 2. One-liner
    console.log('\n📝 2. One-liner Summary');
    console.log('-'.repeat(40));
    console.log(getEnvironmentOneLiner(context));

    // 3. Full analysis
    console.log('\n⚠️  3. Full Analysis (with Issues)');
    console.log('-'.repeat(40));
    const analysis = await analyzeEnvironment({
        includeProjectHistory: false, // Skip DB lookup for test
    });

    console.log(`Found ${analysis.issues.length} potential issues:`);
    for (const issue of analysis.issues) {
        const icon = issue.severity === 'critical' ? '🔴' : issue.severity === 'warning' ? '🟡' : '🔵';
        console.log(`  ${icon} [${issue.id}] ${issue.title}`);
        console.log(`     Category: ${issue.category} | Source: ${issue.source}`);
    }

    // 4. Phase-specific search
    console.log('\n🎯 4. Phase-Specific Search');
    console.log('-'.repeat(40));
    const phaseIssues = await searchPhaseIssues(
        {
            phaseName: '로그인 구현',
            phaseId: 'P1',
            tasks: ['OAuth 연동', '세션 관리', '비밀번호 해싱'],
            doneWhen: '로그인/로그아웃 기능 완료',
        },
        context,
        { limit: 3 }
    );
    console.log(`Phase "로그인 구현" 관련 이슈: ${phaseIssues.length}건`);
    if (phaseIssues.length > 0) {
        console.log(formatContextResults(phaseIssues, 'Phase 관련 이슈'));
    } else {
        console.log('(DB에 기록된 이슈 없음 - 정상)');
    }

    // 5. Feature-specific search
    console.log('\n✨ 5. Feature-Specific Search');
    console.log('-'.repeat(40));
    const featureIssues = await searchFeatureIssues(
        {
            featureName: 'Prisma 마이그레이션',
            keywords: ['database', 'schema', 'migration'],
            relatedStack: ['Prisma', 'SQLite'],
        },
        context,
        { limit: 3 }
    );
    console.log(`Feature "Prisma 마이그레이션" 관련 이슈: ${featureIssues.length}건`);
    if (featureIssues.length > 0) {
        console.log(formatContextResults(featureIssues, 'Feature 관련 이슈'));
    } else {
        console.log('(DB에 기록된 이슈 없음 - 정상)');
    }

    // 6. Markdown summary
    console.log('\n📄 6. Markdown Summary');
    console.log('-'.repeat(40));
    console.log(analysis.summary);

    console.log('\n' + '='.repeat(60));
    console.log('✅ Environment analysis complete!');
}

main().catch(console.error);

