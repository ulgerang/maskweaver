/**
 * Weave Environment Analysis Module
 * 
 * Proactive knowledge system for detecting potential issues
 * BEFORE they occur, based on environment + stack combinations.
 */

import type { EnvironmentContext, EnvironmentAnalysis, PotentialIssue } from '../types.js';
import { detectEnvironment, type DetectorOptions } from './detector.js';
import { collectPotentialIssues, type CollectIssuesOptions, filterIssuesBySeverity, filterIssuesByCategory } from './issues.js';

// Re-export types and utilities
export { detectEnvironment } from './detector.js';
export {
    collectPotentialIssues,
    filterIssuesBySeverity,
    filterIssuesByCategory,
    // Phase/Feature context search
    searchPhaseIssues,
    searchFeatureIssues,
    formatContextResults,
} from './issues.js';
export type { DetectorOptions } from './detector.js';
export type {
    CollectIssuesOptions,
    PhaseContext,
    FeatureContext,
    ContextSearchResult,
} from './issues.js';

// ============================================================================
// Main Analysis Function
// ============================================================================

export interface AnalyzeOptions extends DetectorOptions, CollectIssuesOptions {
    /** If true, only include warnings and critical issues in the summary */
    warningsOnly?: boolean;
}

/**
 * Perform complete environment analysis.
 * Detects environment context and collects matching potential issues.
 */
export async function analyzeEnvironment(
    options: AnalyzeOptions = {}
): Promise<EnvironmentAnalysis> {
    const { warningsOnly = false, ...otherOptions } = options;

    // Detect environment
    const context = detectEnvironment(otherOptions);

    // Collect potential issues
    let issues = await collectPotentialIssues(context, otherOptions);

    // Filter if warningsOnly
    if (warningsOnly) {
        issues = filterIssuesBySeverity(issues, 'warning');
    }

    // Generate summary
    const summary = generateSummary(context, issues);

    return {
        context,
        issues,
        summary,
        analyzedAt: new Date().toISOString(),
    };
}

// ============================================================================
// Summary Generation
// ============================================================================

function generateSummary(context: EnvironmentContext, issues: PotentialIssue[]): string {
    const lines: string[] = [];

    // Header
    lines.push('## 🔍 환경 분석 결과\n');

    // Environment Context
    lines.push('### 📋 실행 환경');
    lines.push(`- **OS**: ${formatOS(context.os)}`);
    lines.push(`- **Shell**: ${context.shell}`);
    lines.push(`- **Node.js**: ${context.nodeVersion}`);
    if (context.bunVersion) {
        lines.push(`- **Bun**: v${context.bunVersion}`);
    }
    lines.push(`- **패키지 매니저**: ${context.packageManager}`);
    if (context.stack.length > 0) {
        lines.push(`- **기술 스택**: ${context.stack.join(', ')}`);
    }
    lines.push('');

    // Issues Summary
    const criticalCount = issues.filter(i => i.severity === 'critical').length;
    const warningCount = issues.filter(i => i.severity === 'warning').length;
    const infoCount = issues.filter(i => i.severity === 'info').length;

    if (issues.length === 0) {
        lines.push('### ✅ 잠재적 이슈 없음');
        lines.push('현재 환경에서 알려진 이슈가 발견되지 않았습니다.');
    } else {
        lines.push('### ⚠️ 잠재적 이슈');
        lines.push(`총 ${issues.length}개의 주의사항이 있습니다:`);
        if (criticalCount > 0) lines.push(`- 🔴 **Critical**: ${criticalCount}개`);
        if (warningCount > 0) lines.push(`- 🟡 **Warning**: ${warningCount}개`);
        if (infoCount > 0) lines.push(`- 🔵 **Info**: ${infoCount}개`);
        lines.push('');

        // Critical issues first
        const criticalIssues = issues.filter(i => i.severity === 'critical');
        if (criticalIssues.length > 0) {
            lines.push('#### 🔴 Critical Issues');
            for (const issue of criticalIssues) {
                lines.push(`\n**${issue.title}** \`[${issue.id}]\``);
                lines.push(`> ${issue.description}`);
                lines.push('');
                lines.push('**해결 방법:**');
                lines.push(issue.prevention);
                lines.push('');
            }
        }

        // Warning issues
        const warningIssues = issues.filter(i => i.severity === 'warning');
        if (warningIssues.length > 0) {
            lines.push('#### 🟡 Warnings');
            for (const issue of warningIssues) {
                lines.push(`\n**${issue.title}** \`[${issue.id}]\``);
                lines.push(`> ${issue.description}`);
                lines.push('');
                lines.push('**해결 방법:**');
                lines.push(issue.prevention);
                lines.push('');
            }
        }

        // Info issues (brief)
        const infoIssues = issues.filter(i => i.severity === 'info');
        if (infoIssues.length > 0) {
            lines.push('#### 🔵 참고 사항');
            for (const issue of infoIssues) {
                lines.push(`- **${issue.title}**: ${issue.description.slice(0, 100)}...`);
            }
            lines.push('');
        }
    }

    // Footer
    const builtinCount = issues.filter(i => i.source === 'builtin').length;
    const historyCount = issues.filter(i => i.source === 'project_history').length;

    lines.push('---');
    lines.push(`_분석 시간: ${new Date().toLocaleString('ko-KR')}_`);
    if (historyCount > 0) {
        lines.push(`_소스: 내장 지식 ${builtinCount}개, 프로젝트 기록 ${historyCount}개_`);
    }

    return lines.join('\n');
}

function formatOS(os: EnvironmentContext['os']): string {
    switch (os) {
        case 'windows':
            return 'Windows';
        case 'macos':
            return 'macOS';
        case 'linux':
            return 'Linux';
        default:
            return os;
    }
}

// ============================================================================
// Quick Check Functions
// ============================================================================

/**
 * Quick check if there are any critical issues for the current environment.
 * Useful for CLI warnings or pre-flight checks.
 */
export async function hasCriticalIssues(options: AnalyzeOptions = {}): Promise<boolean> {
    const analysis = await analyzeEnvironment(options);
    return analysis.issues.some(i => i.severity === 'critical');
}

/**
 * Get a one-liner summary of the environment.
 * Useful for logging or status displays.
 */
export function getEnvironmentOneLiner(context: EnvironmentContext): string {
    const parts = [
        formatOS(context.os),
        context.shell,
        context.nodeVersion,
        context.packageManager,
    ];

    if (context.bunVersion) {
        parts.splice(3, 0, `bun@${context.bunVersion}`);
    }

    if (context.stack.length > 0) {
        parts.push(`[${context.stack.slice(0, 3).join(', ')}${context.stack.length > 3 ? '...' : ''}]`);
    }

    return parts.join(' | ');
}
