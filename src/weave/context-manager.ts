import * as fs from 'node:fs';
import * as path from 'node:path';
import { mkdir, readFile, writeFile, readdir, copyFile } from 'node:fs/promises';
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';
import type {
    ContextIndex,
} from './types.js';

// ============================================================================
// Directory helpers
// ============================================================================

export function getWikiDir(basePath: string): string {
    return path.join(basePath, 'wiki');
}

export function getBuildDir(basePath: string, changeId: string, buildId: string): string {
    return path.join(basePath, 'changes', changeId, 'builds', buildId);
}

export function getTasksDir(basePath: string, changeId: string, buildId: string): string {
    return path.join(getBuildDir(basePath, changeId, buildId), 'tasks');
}

export function getTaskDir(basePath: string, changeId: string, buildId: string, taskId: string): string {
    return path.join(getTasksDir(basePath, changeId, buildId), taskId);
}

export function getWavesDir(basePath: string, changeId: string, buildId: string): string {
    return path.join(getBuildDir(basePath, changeId, buildId), 'waves');
}

export function getSnapshotsDir(basePath: string, changeId: string, buildId: string): string {
    return path.join(getBuildDir(basePath, changeId, buildId), 'snapshots');
}

// ============================================================================
// Task artifact writers
// ============================================================================

export async function writeBrief(taskDir: string, data: {
    taskId: string;
    buildId: string;
    wave: number;
    dependsOn: string[];
    allowedPaths: string[];
    forbiddenPaths: string[];
    contextPaths: string[];
    acceptanceRefs: string[];
    verifyCommands: string[];
    goal: string;
    requiredOutcome: string[];
    criticalWarnings: string[];
}): Promise<string> {
    await mkdir(taskDir, { recursive: true });
    const frontmatter: Record<string, unknown> = {
        task_id: data.taskId,
        build_id: data.buildId,
        wave: data.wave,
        status: 'ready',
        depends_on: data.dependsOn,
        allowed_paths: data.allowedPaths,
        forbidden_paths: data.forbiddenPaths,
        context_files: data.contextPaths,
        acceptance_refs: data.acceptanceRefs,
        verify_commands: data.verifyCommands,
    };
    const lines: string[] = [
        '---',
        stringifyYaml(frontmatter).trim(),
        '---',
        '',
        `# Task: ${data.taskId}`,
        '',
        data.goal,
        '',
        '# Required Outcome',
        '',
    ];
    for (const item of data.requiredOutcome) {
        lines.push(`- ${item}`);
    }
    lines.push('', '# Critical Context', '');
    lines.push('Read `context.md` before editing.', '');
    lines.push('# Completion Report', '');
    lines.push('Write `result.md` with: files changed, exported API, verification commands run, blockers.');
    if (data.criticalWarnings.length > 0) {
        lines.push('', '# Critical Warnings', '');
        for (const w of data.criticalWarnings) {
            lines.push(`- **WARNING:** ${w}`);
        }
    }
    lines.push('');
    const content = lines.join('\n');
    const filePath = path.join(taskDir, 'brief.md');
    await writeFile(filePath, content, 'utf-8');
    return filePath;
}

export async function writeContext(taskDir: string, data: {
    taskId: string;
    sourceHashes: Record<string, string>;
    investigation: string;
    constraints: string[];
    reuseCandidates: string[];
    knownRisks: string[];
}): Promise<string> {
    await mkdir(taskDir, { recursive: true });
    const frontmatter: Record<string, unknown> = {
        task_id: data.taskId,
        source_hashes: data.sourceHashes,
    };
    const lines: string[] = [
        '---',
        stringifyYaml(frontmatter).trim(),
        '---',
        '',
        `# Context: ${data.taskId}`,
        '',
        data.investigation,
        '',
    ];
    if (data.constraints.length > 0) {
        lines.push('# Constraints', '');
        for (const c of data.constraints) {
            lines.push(`- ${c}`);
        }
        lines.push('');
    }
    if (data.reuseCandidates.length > 0) {
        lines.push('# Reuse Candidates', '');
        for (const r of data.reuseCandidates) {
            lines.push(`- ${r}`);
        }
        lines.push('');
    }
    if (data.knownRisks.length > 0) {
        lines.push('# Known Risks', '');
        for (const r of data.knownRisks) {
            lines.push(`- ${r}`);
        }
        lines.push('');
    }
    const content = lines.join('\n');
    const filePath = path.join(taskDir, 'context.md');
    await writeFile(filePath, content, 'utf-8');
    return filePath;
}

