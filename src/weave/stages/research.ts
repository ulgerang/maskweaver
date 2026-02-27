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
    lines.push('- Add inline corrections in plan files, then approve explicitly.');
    lines.push('- Do not implement until plan approval is complete.');
    lines.push('');

    formatList(lines, 'Documents Read', docs);
    formatList(lines, 'Detected Features', featureLines);
    formatList(lines, 'Technical Signals', techSignals);
    formatList(lines, 'Open Questions', questionLines);
    formatList(lines, 'Similar Project Hints', similar);
    formatList(lines, 'Environment Risks', envIssues);

    lines.push('## Suggested Next Steps');
    lines.push('');
    lines.push('1. Generate or refresh plan with `weave prepare` or `weave design`.');
    lines.push('2. Annotate plan notes and constraints directly in the plan artifact.');
    lines.push('3. Run `weave approve-plan` before `weave craft`/`weave flow`.');

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
    ].join('\n');

    return {
        reportPath: outputPath,
        summary,
        report,
    };
}
