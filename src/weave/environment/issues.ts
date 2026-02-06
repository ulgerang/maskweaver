/**
 * Potential Issues Collector
 * 
 * Combines hardcoded known issues with project history from Global Knowledge.
 * Provides proactive warnings based on environment + stack combinations.
 */

import type { EnvironmentContext, PotentialIssue } from '../types.js';

// ============================================================================
// Built-in Known Issues Database
// ============================================================================

interface KnownIssue extends Omit<PotentialIssue, 'source'> {
    conditions: {
        os?: EnvironmentContext['os'][];
        shell?: EnvironmentContext['shell'][];
        packageManager?: EnvironmentContext['packageManager'][];
        stack?: string[];          // Must include ANY of these
        stackExact?: string[];     // Must include ALL of these
        nodeVersionMin?: string;   // Minimum Node version (semantic)
        nodeVersionMax?: string;   // Maximum Node version (semantic)
    };
}

const KNOWN_ISSUES: KnownIssue[] = [
    // =========================================================================
    // Windows-Specific Issues
    // =========================================================================
    {
        id: 'WIN-BUN-SYMLINK',
        category: 'environment',
        severity: 'critical',
        title: 'Windows + Bun: Symlink 권한 이슈',
        description: 'Bun은 node_modules에 심볼릭 링크를 사용합니다. Windows에서는 관리자 권한이나 개발자 모드가 필요합니다.',
        prevention: '1) 개발자 모드 활성화: 설정 > 개발자용 > 개발자 모드\n2) 또는 관리자 권한으로 터미널 실행\n3) 또는 `bun install --no-symlinks` 사용',
        appliesWhen: 'Windows + Bun 패키지 매니저 조합',
        conditions: {
            os: ['windows'],
            packageManager: ['bun'],
        },
    },
    {
        id: 'WIN-BASH-CMD',
        category: 'shell',
        severity: 'warning',
        title: 'Windows + bash 명령어 호환성',
        description: 'Unix 스타일 명령어(rm -rf, export, chmod 등)가 PowerShell에서 작동하지 않습니다.',
        prevention: 'package.json scripts에서:\n• `rm -rf` → `rimraf` 또는 `del /s /q` (PowerShell: `Remove-Item -Recurse`)\n• `export VAR=value` → `set VAR=value` 또는 `cross-env` 사용\n• `chmod` → Windows에서는 불필요',
        appliesWhen: 'Windows에서 Unix 명령어 사용 시',
        conditions: {
            os: ['windows'],
        },
    },
    {
        id: 'WIN-PRISMA-SQLITE',
        category: 'compatibility',
        severity: 'warning',
        title: 'Prisma + SQLite: Windows 경로 포맷',
        description: 'SQLite database URL에서 Windows 절대 경로 사용 시 문제가 발생할 수 있습니다.',
        prevention: '상대 경로 사용: `file:./dev.db`\n또는 `file:` 프로토콜로 절대 경로: `file:C:/path/to/dev.db` (백슬래시 아님)',
        appliesWhen: 'Windows + Prisma + SQLite 조합',
        conditions: {
            os: ['windows'],
            stack: ['Prisma', 'SQLite'],
        },
    },
    {
        id: 'WIN-PATH-LENGTH',
        category: 'environment',
        severity: 'info',
        title: 'Windows 경로 길이 제한',
        description: 'node_modules 깊은 중첩으로 260자 경로 제한에 도달할 수 있습니다.',
        prevention: '프로젝트를 드라이브 루트 근처에 배치 (예: C:\\dev\\project)\n또는 레지스트리에서 LongPathsEnabled 활성화',
        appliesWhen: 'Windows + 깊은 node_modules',
        conditions: {
            os: ['windows'],
        },
    },
    {
        id: 'WIN-TURBOPACK-JUNCTION',
        category: 'compatibility',
        severity: 'warning',
        title: 'Next.js Turbopack: Windows Junction Point 오류',
        description: 'Turbopack이 심볼릭 링크된 node_modules에서 Junction Point 오류를 발생시킬 수 있습니다.',
        prevention: 'next.config.js에서 Webpack 사용:\n```js\nmodule.exports = { webpack: (config) => config }\n```\n또는 `.env.local`에 `NEXT_TURBO=false` 추가',
        appliesWhen: 'Windows + Next.js + pnpm/bun',
        conditions: {
            os: ['windows'],
            stack: ['Next.js'],
            packageManager: ['pnpm', 'bun'],
        },
    },

    // =========================================================================
    // macOS-Specific Issues
    // =========================================================================
    {
        id: 'MAC-M1-NODEGYP',
        category: 'environment',
        severity: 'warning',
        title: 'Apple Silicon (M1/M2): node-gyp 네이티브 모듈',
        description: 'x86 전용 네이티브 모듈이 ARM Mac에서 빌드 실패할 수 있습니다.',
        prevention: '1) Rosetta로 터미널 실행\n2) 또는 `arch -x86_64 npm install`\n3) 또는 ARM 지원되는 패키지 버전 확인',
        appliesWhen: 'macOS (ARM) + node-gyp 의존성',
        conditions: {
            os: ['macos'],
        },
    },
    {
        id: 'MAC-FSEVENTS',
        category: 'compatibility',
        severity: 'info',
        title: 'macOS: fsevents 옵션 의존성',
        description: 'fsevents는 macOS 전용이지만 cross-platform 프로젝트에서 경고가 발생할 수 있습니다.',
        prevention: 'package.json의 optionalDependencies에 fsevents 포함 확인\n경고는 무시해도 안전함',
        appliesWhen: 'cross-platform 프로젝트',
        conditions: {
            os: ['macos'],
        },
    },

    // =========================================================================
    // Framework Version Issues
    // =========================================================================
    {
        id: 'PRISMA-7-MIGRATION',
        category: 'version',
        severity: 'critical',
        title: 'Prisma 7: 마이그레이션 시스템 변경',
        description: 'Prisma 7에서 마이그레이션 시스템이 크게 변경되었습니다. 기존 프로젝트 업그레이드 시 주의가 필요합니다.',
        prevention: '1) Prisma 6 사용 권장 (안정성)\n2) 업그레이드 시 마이그레이션 가이드 따르기\n3) DB 백업 필수',
        appliesWhen: 'Prisma 7.x 버전 사용 시',
        conditions: {
            stack: ['Prisma'],
        },
    },
    {
        id: 'REACT-18-HYDRATION',
        category: 'compatibility',
        severity: 'warning',
        title: 'React 18: Hydration Mismatch 경고',
        description: 'React 18의 엄격한 hydration 체크로 SSR/CSR 불일치 경고가 자주 발생합니다.',
        prevention: '1) `suppressHydrationWarning` 사용 (날짜, 랜덤값)\n2) `useEffect`로 클라이언트 전용 렌더링 분리\n3) 브라우저 확장 프로그램 비활성화 테스트',
        appliesWhen: 'React 18 + SSR (Next.js 등)',
        conditions: {
            stack: ['React', 'Next.js'],
        },
    },
    {
        id: 'NEXTJS-14-CACHING',
        category: 'config',
        severity: 'warning',
        title: 'Next.js 14+ App Router: 공격적 캐싱',
        description: 'App Router의 기본 캐싱이 예상치 못한 동작을 유발할 수 있습니다.',
        prevention: '`fetch`에 `{ cache: "no-store" }` 또는 `revalidate: 0` 명시\nRoute Segment Config: `export const dynamic = "force-dynamic"`',
        appliesWhen: 'Next.js 14+ App Router',
        conditions: {
            stack: ['Next.js'],
        },
    },
    {
        id: 'TAILWIND-4-CONFIG',
        category: 'config',
        severity: 'critical',
        title: 'Tailwind CSS 4: 설정 방식 변경',
        description: 'Tailwind 4는 CSS-first 설정을 사용하며, tailwind.config.js가 더 이상 기본이 아닙니다.',
        prevention: '`@import "tailwindcss"` 후 `@theme`으로 커스터마이징\n또는 `@config "./tailwind.config.js"`로 기존 방식 유지',
        appliesWhen: 'Tailwind CSS 4.x 버전',
        conditions: {
            stack: ['Tailwind CSS'],
        },
    },
    {
        id: 'ESLINT-9-FLAT',
        category: 'config',
        severity: 'warning',
        title: 'ESLint 9: Flat Config 전환',
        description: 'ESLint 9부터 `.eslintrc` 대신 `eslint.config.js` (Flat Config)가 기본입니다.',
        prevention: '1) `eslint.config.js` 생성 후 마이그레이션\n2) 또는 `ESLINT_USE_FLAT_CONFIG=false` 환경변수\n3) @eslint/migrate-config 도구 사용',
        appliesWhen: 'ESLint 9.x 버전',
        conditions: {
            stack: ['ESLint'],
        },
    },
    {
        id: 'TS-54-DECORATORS',
        category: 'version',
        severity: 'info',
        title: 'TypeScript 5.4+: 새 Decorator 표준',
        description: 'TypeScript 5.4는 Stage 3 decorators를 지원하며, 기존 experimentalDecorators와 호환되지 않을 수 있습니다.',
        prevention: 'tsconfig.json에 `"experimentalDecorators": true` 유지\n또는 새 decorator 문법으로 마이그레이션',
        appliesWhen: 'TypeScript 5.4+ + Decorators 사용',
        conditions: {
            stack: ['TypeScript'],
        },
    },

    // =========================================================================
    // Shell-Specific Issues
    // =========================================================================
    {
        id: 'SHELL-ENV-QUOTES',
        category: 'shell',
        severity: 'info',
        title: '환경 변수 따옴표 처리',
        description: '쉘마다 환경 변수의 따옴표 처리 방식이 다릅니다.',
        prevention: 'cross-env 패키지 사용으로 크로스 플랫폼 호환성 확보\n`npm i -D cross-env`\n`"scripts": { "dev": "cross-env NODE_ENV=development ..." }`',
        appliesWhen: 'cross-platform 스크립트',
        conditions: {},
    },
    {
        id: 'PLAYWRIGHT-BROWSERS',
        category: 'environment',
        severity: 'info',
        title: 'Playwright: 브라우저 설치 필요',
        description: 'Playwright 최초 실행 시 브라우저 바이너리 설치가 필요합니다 (약 500MB).',
        prevention: '`npx playwright install` 또는 `npx playwright install chromium` (Chromium만)',
        appliesWhen: 'Playwright 사용 프로젝트',
        conditions: {
            stack: ['Playwright'],
        },
    },
];

