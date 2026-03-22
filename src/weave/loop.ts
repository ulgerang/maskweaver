import * as fs from 'node:fs';
import * as path from 'node:path';
import { mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';

import { getChangeArtifactDir } from './change-artifacts.js';
import type { WeaveLoopOperatorState, WeaveLoopRun } from './types.js';

export function getLoopsDir(basePath: string): string {
    return path.join(basePath, '.opencode', 'weave', 'loops');
}

export function getLoopDir(basePath: string, loopId: string): string {
    return path.join(getLoopsDir(basePath), loopId);
}

export function toLoopRunPath(loopId: string): string {
    return path.posix.join('.opencode', 'weave', 'loops', loopId, 'run.yaml');
}

export function toLoopEventsPath(loopId: string): string {
    return path.posix.join('.opencode', 'weave', 'loops', loopId, 'events.jsonl');
}

export function toLoopStopPath(loopId: string): string {
    return path.posix.join('.opencode', 'weave', 'loops', loopId, 'stop.json');
}

export function toLoopOperatorStatePath(): string {
    return path.posix.join('.opencode', 'weave', 'loops', 'operator-state.yaml');
}

export function toLoopOperatorLockPath(): string {
    return path.posix.join('.opencode', 'weave', 'loops', 'operator-lock.json');
}

function toKebabCase(input: string): string {
    return input
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');
}

function serializeLoopRun(run: WeaveLoopRun): string {
    return stringifyYaml({
        loop_id: run.loopId,
        change_id: run.changeId,
        phase_id: run.phaseId,
        status: run.status,
        created_at: run.createdAt,
        updated_at: run.updatedAt,
        ...(run.startedAt ? { started_at: run.startedAt } : {}),
        ...(run.stoppedAt ? { stopped_at: run.stoppedAt } : {}),
        ...(run.stopReason ? { stop_reason: run.stopReason } : {}),
        max_iterations: run.maxIterations,
        iteration_count: run.iterationCount,
        max_no_progress: run.maxNoProgress,
        no_progress_count: run.noProgressCount,
        ...(run.lastAttemptId ? { last_attempt_id: run.lastAttemptId } : {}),
        ...(run.lastVerifierResult ? { last_verifier_result: run.lastVerifierResult } : {}),
        ...(run.lastFailureFingerprint ? { last_failure_fingerprint: run.lastFailureFingerprint } : {}),
        ...(run.lastFailureSummary ? { last_failure_summary: run.lastFailureSummary } : {}),
        ...(run.latestWorkerBriefPath ? { latest_worker_brief_path: run.latestWorkerBriefPath } : {}),
        ...(run.collaborationSessionId ? { collaboration_session_id: run.collaborationSessionId } : {}),
        ...(run.latestSquadId ? { latest_squad_id: run.latestSquadId } : {}),
        ...(run.latestTaskBundlePath ? { latest_task_bundle_path: run.latestTaskBundlePath } : {}),
        ...(run.verifyMode ? { verify_mode: run.verifyMode } : {}),
    });
}

function serializeLoopOperatorState(state: WeaveLoopOperatorState): string {
    return stringifyYaml({
        operator_id: state.operatorId,
        status: state.status,
        started_at: state.startedAt,
        updated_at: state.updatedAt,
        ...(state.finishedAt ? { finished_at: state.finishedAt } : {}),
        ...(state.targetLoopId ? { target_loop_id: state.targetLoopId } : {}),
        poll_interval_ms: state.pollIntervalMs,
        poll_cycles: state.pollCycles,
        last_cycle: state.lastCycle,
        synced_count: state.syncedCount,
        failed_count: state.failedCount,
        waiting_count: state.waitingCount,
        ...(state.lastSummary ? { last_summary: state.lastSummary } : {}),
    });
}

export async function readLoopRun(basePath: string, loopId: string): Promise<WeaveLoopRun | null> {
    const runPath = path.join(getLoopDir(basePath, loopId), 'run.yaml');
    if (!fs.existsSync(runPath)) {
        return null;
    }

    const raw = await readFile(runPath, 'utf-8');
    const parsed = parseYaml(raw);
    if (!parsed || typeof parsed !== 'object') {
        return null;
    }

    return {
        loopId: String((parsed as any).loop_id || loopId),
        changeId: String((parsed as any).change_id || ''),
        phaseId: String((parsed as any).phase_id || ''),
        status: String((parsed as any).status || 'running') as WeaveLoopRun['status'],
        createdAt: String((parsed as any).created_at || new Date().toISOString()),
        updatedAt: String((parsed as any).updated_at || new Date().toISOString()),
        startedAt: (parsed as any).started_at ? String((parsed as any).started_at) : undefined,
        stoppedAt: (parsed as any).stopped_at ? String((parsed as any).stopped_at) : undefined,
        stopReason: (parsed as any).stop_reason ? String((parsed as any).stop_reason) : undefined,
        maxIterations: Number((parsed as any).max_iterations || 1),
        iterationCount: Number((parsed as any).iteration_count || 0),
        maxNoProgress: Number((parsed as any).max_no_progress || 1),
        noProgressCount: Number((parsed as any).no_progress_count || 0),
        lastAttemptId: (parsed as any).last_attempt_id ? String((parsed as any).last_attempt_id) : undefined,
        lastVerifierResult: (parsed as any).last_verifier_result
            ? String((parsed as any).last_verifier_result) as WeaveLoopRun['lastVerifierResult']
            : undefined,
        lastFailureFingerprint: (parsed as any).last_failure_fingerprint
            ? String((parsed as any).last_failure_fingerprint)
            : undefined,
        lastFailureSummary: (parsed as any).last_failure_summary
            ? String((parsed as any).last_failure_summary)
            : undefined,
        latestWorkerBriefPath: (parsed as any).latest_worker_brief_path
            ? String((parsed as any).latest_worker_brief_path)
            : undefined,
        collaborationSessionId: (parsed as any).collaboration_session_id
            ? String((parsed as any).collaboration_session_id)
            : undefined,
        latestSquadId: (parsed as any).latest_squad_id
            ? String((parsed as any).latest_squad_id)
            : undefined,
        latestTaskBundlePath: (parsed as any).latest_task_bundle_path
            ? String((parsed as any).latest_task_bundle_path)
            : undefined,
        verifyMode: (parsed as any).verify_mode
            ? String((parsed as any).verify_mode) as WeaveLoopRun['verifyMode']
            : undefined,
    };
}

export async function readLoopOperatorState(basePath: string): Promise<WeaveLoopOperatorState | null> {
    const statePath = path.join(getLoopsDir(basePath), 'operator-state.yaml');
    if (!fs.existsSync(statePath)) {
        return null;
    }

    const raw = await readFile(statePath, 'utf-8');
    const parsed = parseYaml(raw);
    if (!parsed || typeof parsed !== 'object') {
        return null;
    }

    return {
        operatorId: String((parsed as any).operator_id || 'unknown'),
        status: String((parsed as any).status || 'idle') as WeaveLoopOperatorState['status'],
        startedAt: String((parsed as any).started_at || new Date().toISOString()),
        updatedAt: String((parsed as any).updated_at || new Date().toISOString()),
        finishedAt: (parsed as any).finished_at ? String((parsed as any).finished_at) : undefined,
        targetLoopId: (parsed as any).target_loop_id ? String((parsed as any).target_loop_id) : undefined,
        pollIntervalMs: Number((parsed as any).poll_interval_ms || 1000),
        pollCycles: Number((parsed as any).poll_cycles || 30),
        lastCycle: Number((parsed as any).last_cycle || 0),
        syncedCount: Number((parsed as any).synced_count || 0),
        failedCount: Number((parsed as any).failed_count || 0),
        waitingCount: Number((parsed as any).waiting_count || 0),
        lastSummary: (parsed as any).last_summary ? String((parsed as any).last_summary) : undefined,
    };
}

export async function writeLoopRun(basePath: string, run: WeaveLoopRun): Promise<void> {
    const loopDir = getLoopDir(basePath, run.loopId);
    await mkdir(loopDir, { recursive: true });
    await writeFile(path.join(loopDir, 'run.yaml'), serializeLoopRun(run), 'utf-8');
}

export async function writeLoopOperatorState(basePath: string, state: WeaveLoopOperatorState): Promise<void> {
    const loopsDir = getLoopsDir(basePath);
    await mkdir(loopsDir, { recursive: true });
    await writeFile(path.join(loopsDir, 'operator-state.yaml'), serializeLoopOperatorState(state), 'utf-8');
}

export async function resolveLoopId(input: {
    basePath: string;
    changeId: string;
    phaseId: string;
    loopId?: string;
}): Promise<string> {
    const explicit = input.loopId?.trim();
    if (explicit) {
        const sanitized = toKebabCase(explicit);
        if (!sanitized) {
            throw new Error('loopId must contain letters or numbers.');
        }
        return sanitized;
    }

    const baseSlug = toKebabCase(`${input.changeId}-${input.phaseId}-loop`) || 'weave-loop';
    let index = 1;
    while (fs.existsSync(getLoopDir(input.basePath, `${baseSlug}-r${index}`))) {
        index += 1;
    }
    return `${baseSlug}-r${index}`;
}

export async function createLoopRun(input: {
    basePath: string;
    loopId: string;
    changeId: string;
    phaseId: string;
    verifyMode?: 'quick' | 'full';
    maxIterations?: number;
    maxNoProgress?: number;
    status?: WeaveLoopRun['status'];
}): Promise<WeaveLoopRun> {
    const existing = await readLoopRun(input.basePath, input.loopId);
    if (existing) {
        throw new Error(`Loop already exists: ${input.loopId}`);
    }

    const now = new Date().toISOString();
    const run: WeaveLoopRun = {
        loopId: input.loopId,
        changeId: input.changeId,
        phaseId: input.phaseId,
        status: input.status || 'running',
        createdAt: now,
        updatedAt: now,
        startedAt: now,
        maxIterations: input.maxIterations || 1,
        iterationCount: 0,
        maxNoProgress: input.maxNoProgress || 1,
        noProgressCount: 0,
        verifyMode: input.verifyMode,
    };
    await writeLoopRun(input.basePath, run);
    await appendLoopEvent(input.basePath, input.loopId, {
        type: 'loop_created',
        at: now,
        changeId: input.changeId,
        phaseId: input.phaseId,
        status: run.status,
    });
    return run;
}

export async function updateLoopRun(
    basePath: string,
    loopId: string,
    updater: (run: WeaveLoopRun) => WeaveLoopRun
): Promise<WeaveLoopRun | null> {
    const current = await readLoopRun(basePath, loopId);
    if (!current) {
        return null;
    }

    const next = updater({
        ...current,
        updatedAt: new Date().toISOString(),
    });
    await writeLoopRun(basePath, next);
    return next;
}

export async function appendLoopEvent(
    basePath: string,
    loopId: string,
    event: Record<string, unknown>
): Promise<void> {
    const loopDir = getLoopDir(basePath, loopId);
    await mkdir(loopDir, { recursive: true });
    const eventsPath = path.join(loopDir, 'events.jsonl');
    const current = fs.existsSync(eventsPath) ? await readFile(eventsPath, 'utf-8') : '';
    const nextLine = `${JSON.stringify(event)}\n`;
    await writeFile(eventsPath, `${current}${nextLine}`, 'utf-8');
}

export async function acquireLoopOperatorLock(input: {
    basePath: string;
    operatorId: string;
    ttlMs?: number;
}): Promise<
    | { acquired: true }
    | { acquired: false; activeOperatorId?: string; updatedAt?: string }
> {
    const ttlMs = input.ttlMs ?? 5 * 60 * 1000;
    const loopsDir = getLoopsDir(input.basePath);
    await mkdir(loopsDir, { recursive: true });
    const lockPath = path.join(loopsDir, 'operator-lock.json');
    const now = new Date().toISOString();

    if (fs.existsSync(lockPath)) {
        try {
            const raw = await readFile(lockPath, 'utf-8');
            const existing = JSON.parse(raw) as { operatorId?: string; updatedAt?: string };
            const updatedAt = existing.updatedAt ? Date.parse(existing.updatedAt) : Number.NaN;
            const stale = Number.isNaN(updatedAt) || (Date.now() - updatedAt) > ttlMs;
            if (!stale) {
                return {
                    acquired: false,
                    activeOperatorId: existing.operatorId,
                    updatedAt: existing.updatedAt,
                };
            }
        } catch {
            // Overwrite unreadable or partial lock files.
        }
    }

    await writeFile(lockPath, `${JSON.stringify({
        operatorId: input.operatorId,
        startedAt: now,
        updatedAt: now,
        ttlMs,
    }, null, 2)}\n`, 'utf-8');
    return { acquired: true };
}

export async function refreshLoopOperatorLock(input: {
    basePath: string;
    operatorId: string;
}): Promise<void> {
    const lockPath = path.join(getLoopsDir(input.basePath), 'operator-lock.json');
    if (!fs.existsSync(lockPath)) {
        return;
    }

    try {
        const raw = await readFile(lockPath, 'utf-8');
        const parsed = JSON.parse(raw) as { operatorId?: string; startedAt?: string; ttlMs?: number };
        if (parsed.operatorId !== input.operatorId) {
            return;
        }
        await writeFile(lockPath, `${JSON.stringify({
            operatorId: input.operatorId,
            startedAt: parsed.startedAt || new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            ttlMs: parsed.ttlMs || 5 * 60 * 1000,
        }, null, 2)}\n`, 'utf-8');
    } catch {
        // Ignore broken lock refresh attempts.
    }
}

export async function releaseLoopOperatorLock(input: {
    basePath: string;
    operatorId: string;
}): Promise<void> {
    const lockPath = path.join(getLoopsDir(input.basePath), 'operator-lock.json');
    if (!fs.existsSync(lockPath)) {
        return;
    }

    try {
        const raw = await readFile(lockPath, 'utf-8');
        const parsed = JSON.parse(raw) as { operatorId?: string };
        if (parsed.operatorId !== input.operatorId) {
            return;
        }
        await rm(lockPath, { force: true });
    } catch {
        // Best-effort cleanup only.
    }
}

export async function requestLoopStop(input: {
    basePath: string;
    loopId: string;
    reason?: string;
}): Promise<WeaveLoopRun | null> {
    const stopRequestedAt = new Date().toISOString();
    const run = await updateLoopRun(input.basePath, input.loopId, current => ({
        ...current,
        status: current.status === 'verified' ? current.status : 'stopping',
        stopReason: input.reason || 'manual stop requested',
        stoppedAt: current.status === 'verified' ? current.stoppedAt : stopRequestedAt,
    }));
    if (!run) {
        return null;
    }

    const stopPath = path.join(getLoopDir(input.basePath, input.loopId), 'stop.json');
    await writeFile(stopPath, JSON.stringify({
        loopId: input.loopId,
        requestedAt: stopRequestedAt,
        reason: input.reason || 'manual stop requested',
    }, null, 2), 'utf-8');
    await appendLoopEvent(input.basePath, input.loopId, {
        type: 'stop_requested',
        at: stopRequestedAt,
        reason: input.reason || 'manual stop requested',
    });
    return run;
}

export async function listLoopRuns(basePath: string): Promise<WeaveLoopRun[]> {
    const loopsDir = getLoopsDir(basePath);
    if (!fs.existsSync(loopsDir)) {
        return [];
    }

    const entries = await readdir(loopsDir, { withFileTypes: true });
    const runs = await Promise.all(
        entries
            .filter(entry => entry.isDirectory())
            .map(entry => readLoopRun(basePath, entry.name))
    );

    return runs
        .filter((run): run is WeaveLoopRun => Boolean(run))
        .sort((a, b) => a.loopId.localeCompare(b.loopId));
}

export async function ensureLoopContract(input: {
    basePath: string;
    changeId: string;
    loopId: string;
    phaseId: string;
    maxIterations: number;
    maxNoProgress?: number;
}): Promise<string> {
    const loopsDir = path.join(getChangeArtifactDir(input.basePath, input.changeId), 'loops');
    await mkdir(loopsDir, { recursive: true });
    const loopPath = path.join(loopsDir, `${input.loopId}.md`);
    if (!fs.existsSync(loopPath)) {
        const content = [
            '# Loop Contract',
            '',
            `- Loop ID: \`${input.loopId}\``,
            `- Change ID: \`${input.changeId}\``,
            `- Phase ID: \`${input.phaseId}\``,
            `- Max iterations: ${input.maxIterations}`,
            `- Max no-progress retries: ${input.maxNoProgress || 1}`,
            '',
            '## Done When',
            '',
            '- Verification passes for the current phase and change.',
            '',
        ].join('\n');
        await writeFile(loopPath, content, 'utf-8');
    }
    return path.posix.join('.opencode', 'weave', 'changes', input.changeId, 'loops', `${input.loopId}.md`);
}

export async function writeLoopAttemptVerificationReport(input: {
    basePath: string;
    changeId: string;
    loopId: string;
    iteration: number;
    reportMarkdown: string;
    passed: boolean;
}): Promise<string> {
    const attemptId = `attempt-${String(input.iteration).padStart(3, '0')}`;
    const attemptDir = path.join(
        getChangeArtifactDir(input.basePath, input.changeId),
        'attempts',
        input.loopId,
        attemptId
    );
    await mkdir(attemptDir, { recursive: true });
    const verifyPath = path.join(attemptDir, 'verify.md');
    const content = [
        '# Attempt Verify',
        '',
        `- Loop ID: \`${input.loopId}\``,
        `- Attempt: \`${attemptId}\``,
        `- Status: ${input.passed ? 'pass' : 'fail'}`,
        `- Updated: ${new Date().toISOString()}`,
        '',
        input.reportMarkdown.trim(),
        '',
    ].join('\n');
    await writeFile(verifyPath, content, 'utf-8');
    return path.posix.join('.opencode', 'weave', 'changes', input.changeId, 'attempts', input.loopId, attemptId, 'verify.md');
}

export async function writeLoopAttemptControllerNotes(input: {
    basePath: string;
    changeId: string;
    loopId: string;
    iteration: number;
    failureSummary: string;
    noProgressCount: number;
    maxNoProgress: number;
    nextActionLines: string[];
}): Promise<{ summaryPath: string; nextActionPath: string }> {
    const attemptId = `attempt-${String(input.iteration).padStart(3, '0')}`;
    const attemptDir = path.join(
        getChangeArtifactDir(input.basePath, input.changeId),
        'attempts',
        input.loopId,
        attemptId
    );
    await mkdir(attemptDir, { recursive: true });

    const summaryAbsPath = path.join(attemptDir, 'summary.md');
    const nextActionAbsPath = path.join(attemptDir, 'next-action.md');

    const summaryContent = [
        '# Attempt Summary',
        '',
        `- Loop ID: \`${input.loopId}\``,
        `- Attempt: \`${attemptId}\``,
        `- No progress: ${input.noProgressCount}/${input.maxNoProgress}`,
        '',
        '## Failure Summary',
        '',
        `- ${input.failureSummary}`,
        '',
    ].join('\n');
    const nextActionContent = [
        '# Next Action',
        '',
        ...input.nextActionLines.map(line => `- ${line}`),
        '',
    ].join('\n');

    await writeFile(summaryAbsPath, summaryContent, 'utf-8');
    await writeFile(nextActionAbsPath, nextActionContent, 'utf-8');

    return {
        summaryPath: path.posix.join('.opencode', 'weave', 'changes', input.changeId, 'attempts', input.loopId, attemptId, 'summary.md'),
        nextActionPath: path.posix.join('.opencode', 'weave', 'changes', input.changeId, 'attempts', input.loopId, attemptId, 'next-action.md'),
    };
}

export async function writeLoopAttemptWorkerBrief(input: {
    basePath: string;
    changeId: string;
    loopId: string;
    iteration: number;
    briefMarkdown: string;
}): Promise<string> {
    const attemptId = `attempt-${String(input.iteration).padStart(3, '0')}`;
    const attemptDir = path.join(
        getChangeArtifactDir(input.basePath, input.changeId),
        'attempts',
        input.loopId,
        attemptId
    );
    await mkdir(attemptDir, { recursive: true });
    const briefAbsPath = path.join(attemptDir, 'worker-brief.md');
    await writeFile(briefAbsPath, `${input.briefMarkdown.trim()}\n`, 'utf-8');
    return path.posix.join('.opencode', 'weave', 'changes', input.changeId, 'attempts', input.loopId, attemptId, 'worker-brief.md');
}

export async function writeLoopAttemptTaskBundle(input: {
    basePath: string;
    changeId: string;
    loopId: string;
    iteration: number;
    bundle: Record<string, unknown>;
}): Promise<string> {
    const attemptId = `attempt-${String(input.iteration).padStart(3, '0')}`;
    const attemptDir = path.join(
        getChangeArtifactDir(input.basePath, input.changeId),
        'attempts',
        input.loopId,
        attemptId
    );
    await mkdir(attemptDir, { recursive: true });
    const bundleAbsPath = path.join(attemptDir, 'task-bundle.json');
    await writeFile(bundleAbsPath, `${JSON.stringify(input.bundle, null, 2)}\n`, 'utf-8');
    return path.posix.join('.opencode', 'weave', 'changes', input.changeId, 'attempts', input.loopId, attemptId, 'task-bundle.json');
}
