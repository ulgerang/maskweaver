/**
 * Weave Handoff Stage
 * 
 * User handoff after AI verification is complete.
 * Integrates with retrospect for session analysis.
 */

import type { WeavePhase, WeavePlan, WeaveEvent } from '../types.js';
import { PhaseManager, getPhaseManager } from '../phase-manager.js';

// ============================================================================
// Types
// ============================================================================

export interface HandoffOptions {
    phaseId: string;
    devUrl?: string;
    screenshotPath?: string;
    testResults?: TestResults;
    onEvent?: (event: WeaveEvent) => void;
}

export interface TestResults {
    unitTests?: { passed: number; failed: number; total: number };
    e2eTests?: { passed: number; failed: number; total: number };
    buildStatus?: 'success' | 'failed';
    lintStatus?: 'success' | 'failed' | 'warnings';
    coveragePercent?: number;
}

export interface HandoffResult {
    phase: WeavePhase;
    message: string;
    checklist: string[];
    humanOnlyChecks: string[];
    nextSteps: string[];
}

export type UserResponse = 'approve' | 'changes' | 'later';

// ============================================================================
// Handoff Message Generation
// ============================================================================

function generateHandoffMessage(
    phase: WeavePhase,
    devUrl?: string,
    testResults?: TestResults
): string {
    const lines: string[] = [];

    lines.push(`## ✅ Phase ${phase.id} 검증 완료!`);
    lines.push('');

    // Test results section
    if (testResults) {
        lines.push('### 🤖 AI 자동 테스트 결과');
        lines.push('');
        lines.push('| 테스트 | 결과 | 상세 |');
        lines.push('|--------|------|------|');

        if (testResults.buildStatus) {
            const icon = testResults.buildStatus === 'success' ? '✅' : '❌';
            lines.push(`| Build | ${icon} ${testResults.buildStatus} | - |`);
        }

        if (testResults.lintStatus) {
            const icon = testResults.lintStatus === 'success' ? '✅' :
                testResults.lintStatus === 'warnings' ? '⚠️' : '❌';
            lines.push(`| Lint | ${icon} ${testResults.lintStatus} | - |`);
        }

        if (testResults.unitTests) {
            const { passed, total } = testResults.unitTests;
            const icon = passed === total ? '✅' : '❌';
            lines.push(`| Unit Tests | ${icon} | ${passed}/${total} passed |`);
        }

        if (testResults.e2eTests) {
            const { passed, total } = testResults.e2eTests;
            const icon = passed === total ? '✅' : '❌';
            lines.push(`| E2E Tests | ${icon} | ${passed}/${total} passed |`);
        }

        if (testResults.coveragePercent !== undefined) {
            const icon = testResults.coveragePercent >= 80 ? '✅' :
                testResults.coveragePercent >= 60 ? '⚠️' : '❌';
            lines.push(`| Coverage | ${icon} | ${testResults.coveragePercent}% |`);
        }

        lines.push('');
    }

    // Access URL
    if (devUrl) {
        lines.push('### 🔗 접속');
        lines.push(devUrl);
        lines.push('');
    }

    // Checklist
    lines.push('### 📋 확인 체크리스트');
    for (const item of phase.checklist) {
        lines.push(`- [ ] ${item}`);
    }
    lines.push('');

    // Human-only checks
    lines.push('### 👤 사람만 판단 가능한 것');
    lines.push('');
    lines.push('AI가 객관적으로 측정할 수 없는 주관적 판단:');
    lines.push('');
    lines.push('- [ ] **느낌**: 전체적인 디자인 느낌이 의도대로인가요?');
    lines.push('- [ ] **사용성**: 실제로 써보니 편한가요?');
    lines.push('- [ ] **비즈니스 의도**: 원래 원하던 게 이게 맞나요?');
    lines.push('');

    // Response options
    lines.push('### 👆 확인 후 알려주세요');
    lines.push('');
    lines.push('**[Approve]** - 다음 Phase로');
    lines.push('**[Changes]** - 수정 필요 (뭘 바꿀지 알려주세요)');
    lines.push('**[Later]** - 나중에');

    return lines.join('\n');
}

// ============================================================================
// Main Handoff Function
// ============================================================================

export async function handoff(options: HandoffOptions): Promise<HandoffResult> {
    const { phaseId, devUrl, testResults, onEvent = () => { } } = options;

    const manager = getPhaseManager();
    await manager.loadPlan();
    const phase = manager.getPhase(phaseId);

    if (!phase) {
        throw new Error(`Phase not found: ${phaseId}`);
    }

    // Generate handoff message
    const message = generateHandoffMessage(phase, devUrl, testResults);

    // Human-only checks (AI cannot verify these)
    const humanOnlyChecks = [
        '전체적인 디자인 느낌이 의도대로인가요?',
        '실제로 써보니 편한가요?',
        '원래 원하던 게 이게 맞나요?',
    ];

    // Next steps based on phase
    const stats = manager.getStats();
    const nextPhase = manager.getNextPhase();
    const nextSteps: string[] = [];

    if (nextPhase) {
        nextSteps.push(`다음 Phase를 시작하려면: /weave craft ${nextPhase.id}`);
    }
    nextSteps.push('전체 상태를 확인하려면: /weave status');

    // Emit event
    onEvent({ type: 'user_handoff', phaseId, checklist: phase.checklist });

    return {
        phase,
        message,
        checklist: phase.checklist,
        humanOnlyChecks,
        nextSteps,
    };
}