// ============================================================================
// Issue Matching Logic
// ============================================================================

function matchesConditions(
    context: EnvironmentContext,
    conditions: KnownIssue['conditions']
): boolean {
    // OS check
    if (conditions.os && !conditions.os.includes(context.os)) {
        return false;
    }

    // Shell check
    if (conditions.shell && !conditions.shell.includes(context.shell)) {
        return false;
    }

    // Package manager check
    if (conditions.packageManager && !conditions.packageManager.includes(context.packageManager)) {
        return false;
    }

    // Stack check (ANY match)
    if (conditions.stack) {
        const hasAny = conditions.stack.some(s =>
            context.stack.some(cs => cs.toLowerCase().includes(s.toLowerCase()))
        );
        if (!hasAny) return false;
    }

    // Stack exact check (ALL match)
    if (conditions.stackExact) {
        const hasAll = conditions.stackExact.every(s =>
            context.stack.some(cs => cs.toLowerCase().includes(s.toLowerCase()))
        );
        if (!hasAll) return false;
    }

    return true;
}

// ============================================================================
// Collect Potential Issues
// ============================================================================

export interface CollectIssuesOptions {
    includeProjectHistory?: boolean;
    historyLimit?: number;
}

export async function collectPotentialIssues(
    context: EnvironmentContext,
    options: CollectIssuesOptions = {}
): Promise<PotentialIssue[]> {
    const { includeProjectHistory = true, historyLimit = 5 } = options;
    const issues: PotentialIssue[] = [];

    // 1. Collect matching built-in issues
    for (const known of KNOWN_ISSUES) {
        if (matchesConditions(context, known.conditions)) {
            issues.push({
                id: known.id,
                category: known.category,
                severity: known.severity,
                title: known.title,
                description: known.description,
                prevention: known.prevention,
                appliesWhen: known.appliesWhen,
                source: 'builtin',
            });
        }
    }

    // 2. Search project history from Global Knowledge (optional)
    if (includeProjectHistory) {
        try {
            const historyIssues = await searchProjectHistory(context, historyLimit);
            issues.push(...historyIssues);
        } catch (e) {
            // Project history is optional, don't fail
            console.log('[Issues] Project history search failed:', e);
        }
    }

    // Sort by severity (critical > warning > info)
    const severityOrder = { critical: 0, warning: 1, info: 2 };
    issues.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]);

    return issues;
}