export async function writeResult(taskDir: string, data: {
    taskId: string;
    status: 'succeeded' | 'failed';
    changedFiles: string[];
    createdSymbols: string[];
    errorSummary?: string;
    downstreamExports: Array<{ kind: string; path: string; summary: string }>;
    notes: string;
}): Promise<string> {
    await mkdir(taskDir, { recursive: true });
    const frontmatter: Record<string, unknown> = {
        task_id: data.taskId,
        status: data.status,
        changed_files: data.changedFiles,
        created_symbols: data.createdSymbols,
    };
    if (data.errorSummary) {
        frontmatter.error_summary = data.errorSummary;
    }
    const lines: string[] = [
        '---',
        stringifyYaml(frontmatter).trim(),
        '---',
        '',
        `# Result: ${data.taskId}`,
        '',
        `**Status:** ${data.status}`,
        '',
    ];
    if (data.changedFiles.length > 0) {
        lines.push('# Changed Files', '');
        for (const f of data.changedFiles) {
            lines.push(`- ${f}`);
        }
        lines.push('');
    }
    if (data.createdSymbols.length > 0) {
        lines.push('# Created Symbols', '');
        for (const s of data.createdSymbols) {
            lines.push(`- ${s}`);
        }
        lines.push('');
    }
    if (data.downstreamExports.length > 0) {
        lines.push('# Downstream Exports', '');
        for (const e of data.downstreamExports) {
            lines.push(`- **${e.kind}:** \`${e.path}\` — ${e.summary}`);
        }
        lines.push('');
    }
    if (data.errorSummary) {
        lines.push('# Error Summary', '', data.errorSummary, '');
    }
    lines.push('# Notes', '', data.notes, '');
    const content = lines.join('\n');
    const filePath = path.join(taskDir, 'result.md');
    await writeFile(filePath, content, 'utf-8');
    return filePath;
}

export async function writeVerify(taskDir: string, data: {
    taskId: string;
    status: 'passed' | 'failed';
    commands: Array<{ command: string; status: string; output?: string }>;
}): Promise<string> {
    await mkdir(taskDir, { recursive: true });
    const frontmatter: Record<string, unknown> = {
        task_id: data.taskId,
        status: data.status,
    };
    const lines: string[] = [
        '---',
        stringifyYaml(frontmatter).trim(),
        '---',
        '',
        `# Verification: ${data.taskId}`,
        '',
        `**Status:** ${data.status}`,
        '',
    ];
    for (const cmd of data.commands) {
        lines.push(`## Command: \`${cmd.command}\``);
        lines.push('');
        lines.push(`**Status:** ${cmd.status}`);
        if (cmd.output !== undefined) {
            lines.push('');
            lines.push('```');
            lines.push(cmd.output);
            lines.push('```');
        }
        lines.push('');
    }
    const content = lines.join('\n');
    const filePath = path.join(taskDir, 'verify.md');
    await writeFile(filePath, content, 'utf-8');
    return filePath;
}

// ============================================================================
// Wave writers
// ============================================================================

export async function writeWavePlan(wavesDir: string, data: {
    buildId: string;
    waveIndex: number;
    tasks: Array<{ taskId: string; phaseId: string; allowedPaths: string[]; dependsOn: string[] }>;
    parallelSafe: boolean;
}): Promise<string> {
    await mkdir(wavesDir, { recursive: true });
    const frontmatter: Record<string, unknown> = {
        build_id: data.buildId,
        wave_index: data.waveIndex,
        parallel_safe: data.parallelSafe,
        task_count: data.tasks.length,
    };
    const lines: string[] = [
        '---',
        stringifyYaml(frontmatter).trim(),
        '---',
        '',
        `# Wave ${data.waveIndex}`,
        '',
        `Build: ${data.buildId}  `,
        `Parallel Safe: ${data.parallelSafe}`,
        '',
        '## Tasks',
        '',
    ];
    for (const t of data.tasks) {
        lines.push(`### ${t.taskId} (${t.phaseId})`);
        lines.push('');
        if (t.dependsOn.length > 0) {
            lines.push(`Depends on: ${t.dependsOn.join(', ')}`);
        }
        if (t.allowedPaths.length > 0) {
            lines.push('');
            lines.push('Allowed paths:');
            for (const p of t.allowedPaths) {
                lines.push(`- ${p}`);
            }
        }
        lines.push('');
    }
    const content = lines.join('\n');
    const filePath = path.join(wavesDir, `wave-${String(data.waveIndex).padStart(3, '0')}.md`);
    await writeFile(filePath, content, 'utf-8');
    return filePath;
}

export async function updateWaveResults(wavesDir: string, waveIndex: number, results: {
    tasks: Array<{ taskId: string; status: string; changedFiles: string[]; verification: string }>;
    contextUpdates: string[];
}): Promise<void> {
    const waveFile = path.join(wavesDir, `wave-${String(waveIndex).padStart(3, '0')}.md`);
    let existing = '';
    if (fs.existsSync(waveFile)) {
        existing = await readFile(waveFile, 'utf-8');
    }
    const lines: string[] = existing ? [existing.trimEnd()] : [
        `# Wave ${waveIndex}`,
        '',
    ];
    lines.push('', '---', '', '## Results', '');
    for (const t of results.tasks) {
        lines.push(`### ${t.taskId}`);
        lines.push('');
        lines.push(`**Status:** ${t.status}`);
        if (t.changedFiles.length > 0) {
            lines.push('');
            lines.push('Changed files:');
            for (const f of t.changedFiles) {
                lines.push(`- ${f}`);
            }
        }
        if (t.verification) {
            lines.push('');
            lines.push(`Verification: ${t.verification}`);
        }
        lines.push('');
    }
    if (results.contextUpdates.length > 0) {
        lines.push('### Context Updates', '');
        for (const u of results.contextUpdates) {
            lines.push(`- ${u}`);
        }
        lines.push('');
    }
    lines.push('');
    await writeFile(waveFile, lines.join('\n'), 'utf-8');
}

