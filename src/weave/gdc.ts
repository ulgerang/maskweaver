import * as fs from 'node:fs';
import * as path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

import { getGdcConfig } from '../shared/config.js';

const execFileAsync = promisify(execFile);

export type GdcEnabledMode = boolean | 'auto';

export interface EffectiveGdcConfig {
    enabled: boolean;
    mode: GdcEnabledMode;
    detected: boolean;
    strictVerify: boolean;
    binPath: string;
    autoSyncOnPrepare: boolean;
    extractContext: {
        withImpl: boolean;
        withTests: boolean;
        withCallers: boolean;
    };
}

export interface GdcMachineEnvelope {
    ok?: boolean;
    contractVersion?: string;
    command?: string;
    timestamp?: string;
    data?: unknown;
    warnings?: unknown[];
    errors?: unknown[];
    meta?: Record<string, unknown>;
}

export interface GdcMachineCommandResult {
    command: string;
    args: string[];
    exitCode: number;
    stdout: string;
    stderr: string;
    durationMs: number;
    timedOut: boolean;
    transportError?: string;
    parseError?: string;
    envelope?: GdcMachineEnvelope;
    data?: unknown;
}

function asObject(value: unknown): Record<string, unknown> | null {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    return value as Record<string, unknown>;
}

function asArray(value: unknown): unknown[] {
    return Array.isArray(value) ? value : [];
}

function asNumber(value: unknown): number | undefined {
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value === 'string' && value.trim().length > 0) {
        const parsed = Number(value);
        if (Number.isFinite(parsed)) return parsed;
    }
    return undefined;
}

function isMachineEnvelope(value: unknown): value is GdcMachineEnvelope {
    const obj = asObject(value);
    if (!obj) return false;
    return (
        Object.prototype.hasOwnProperty.call(obj, 'data')
        || Object.prototype.hasOwnProperty.call(obj, 'ok')
        || Object.prototype.hasOwnProperty.call(obj, 'contractVersion')
        || Object.prototype.hasOwnProperty.call(obj, 'warnings')
        || Object.prototype.hasOwnProperty.call(obj, 'errors')
    );
}

export function detectGdcWorkspace(basePath: string): boolean {
    const gdcDir = path.join(basePath, '.gdc');
    return (
        fs.existsSync(gdcDir)
        || fs.existsSync(path.join(gdcDir, 'config.yaml'))
        || fs.existsSync(path.join(gdcDir, 'nodes'))
    );
}

export function getEffectiveGdcConfig(basePath: string): EffectiveGdcConfig {
    const config = getGdcConfig(basePath);
    const mode = (config?.enabled ?? 'auto') as GdcEnabledMode;
    const detected = detectGdcWorkspace(basePath);
    const enabled = mode === true || (mode !== false && detected);

    return {
        enabled,
        mode,
        detected,
        strictVerify: config?.strictVerify ?? false,
        binPath: config?.binPath?.trim() || 'gdc',
        autoSyncOnPrepare: config?.autoSyncOnPrepare ?? true,
        extractContext: {
            withImpl: config?.extractContext?.withImpl ?? true,
            withTests: config?.extractContext?.withTests ?? true,
            withCallers: config?.extractContext?.withCallers ?? true,
        },
    };
}

function parseMachineOutput(stdout: string): {
    envelope?: GdcMachineEnvelope;
    data?: unknown;
    parseError?: string;
} {
    const text = stdout.trim();
    if (!text) {
        return { parseError: 'empty stdout' };
    }

    try {
        const parsed: unknown = JSON.parse(text);
        if (isMachineEnvelope(parsed)) {
            const envelope = parsed;
            return { envelope, data: envelope.data };
        }
        return { data: parsed };
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return { parseError: message };
    }
}