// ============================================================================
// Project History Search (Global Knowledge Integration)
// ============================================================================

async function searchProjectHistory(
    context: EnvironmentContext,
    limit: number
): Promise<PotentialIssue[]> {
    const issues: PotentialIssue[] = [];

    try {
        // Dynamic import to avoid circular dependencies
        const { searchTroubleshooting } = await import('../knowledge/global.js');

        // Build search query from context
        const queryParts = [
            context.os,
            context.shell,
            context.packageManager,
            ...context.stack.slice(0, 5),
        ].filter(Boolean);

        const query = queryParts.join(' ');

        // Search Global Knowledge
        const results = await searchTroubleshooting(query, { limit });

        for (const result of results) {
            const entry = result.entry;

            // Convert troubleshooting entry to potential issue
            issues.push({
                id: `HISTORY-${entry.id}`,
                category: 'compatibility',
                severity: result.score > 0.8 ? 'warning' : 'info',
                title: `과거 이슈: ${entry.context.slice(0, 50)}...`,
                description: entry.errorMessage,
                prevention: entry.solution,
                appliesWhen: entry.techStack?.join(', ') || '유사 프로젝트',
                source: 'project_history',
            });
        }
    } catch (e) {
        // Global Knowledge might not be available
    }

    return issues;
}