// ============================================================================
// Response Handling
// ============================================================================

export async function handleUserResponse(
    phaseId: string,
    response: UserResponse,
    feedback?: string
): Promise<{ message: string; nextAction?: string }> {
    const manager = getPhaseManager();
    await manager.loadPlan();

    const phase = manager.getPhase(phaseId);
    if (!phase) {
        throw new Error(`Phase not found: ${phaseId}`);
    }

    switch (response) {
        case 'approve': {
            // Mark phase as completed
            await manager.updatePhaseStatus(phaseId, 'completed');

            // TODO: Trigger retrospect for mask effectiveness analysis
            // await performRetrospect({ trigger: 'phase_complete', phaseId, ... });

            const nextPhase = manager.getNextPhase();
            const stats = manager.getStats();

            let message = `✅ Phase ${phaseId} 승인 완료!\n\n`;
            message += `진행률: ${stats.progress}% (${stats.completedPhases}/${stats.totalPhases})\n\n`;

            if (nextPhase) {
                message += `다음 Phase를 시작하려면:\n\`\`\`\n/weave craft ${nextPhase.id}\n\`\`\``;
                return { message, nextAction: `/weave craft ${nextPhase.id}` };
            } else {
                message += `🎉 모든 Phase가 완료되었습니다!`;
                return { message };
            }
        }

        case 'changes': {
            const message = feedback
                ? `알겠습니다. 다음 사항을 수정하겠습니다:\n\n${feedback}\n\n수정 후 다시 검증하겠습니다.`
                : `수정이 필요하시군요. 어떤 부분을 바꿔야 할지 알려주세요.`;

            return { message, nextAction: 'await_feedback' };
        }

        case 'later': {
            // Keep phase in progress
            const message = `⏸ 일시 중지합니다.\n\n나중에 이어하려면:\n\`\`\`\n/weave craft ${phaseId}\n\`\`\``;

            return { message };
        }
    }
}

// ============================================================================
// Status Report
// ============================================================================

export async function generateStatusReport(): Promise<string> {
    const manager = getPhaseManager();
    const plan = await manager.loadPlan();

    if (!plan) {
        return '📋 아직 계획이 없습니다.\n\n시작하려면: `/weave design [docs-path]`';
    }

    const stats = manager.getStats();
    const lines: string[] = [];

    lines.push(`## 📊 Weave 진행 상황`);
    lines.push('');
    lines.push(`**프로젝트**: ${plan.projectName}`);
    lines.push(`**진행률**: ${stats.progress}%`);
    lines.push('');

    // Progress bar
    const filled = Math.round(stats.progress / 5);
    const empty = 20 - filled;
    lines.push(`[${'█'.repeat(filled)}${'░'.repeat(empty)}] ${stats.completedPhases}/${stats.totalPhases}`);
    lines.push('');

    // Phase list
    lines.push('### Phases');
    lines.push('');

    for (const phase of plan.phases) {
        let icon: string;
        switch (phase.status) {
            case 'completed': icon = '✅'; break;
            case 'in_progress': icon = '🔄'; break;
            case 'blocked': icon = '🚫'; break;
            default: icon = '⏳';
        }

        let line = `${icon} **${phase.id}**: ${phase.name}`;

        if (phase.status === 'completed' && phase.actualHours) {
            line += ` (${phase.actualHours}h)`;
        }

        if (phase.masksUsed && phase.masksUsed.length > 0) {
            line += ` [${phase.masksUsed.join(', ')}]`;
        }

        lines.push(line);
    }

    lines.push('');

    // Next action
    const currentPhase = plan.phases.find(p => p.status === 'in_progress');
    const nextPhase = manager.getNextPhase();

    if (currentPhase) {
        lines.push(`### 현재 진행 중`);
        lines.push(`Phase ${currentPhase.id}: ${currentPhase.name}`);
    } else if (nextPhase) {
        lines.push(`### 다음 단계`);
        lines.push(`\`/weave craft ${nextPhase.id}\` - ${nextPhase.name}`);
    } else if (stats.progress === 100) {
        lines.push(`### 🎉 완료!`);
        lines.push(`모든 Phase가 완료되었습니다.`);
    }

    return lines.join('\n');
}