function splitCommand(commandText: string): string[] {
    const trimmed = commandText.trim();
    if (!trimmed) return [];

    const tokens = trimmed.match(/"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|[^\s]+/g) || [];
    return tokens
        .map(token => token.trim())
        .filter(Boolean)
        .map(token => {
            if ((token.startsWith('"') && token.endsWith('"')) || (token.startsWith("'") && token.endsWith("'"))) {
                return token.slice(1, -1);
            }
            return token;
        });
}

function toTail(text: string, maxChars: number): string {
    if (text.length <= maxChars) return text;
    return text.slice(text.length - maxChars);
}

export async function runGdcMachineCommand(options: {
    basePath: string;
    command: string;
    args?: string[];
    timeoutMs?: number;
    maxOutputChars?: number;
    config?: EffectiveGdcConfig;
}): Promise<GdcMachineCommandResult> {
    const cfg = options.config || getEffectiveGdcConfig(options.basePath);
    const timeoutMs = options.timeoutMs ?? 90_000;
    const maxOutputChars = options.maxOutputChars ?? 200_000;
    const requestedArgs = options.args ? [...options.args] : [];
    if (!requestedArgs.includes('--machine')) {
        requestedArgs.push('--machine');
    }
    const commandParts = splitCommand(cfg.binPath);
    const binary = commandParts[0] || 'gdc';
    const binaryArgs = commandParts.slice(1);
    const fullArgs = [...binaryArgs, options.command, ...requestedArgs];
    const start = Date.now();

    try {
        const { stdout, stderr } = await execFileAsync(binary, fullArgs, {
            cwd: options.basePath,
            timeout: timeoutMs,
            maxBuffer: 2 * 1024 * 1024,
            windowsHide: true,
        });

        const stdoutText = toTail(String(stdout || '').trim(), maxOutputChars);
        const stderrText = toTail(String(stderr || '').trim(), maxOutputChars);
        const parsed = parseMachineOutput(stdoutText);

        return {
            command: options.command,
            args: requestedArgs,
            exitCode: 0,
            stdout: stdoutText,
            stderr: stderrText,
            durationMs: Date.now() - start,
            timedOut: false,
            envelope: parsed.envelope,
            data: parsed.data,
            parseError: parsed.parseError,
        };
    } catch (error: any) {
        const rawCode = error?.code;
        const exitCode = typeof rawCode === 'number'
            ? rawCode
            : rawCode === 'ENOENT'
                ? 127
                : 1;

        const stdoutText = toTail(String(error?.stdout || '').trim(), maxOutputChars);
        const stderrText = toTail(String(error?.stderr || '').trim(), maxOutputChars);
        const timedOut = Boolean(error?.killed)
            || /timed?\s*out/i.test(String(error?.message || ''));

        const parsed = parseMachineOutput(stdoutText);
        const transportError = rawCode === 'ENOENT'
            ? `GDC binary not found: ${cfg.binPath}`
            : (error instanceof Error ? error.message : String(error));

        return {
            command: options.command,
            args: requestedArgs,
            exitCode,
            stdout: stdoutText,
            stderr: stderrText,
            durationMs: Date.now() - start,
            timedOut,
            transportError,
            envelope: parsed.envelope,
            data: parsed.data,
            parseError: parsed.parseError,
        };
    }
}

export function countGdcCheckIssues(data: unknown): {
    errors: number;
    warnings: number;
    infos: number;
    issueCount: number;
} {
    const payload = asObject(data) || {};
    const summary = asObject(payload.summary) || {};
    const summaryErrors = asNumber(summary.error) ?? 0;
    const summaryWarnings = asNumber(summary.warning) ?? 0;
    const summaryInfos = asNumber(summary.info) ?? 0;

    const issues = asArray(payload.issues);
    let issueErrors = 0;
    let issueWarnings = 0;
    let issueInfos = 0;

    for (const issue of issues) {
        const item = asObject(issue);
        const severity = String(item?.severity || '').toLowerCase();
        if (severity === 'error') issueErrors += 1;
        else if (severity === 'warning' || severity === 'warn') issueWarnings += 1;
        else if (severity === 'info') issueInfos += 1;
    }

    return {
        errors: Math.max(summaryErrors, issueErrors),
        warnings: Math.max(summaryWarnings, issueWarnings),
        infos: Math.max(summaryInfos, issueInfos),
        issueCount: issues.length,
    };
}

export function getGraphNodeIds(data: unknown): string[] {
    const payload = asObject(data);
    const nodes = asArray(payload?.nodes);
    const ids = new Set<string>();

    for (const node of nodes) {
        const item = asObject(node);
        const id = typeof item?.id === 'string' ? item.id : '';
        if (id) ids.add(id);
    }

    return Array.from(ids);
}

export function getGraphEdges(data: unknown): Array<{ from: string; to: string }> {
    const payload = asObject(data);
    const edges = asArray(payload?.edges);
    const result: Array<{ from: string; to: string }> = [];

    for (const edge of edges) {
        const item = asObject(edge);
        const from = typeof item?.from === 'string' ? item.from : '';
        const to = typeof item?.to === 'string' ? item.to : '';
        if (from && to) result.push({ from, to });
    }

    return result;
}

export function getStatsNodeSummary(data: unknown): {
    total?: number;
    implemented?: number;
    tested?: number;
} {
    const payload = asObject(data);
    const nodes = asObject(payload?.nodes);
    const byStatus = asObject(nodes?.byStatus);
    return {
        total: asNumber(nodes?.total),
        implemented: asNumber(byStatus?.implemented),
        tested: asNumber(byStatus?.tested),
    };
}