// ============================================================================
// Utility: Get Issues by Category
// ============================================================================

export function filterIssuesByCategory(
    issues: PotentialIssue[],
    category: PotentialIssue['category']
): PotentialIssue[] {
    return issues.filter(i => i.category === category);
}

export function filterIssuesBySeverity(
    issues: PotentialIssue[],
    minSeverity: PotentialIssue['severity']
): PotentialIssue[] {
    const severityOrder = { critical: 0, warning: 1, info: 2 };
    const minOrder = severityOrder[minSeverity];
    return issues.filter(i => severityOrder[i.severity] <= minOrder);
}

// ============================================================================
// Phase/Feature Context Search
// ============================================================================

/**
 * Context for phase-specific issue search
 */
export interface PhaseContext {
    /** Phase name (e.g., "로그인 구현", "감정 선택 UI") */
    phaseName: string;
    /** Phase ID (e.g., "P1", "P2") */
    phaseId?: string;
    /** Tasks within this phase */
    tasks?: string[];
    /** Done criteria */
    doneWhen?: string;
}

/**
 * Context for feature-specific issue search
 */
export interface FeatureContext {
    /** Feature name or description */
    featureName: string;
    /** Related keywords for search */
    keywords?: string[];
    /** Related tech stack for filtering */
    relatedStack?: string[];
}

/**
 * Result from context-based search
 */
export interface ContextSearchResult extends PotentialIssue {
    /** Relevance score (0-1) */
    relevance: number;
    /** Which context matched */
    matchedContext: string;
}

/**
 * Search for issues relevant to a specific phase.
 * Combines phase metadata with environment context for targeted search.
 */