// ============================================================================
// Wiki management
// ============================================================================

export async function ensureWikiDir(basePath: string): Promise<string> {
    const wikiDir = getWikiDir(basePath);
    await mkdir(wikiDir, { recursive: true });
    const defaultPages: string[] = [
        'architecture.md',
        'conventions.md',
        'dependency-map.md',
        'changes-log.md',
        'changes-log.jsonl',
    ];
    for (const page of defaultPages) {
        const pagePath = path.join(wikiDir, page);
        if (!fs.existsSync(pagePath)) {
            if (page.endsWith('.jsonl')) {
                await writeFile(pagePath, '', 'utf-8');
            } else {
                const title = page.replace(/\.md$/, '').replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
                await writeFile(pagePath, `# ${title}\n\n`, 'utf-8');
            }
        }
    }
    return wikiDir;
}

export async function writeWikiPage(basePath: string, page: string, content: string): Promise<void> {
    const wikiDir = getWikiDir(basePath);
    await mkdir(wikiDir, { recursive: true });
    const pagePath = path.join(wikiDir, page);
    await writeFile(pagePath, content, 'utf-8');
}

export async function readWikiPage(basePath: string, page: string): Promise<string | null> {
    const wikiDir = getWikiDir(basePath);
    const pagePath = path.join(wikiDir, page);
    if (!fs.existsSync(pagePath)) {
        return null;
    }
    return await readFile(pagePath, 'utf-8');
}

// ============================================================================
// Changes log
// ============================================================================

export async function appendChangesLog(basePath: string, entry: {
    ts: string;
    buildId: string;
    wave: number;
    taskId: string;
    status: string;
    changedFiles: string[];
    exports: string[];
    verify: string;
}): Promise<void> {
    const wikiDir = getWikiDir(basePath);
    await mkdir(wikiDir, { recursive: true });

    // Append to JSONL
    const jsonlPath = path.join(wikiDir, 'changes-log.jsonl');
    const jsonlLine = JSON.stringify(entry) + '\n';
    await writeFile(jsonlPath, jsonlLine, { encoding: 'utf-8', flag: 'a' });

    // Append to markdown log
    const mdPath = path.join(wikiDir, 'changes-log.md');
    const timestamp = entry.ts.replace(/[TZ]/g, ' ').trim();
    const lines: string[] = [
        '',
        `## ${timestamp} — ${entry.taskId}`,
        '',
        `- **Build:** ${entry.buildId}  `,
        `- **Wave:** ${entry.wave}  `,
        `- **Status:** ${entry.status}  `,
    ];
    if (entry.changedFiles.length > 0) {
        lines.push(`- **Files:** ${entry.changedFiles.join(', ')}  `);
    }
    if (entry.exports.length > 0) {
        lines.push(`- **Exports:** ${entry.exports.join(', ')}  `);
    }
    lines.push(`- **Verify:** ${entry.verify}  `);
    lines.push('');
    await writeFile(mdPath, lines.join('\n'), { encoding: 'utf-8', flag: 'a' });
}

// ============================================================================
// Context index
// ============================================================================

export async function writeContextIndex(buildDir: string, index: ContextIndex): Promise<void> {
    await mkdir(buildDir, { recursive: true });
    const indexPath = path.join(buildDir, 'context-index.yaml');
    const content = stringifyYaml(index, { indent: 2 });
    await writeFile(indexPath, content, 'utf-8');
}

export async function readContextIndex(buildDir: string): Promise<ContextIndex | null> {
    const indexPath = path.join(buildDir, 'context-index.yaml');
    if (!fs.existsSync(indexPath)) {
        return null;
    }
    const content = await readFile(indexPath, 'utf-8');
    const parsed = parseYaml(content);
    return parsed as ContextIndex;
}

// ============================================================================
// Wiki snapshot
// ============================================================================

export async function snapshotWiki(basePath: string, snapshotDir: string): Promise<void> {
    const wikiDir = getWikiDir(basePath);
    if (!fs.existsSync(wikiDir)) {
        return;
    }
    await mkdir(snapshotDir, { recursive: true });
    const entries = await readdir(wikiDir, { withFileTypes: true });
    for (const entry of entries) {
        if (entry.isFile()) {
            const srcPath = path.join(wikiDir, entry.name);
            const destPath = path.join(snapshotDir, entry.name);
            await copyFile(srcPath, destPath);
        }
    }
}
