/**
 * Weave Research Stage
 *
 * Produces a persistent research artifact before planning/implementation.
 * The report is intentionally markdown-first so humans can annotate and review.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

import type { IntakeResult } from './intake.js';

export interface ResearchOptions {
    docsPath: string;
    intake: IntakeResult;
    basePath?: string;
    projectName?: string;
    outputPath?: string;
}

export interface ResearchResult {
    reportPath: string;
    summary: string;
    report: string;
}

type ReuseCandidate = {
    filePath: string;
    score: number;
    matchedNeedles: string[];
    matchedFeatures: string[];
    snippet?: string;
};

type WorkspaceContextReport = {
    scannedFiles: number;
    codeFiles: number;
    testFiles: number;
    keyConfigs: string[];
    reuseCandidates: ReuseCandidate[];
    duplicateSignals: string[];
    reuseFeatures: string[];
    newImplementationFeatures: string[];
    reproductionFlow: string[];
    beforeContext: string[];
    afterContext: string[];
};

const WORKSPACE_IGNORED_DIRS = new Set([
    '.git',
    '.idea',
    '.vscode',
    '.opencode',
    '.opencode-data',
    '.worktrees',
    'node_modules',
    'dist',
    'build',
    'coverage',
    '.next',
    '.nuxt',
    '.svelte-kit',
    '.turbo',
    '.cache',
    'vendor',
    'target',
    'out',
]);

const TEXT_EXTENSIONS = new Set([
    '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs',
    '.json', '.yaml', '.yml', '.md', '.txt',
    '.py', '.go', '.rs', '.java', '.kt', '.swift', '.rb', '.php',
    '.sql', '.sh', '.ps1', '.bat', '.env',
]);

const CODE_EXTENSIONS = new Set([
    '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs',
    '.py', '.go', '.rs', '.java', '.kt', '.swift', '.rb', '.php',
]);

const SPECIAL_TEXT_FILES = new Set([
    'Dockerfile',
    'Makefile',
    'Procfile',
]);

const COMMON_DUPLICATE_FILE_NAMES = new Set([
    'index.ts',
    'index.tsx',
    'index.js',
    'index.jsx',
    'types.ts',
    'constants.ts',
    'README.md',
]);

const COMMON_EXPORT_SYMBOLS = new Set([
    'default',
    'config',
    'options',
    'types',
    'constants',
]);

const TOKEN_STOPWORDS = new Set([
    'the', 'and', 'for', 'with', 'from', 'into', 'this', 'that',
    'have', 'has', 'had', 'will', 'shall', 'should', 'could', 'would',
    'make', 'build', 'create', 'implement', 'feature', 'functionality',
    'user', 'users', 'system', 'service', 'application', 'module',
]);

const MAX_WORKSPACE_FILES = 3000;
const MAX_CONTENT_BYTES = 240_000;

function toRelativePath(basePath: string, filePath: string): string {
    const rel = path.relative(basePath, filePath);
    if (!rel || rel.startsWith('..')) return filePath;
    return rel.replace(/\\/g, '/');
}

function uniq(values: string[]): string[] {
    return Array.from(new Set(values.filter(Boolean)));
}

function top<T>(arr: T[], size: number): T[] {
    return arr.slice(0, Math.max(0, size));
}

function normalizeLine(input: string, maxLength = 180): string {
    return input.replace(/\s+/g, ' ').trim().slice(0, maxLength);
}

function formatList(lines: string[], title: string, items: string[]): void {
    lines.push(`## ${title}`);
    lines.push('');

    if (items.length === 0) {
        lines.push('- (none)');
        lines.push('');
        return;
    }

    for (const item of items) {
        lines.push(`- ${item}`);
    }
    lines.push('');
}

function isTextLikeFile(fileName: string): boolean {
    if (SPECIAL_TEXT_FILES.has(fileName)) return true;
    const ext = path.extname(fileName).toLowerCase();
    return TEXT_EXTENSIONS.has(ext);
}

function isCodeFile(filePath: string): boolean {
    const ext = path.extname(filePath).toLowerCase();
    return CODE_EXTENSIONS.has(ext);
}

function isTestFile(filePath: string): boolean {
    const normalized = filePath.replace(/\\/g, '/').toLowerCase();
    if (normalized.includes('/test/') || normalized.includes('/tests/')) return true;
    return /(?:^|[./_-])(test|spec)\.[a-z0-9]+$/i.test(path.basename(filePath));
}

function safeReadText(filePath: string, maxBytes = MAX_CONTENT_BYTES): string | null {
    try {
        const stat = fs.statSync(filePath);
        if (stat.size <= 0 || stat.size > maxBytes) return null;

        const content = fs.readFileSync(filePath, 'utf-8');
        if (content.includes('\u0000')) return null;
        return content;
    } catch {
        return null;
    }
}

function tokenizeEnglish(input: string): string[] {
    const matches = input.toLowerCase().match(/[a-z][a-z0-9_-]{2,}/g) || [];
    return matches.filter(token => !TOKEN_STOPWORDS.has(token));
}

function collectWorkspaceFiles(basePath: string, maxFiles = MAX_WORKSPACE_FILES): string[] {
    const results: string[] = [];
    const stack: string[] = [basePath];

    while (stack.length > 0 && results.length < maxFiles) {
        const current = stack.pop()!;

        let entries: fs.Dirent[] = [];
        try {
            entries = fs.readdirSync(current, { withFileTypes: true });
        } catch {
            continue;
        }

        entries.sort((a, b) => a.name.localeCompare(b.name));

        for (const entry of entries) {
            const fullPath = path.join(current, entry.name);

            if (entry.isSymbolicLink()) continue;

            if (entry.isDirectory()) {
                if (WORKSPACE_IGNORED_DIRS.has(entry.name)) continue;
                if (entry.name.startsWith('.') && entry.name !== '.github') continue;
                stack.push(fullPath);
                continue;
            }

            if (!entry.isFile()) continue;
            if (!isTextLikeFile(entry.name)) continue;

            results.push(fullPath);
            if (results.length >= maxFiles) break;
        }
    }

    return results;
}

function buildFeatureNeedles(intake: IntakeResult): string[] {
    const needles: string[] = [];
    const topFeatures = top(intake.features, 16)
        .map(feature => normalizeLine(feature, 120))
        .filter(feature => feature.length >= 3);

    for (const feature of topFeatures) {
        needles.push(feature.toLowerCase());
        for (const token of tokenizeEnglish(feature)) {
            if (token.length >= 4) needles.push(token);
        }
    }

    for (const doc of top(intake.documents, 12)) {
        for (const section of doc.sections.slice(0, 8)) {
            for (const token of tokenizeEnglish(section)) {
                if (token.length >= 4) needles.push(token);
            }
        }
    }

    return uniq(needles).slice(0, 60);
}

function extractExportedSymbols(content: string): string[] {
    const symbols: string[] = [];

    const captureRegex = (regex: RegExp) => {
        let match: RegExpExecArray | null;
        while ((match = regex.exec(content)) !== null) {
            if (match[1]) symbols.push(match[1]);
        }
    };

    captureRegex(/export\s+(?:async\s+)?function\s+([A-Za-z_][A-Za-z0-9_]*)/g);
    captureRegex(/export\s+class\s+([A-Za-z_][A-Za-z0-9_]*)/g);
    captureRegex(/export\s+const\s+([A-Za-z_][A-Za-z0-9_]*)/g);
    captureRegex(/export\s+let\s+([A-Za-z_][A-Za-z0-9_]*)/g);
    captureRegex(/export\s+var\s+([A-Za-z_][A-Za-z0-9_]*)/g);

    let namedMatch: RegExpExecArray | null;
    const namedExportRegex = /export\s*\{\s*([^}]+)\s*\}/g;
    while ((namedMatch = namedExportRegex.exec(content)) !== null) {
        const block = namedMatch[1];
        const names = block.split(',');
        for (const rawName of names) {
            const normalized = rawName.trim().split(/\s+as\s+/i)[0]?.trim();
            if (normalized && /^[A-Za-z_][A-Za-z0-9_]*$/.test(normalized)) {
                symbols.push(normalized);
            }
        }
    }

    return uniq(symbols);
}

function extractSnippet(content: string, needles: string[]): string | undefined {
    if (needles.length === 0) return undefined;

    const lines = content.split(/\r?\n/);
    for (const line of lines.slice(0, 1200)) {
        const lower = line.toLowerCase();
        if (needles.some(needle => lower.includes(needle))) {
            return normalizeLine(line);
        }
    }

    return undefined;
}

function resolveFeatureMatch(contentLower: string, feature: string): boolean {
    const normalizedFeature = feature.toLowerCase();
    if (normalizedFeature.length >= 3 && contentLower.includes(normalizedFeature)) {
        return true;
    }

    const tokens = tokenizeEnglish(feature).filter(token => token.length >= 4);
    if (tokens.length === 0) return false;

    let matched = 0;
    for (const token of tokens) {
        if (contentLower.includes(token)) {
            matched += 1;
        }
    }

    return matched >= Math.min(2, tokens.length);
}

function getBaselineCommands(basePath: string): string[] {
    const packageJsonPath = path.join(basePath, 'package.json');
    const commands: string[] = [];

    try {
        if (!fs.existsSync(packageJsonPath)) return commands;
        const pkg = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8')) as { scripts?: Record<string, string> };
        const scripts = pkg.scripts || {};

        const priority = ['dev', 'test', 'test:unit', 'test:e2e', 'build', 'lint', 'typecheck'];
        for (const name of priority) {
            if (scripts[name]) commands.push(`npm run ${name}`);
        }

        return uniq(commands);
    } catch {
        return commands;
    }
}

function extractDocReproductionSteps(docPaths: string[]): string[] {
    const steps: string[] = [];
    const keyRegex = /(repro|reproduce|steps|재현|문제|오류|버그|증상|before|after|expected|actual|fail)/i;

    for (const docPath of docPaths.slice(0, 12)) {
        const content = safeReadText(docPath, 180_000);
        if (!content) continue;

        const lines = content.split(/\r?\n/);
        for (const line of lines.slice(0, 1000)) {
            const trimmed = line.trim();
            if (!trimmed) continue;

            const isStep = /^\d+[.)]\s+/.test(trimmed) || /^[-*]\s+/.test(trimmed);
            if (!isStep) continue;
            if (!keyRegex.test(trimmed)) continue;

            steps.push(normalizeLine(trimmed.replace(/^\d+[.)]\s+|^[-*]\s+/, ''), 160));
        }
    }

    return uniq(steps).slice(0, 12);
}

function findRelatedTests(testFiles: string[], featureNeedles: string[]): string[] {
    const related: string[] = [];
    if (featureNeedles.length === 0) return related;

    for (const testFile of testFiles.slice(0, 240)) {
        const content = safeReadText(testFile, 160_000);
        if (!content) continue;

        const lower = content.toLowerCase();
        if (featureNeedles.some(needle => lower.includes(needle))) {
            related.push(testFile);
        }
    }

    return uniq(related).slice(0, 10);
}

function analyzeWorkspaceContext(basePath: string, intake: IntakeResult): WorkspaceContextReport {
    const workspaceFiles = collectWorkspaceFiles(basePath);
    const codeFiles = workspaceFiles.filter(isCodeFile);
    const testFiles = workspaceFiles.filter(isTestFile);

    const featureLines = uniq(top(intake.features, 12).map(feature => normalizeLine(feature, 120)));
    const featureNeedles = buildFeatureNeedles(intake);

    const exportSymbolMap = new Map<string, Set<string>>();
    const fileNameMap = new Map<string, string[]>();
    const featureCoverage = new Map<string, Set<string>>();
    const reuseCandidates: ReuseCandidate[] = [];

    for (const feature of featureLines) {
        featureCoverage.set(feature, new Set<string>());
    }

    for (const filePath of codeFiles) {
        const fileName = path.basename(filePath);
        const existing = fileNameMap.get(fileName) || [];
        existing.push(filePath);
        fileNameMap.set(fileName, existing);

        const content = safeReadText(filePath);
        if (!content) continue;
        const contentLower = content.toLowerCase();

        const matchedNeedles = featureNeedles.filter(needle => contentLower.includes(needle)).slice(0, 8);

        const matchedFeatures: string[] = [];
        for (const feature of featureLines) {
            if (!resolveFeatureMatch(contentLower, feature)) continue;

            matchedFeatures.push(feature);
            featureCoverage.get(feature)?.add(filePath);
        }

        if (matchedNeedles.length > 0 || matchedFeatures.length > 0) {
            const score = (matchedFeatures.length * 3) + matchedNeedles.length;
            reuseCandidates.push({
                filePath,
                score,
                matchedNeedles,
                matchedFeatures,
                snippet: extractSnippet(content, matchedNeedles),
            });
        }

        if (/\.(ts|tsx|js|jsx|mjs|cjs)$/i.test(filePath)) {
            const symbols = extractExportedSymbols(content);
            for (const symbol of symbols) {
                const holders = exportSymbolMap.get(symbol) || new Set<string>();
                holders.add(filePath);
                exportSymbolMap.set(symbol, holders);
            }
        }
    }

    reuseCandidates.sort((a, b) => b.score - a.score || a.filePath.localeCompare(b.filePath));

    const duplicateSignals: string[] = [];

    for (const [fileName, files] of fileNameMap.entries()) {
        if (files.length < 2) continue;
        if (COMMON_DUPLICATE_FILE_NAMES.has(fileName)) continue;

        const relFiles = top(files.map(file => toRelativePath(basePath, file)), 4);
        duplicateSignals.push(`File name overlap: \`${fileName}\` appears in ${relFiles.map(file => `\`${file}\``).join(', ')}`);
    }

    for (const [symbol, files] of exportSymbolMap.entries()) {
        if (files.size < 2) continue;
        if (COMMON_EXPORT_SYMBOLS.has(symbol.toLowerCase())) continue;

        const relFiles = top(Array.from(files).map(file => toRelativePath(basePath, file)), 4);
        duplicateSignals.push(`Export overlap: \`${symbol}\` is exported in ${relFiles.map(file => `\`${file}\``).join(', ')}`);
    }

    const reuseFeatures: string[] = [];
    const newImplementationFeatures: string[] = [];

    for (const feature of featureLines) {
        const coverage = featureCoverage.get(feature);
        if (coverage && coverage.size > 0) {
            const sample = top(Array.from(coverage).map(file => `\`${toRelativePath(basePath, file)}\``), 2).join(', ');
            reuseFeatures.push(`${feature} -> reuse candidates: ${sample}`);
        } else {
            newImplementationFeatures.push(feature);
        }
    }

    const beforeContext = top(reuseCandidates, 10).map(candidate => {
        const rel = toRelativePath(basePath, candidate.filePath);
        const marker = candidate.matchedFeatures.length > 0
            ? `feature: ${candidate.matchedFeatures[0]}`
            : `signal: ${candidate.matchedNeedles[0] || 'related'}`;
        const snippet = candidate.snippet ? ` | ${candidate.snippet}` : '';
        return `\`${rel}\` (${marker})${snippet}`;
    });

    const afterContext = featureLines.map(feature => {
        const coverage = featureCoverage.get(feature);
        const state = coverage && coverage.size > 0
            ? 'extend/reuse existing behavior'
            : 'new implementation likely required';
        return `${feature} -> ${state}`;
    });

    const baselineCommands = getBaselineCommands(basePath);
    const docReproSteps = extractDocReproductionSteps(intake.documents.map(doc => doc.path));
    const relatedTests = findRelatedTests(testFiles, featureNeedles)
        .map(testPath => `\`${toRelativePath(basePath, testPath)}\``);

    const reproductionFlow: string[] = [];
    if (baselineCommands.length > 0) {
        reproductionFlow.push(`Baseline commands: ${baselineCommands.join(' ; ')}`);
    }
    if (docReproSteps.length > 0) {
        reproductionFlow.push(`Documented repro hints: ${docReproSteps.join(' -> ')}`);
    }
    if (relatedTests.length > 0) {
        reproductionFlow.push(`Related tests: ${relatedTests.join(', ')}`);
    }
    if (reproductionFlow.length === 0) {
        reproductionFlow.push('No explicit repro flow found in docs/workspace. Use `weave verify` and inspect top reuse candidates first.');
    }

    const keyConfigs = [
        'package.json',
        'tsconfig.json',
        'vitest.config.ts',
        'vite.config.ts',
        'next.config.js',
        'docker-compose.yml',
        '.github/workflows',
    ].filter(rel => fs.existsSync(path.join(basePath, rel)));

    return {
        scannedFiles: workspaceFiles.length,
        codeFiles: codeFiles.length,
        testFiles: testFiles.length,
        keyConfigs,
        reuseCandidates: top(reuseCandidates, 20),
        duplicateSignals: top(uniq(duplicateSignals), 20),
        reuseFeatures: top(reuseFeatures, 12),
        newImplementationFeatures: top(newImplementationFeatures, 12),
        reproductionFlow,
        beforeContext,
        afterContext,
    };
}

export function buildResearchReport(options: ResearchOptions): string {
    const basePath = options.basePath || process.cwd();
    const now = new Date().toISOString();

    const featureLines = uniq(top(options.intake.features, 12));
    const docs = top(options.intake.documents, 20).map(doc => {
        const relPath = toRelativePath(basePath, doc.path);
        const sectionPart = doc.sections.length > 0
            ? ` (${doc.sections.length} sections)`
            : '';
        return `\`${relPath}\` - ${doc.title}${sectionPart}`;
    });

    const techSignals = uniq([
        ...(options.intake.technicalRequirements.frontend || []),
        ...(options.intake.technicalRequirements.backend || []),
        ...(options.intake.technicalRequirements.database || []),
        ...(options.intake.technicalRequirements.other || []),
    ]);

    const questionLines = top(options.intake.questions, 10).map(q => {
        const required = q.required ? 'required' : 'optional';
        return `[${required}] ${q.topic}: ${q.question}`;
    });

    const similar = top(options.intake.similarProjects || [], 6);

    const envIssues = top(options.intake.environment?.issues || [], 10).map(issue => {
        return `${issue.severity.toUpperCase()} - ${issue.title}: ${issue.prevention}`;
    });

    const workspace = analyzeWorkspaceContext(basePath, options.intake);

    const workspaceScope = [
        `Scanned files: ${workspace.scannedFiles} (code: ${workspace.codeFiles}, tests: ${workspace.testFiles})`,
        `Research scope: current workspace only (\`${toRelativePath(basePath, basePath)}\`)`,
        workspace.keyConfigs.length > 0
            ? `Key configs found: ${workspace.keyConfigs.map(cfg => `\`${cfg}\``).join(', ')}`
            : 'Key configs found: (none)',
    ];

    const reuseLines = workspace.reuseCandidates.map(candidate => {
        const rel = toRelativePath(basePath, candidate.filePath);
        const featurePart = candidate.matchedFeatures.length > 0
            ? `features: ${candidate.matchedFeatures.slice(0, 2).join(', ')}`
            : `signals: ${candidate.matchedNeedles.slice(0, 2).join(', ')}`;
        const snippet = candidate.snippet ? ` | ${candidate.snippet}` : '';
        return `\`${rel}\` (${featurePart})${snippet}`;
    });

    const lines: string[] = [];
    lines.push('# Weave Research Report');
    lines.push('');
    lines.push(`- generated_at: ${now}`);
    lines.push(`- project: ${options.projectName || 'My Project'}`);
    lines.push(`- docs_scope: ${toRelativePath(basePath, options.docsPath)}`);
    lines.push('');

    lines.push('## Workflow Contract');
    lines.push('');
    lines.push('- This report is the review surface before planning/implementation.');
    lines.push('- Research covers document scope + current workspace context that can be inspected now.');
    lines.push('- Focus on reuse opportunities, duplicate-risk detection, reproduction flow, and before/after understanding.');
    lines.push('- Do not implement until plan approval is complete.');
    lines.push('');

    formatList(lines, 'Workspace Investigation Scope', workspaceScope);
    formatList(lines, 'Documents Read', docs);
    formatList(lines, 'Detected Features', featureLines);
    formatList(lines, 'Technical Signals', techSignals);
    formatList(lines, 'Open Questions', questionLines);
    formatList(lines, 'Similar Project Hints', similar);
    formatList(lines, 'Environment Risks', envIssues);

    formatList(lines, 'Existing Implementations & Reuse Candidates', reuseLines);
    formatList(lines, 'Duplicate Implementation Signals', workspace.duplicateSignals);
    formatList(lines, 'Feature Reuse Opportunities', workspace.reuseFeatures);
    formatList(lines, 'Feature Gaps (Likely New Work)', workspace.newImplementationFeatures);
    formatList(lines, 'Problem Reproduction Flow', workspace.reproductionFlow);
    formatList(lines, 'Before Context (Current State)', workspace.beforeContext);
    formatList(lines, 'After Context (Target Intent)', workspace.afterContext);

    lines.push('## Suggested Next Steps');
    lines.push('');
    lines.push('1. Preserve reuse candidates first; avoid implementing duplicates unless behavior diverges.');
    lines.push('2. Validate repro flow once (baseline), then define expected after-state checks in plan/tasks.');
    lines.push('3. Generate or refresh plan with `weave prepare` or `weave design`.');
    lines.push('4. Run `weave approve-plan` before `weave craft`/`weave flow`.');

    return lines.join('\n');
}

export async function writeResearchReport(options: ResearchOptions): Promise<ResearchResult> {
    const basePath = options.basePath || process.cwd();
    const tasksDir = path.join(basePath, 'tasks');
    fs.mkdirSync(tasksDir, { recursive: true });

    const outputPath = options.outputPath
        ? (path.isAbsolute(options.outputPath) ? options.outputPath : path.join(basePath, options.outputPath))
        : path.join(tasksDir, 'research.md');

    const report = buildResearchReport(options);
    fs.writeFileSync(outputPath, `${report}\n`, 'utf-8');

    const rel = toRelativePath(basePath, outputPath);
    const summary = [
        '## Research complete',
        '',
        `- Artifact: \`${rel}\``,
        `- Features: ${options.intake.features.length}`,
        `- Questions: ${options.intake.questions.length}`,
        '- Includes workspace context survey (reuse, duplicate-risk, repro flow, before/after).',
    ].join('\n');

    return {
        reportPath: outputPath,
        summary,
        report,
    };
}