export async function searchPhaseIssues(
    phaseContext: PhaseContext,
    environmentContext: EnvironmentContext,
    options: { limit?: number } = {}
): Promise<ContextSearchResult[]> {
    const { limit = 5 } = options;
    const results: ContextSearchResult[] = [];

    try {
        const { searchTroubleshooting } = await import('../knowledge/global.js');

        // Build query from phase context
        const queryParts = [
            phaseContext.phaseName,
            ...(phaseContext.tasks || []),
            phaseContext.doneWhen,
            ...environmentContext.stack.slice(0, 3),
        ].filter(Boolean);

        const query = queryParts.join(' ');
        const searchResults = await searchTroubleshooting(query, { limit });

        for (const result of searchResults) {
            const entry = result.entry;

            // Calculate relevance based on phase name match
            let relevance = result.score;
            const phaseNameLower = phaseContext.phaseName.toLowerCase();

            if (entry.context.toLowerCase().includes(phaseNameLower)) {
                relevance = Math.min(1, relevance + 0.2);
            }
            if (entry.tags?.some(t => phaseNameLower.includes(t.toLowerCase()))) {
                relevance = Math.min(1, relevance + 0.1);
            }

            results.push({
                id: `PHASE-${entry.id}`,
                category: 'compatibility',
                severity: relevance > 0.7 ? 'warning' : 'info',
                title: `[${phaseContext.phaseId || 'Phase'}] ${entry.context.slice(0, 50)}`,
                description: entry.errorMessage,
                prevention: entry.solution,
                appliesWhen: `Phase: ${phaseContext.phaseName}`,
                source: 'project_history',
                relevance,
                matchedContext: phaseContext.phaseName,
            });
        }
    } catch (e) {
        console.log('[Issues] Phase search failed:', e);
    }

    // Sort by relevance
    results.sort((a, b) => b.relevance - a.relevance);
    return results.slice(0, limit);
}

/**
 * Search for issues relevant to a specific feature request.
 * Useful when implementing new features to find similar past problems.
 */
export async function searchFeatureIssues(
    featureContext: FeatureContext,
    environmentContext: EnvironmentContext,
    options: { limit?: number } = {}
): Promise<ContextSearchResult[]> {
    const { limit = 5 } = options;
    const results: ContextSearchResult[] = [];

    try {
        const { searchTroubleshooting } = await import('../knowledge/global.js');

        // Build query from feature context
        const queryParts = [
            featureContext.featureName,
            ...(featureContext.keywords || []),
            ...(featureContext.relatedStack || environmentContext.stack.slice(0, 3)),
        ].filter(Boolean);

        const query = queryParts.join(' ');
        const searchResults = await searchTroubleshooting(query, { limit });

        for (const result of searchResults) {
            const entry = result.entry;

            // Calculate relevance based on feature keyword match
            let relevance = result.score;
            const featureWords = featureContext.featureName.toLowerCase().split(/\s+/);

            for (const word of featureWords) {
                if (word.length > 2 && entry.context.toLowerCase().includes(word)) {
                    relevance = Math.min(1, relevance + 0.05);
                }
            }

            // Boost if tech stack matches
            if (featureContext.relatedStack && entry.techStack) {
                const stackMatch = featureContext.relatedStack.some(s =>
                    entry.techStack!.some(es => es.toLowerCase().includes(s.toLowerCase()))
                );
                if (stackMatch) {
                    relevance = Math.min(1, relevance + 0.15);
                }
            }

            results.push({
                id: `FEATURE-${entry.id}`,
                category: 'compatibility',
                severity: relevance > 0.7 ? 'warning' : 'info',
                title: `[기능] ${entry.context.slice(0, 50)}`,
                description: entry.errorMessage,
                prevention: entry.solution,
                appliesWhen: `Feature: ${featureContext.featureName}`,
                source: 'project_history',
                relevance,
                matchedContext: featureContext.featureName,
            });
        }
    } catch (e) {
        console.log('[Issues] Feature search failed:', e);
    }

    // Sort by relevance
    results.sort((a, b) => b.relevance - a.relevance);
    return results.slice(0, limit);
}

/**
 * Quick helper to format context search results as markdown.
 */
export function formatContextResults(
    results: ContextSearchResult[],
    title: string = '관련 이슈'
): string {
    if (results.length === 0) {
        return `### ✅ ${title}\n기록된 관련 이슈가 없습니다.\n`;
    }

    const lines: string[] = [];
    lines.push(`### 📋 ${title} (${results.length}건)\n`);

    for (const result of results) {
        const icon = result.severity === 'warning' ? '🟡' : '🔵';
        const relevancePercent = Math.round(result.relevance * 100);

        lines.push(`${icon} **${result.title}** _(관련도: ${relevancePercent}%)_`);
        lines.push(`> ${result.description.slice(0, 100)}${result.description.length > 100 ? '...' : ''}`);
        lines.push('');
        lines.push(`**해결책:** ${result.prevention.slice(0, 150)}${result.prevention.length > 150 ? '...' : ''}`);
        lines.push('');
        lines.push('---');
        lines.push('');
    }

    return lines.join('\n');
}
