/**
 * Weave Intake — Interview State Persistence
 *
 * File-based JSON persistence for multi-round interview state.
 * Stores state in `.opencode/weave/interview/` directory.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import type { InterviewState } from './intake-types.js';

export function getInterviewDir(basePath: string): string {
    const dir = path.join(basePath, '.opencode', 'weave', 'interview');
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
    return dir;
}

function interviewStatePath(basePath: string, interviewId: string): string {
    return path.join(getInterviewDir(basePath), `${interviewId}.json`);
}

function getLatestInterviewId(basePath: string): string | null {
    const dir = getInterviewDir(basePath);
    try {
        const files = fs.readdirSync(dir).filter(f => f.endsWith('.json'));
        if (files.length === 0) return null;
        return files[files.length - 1].replace('.json', '');
    } catch {
        return null;
    }
}

export function saveInterviewState(basePath: string, state: InterviewState): void {
    const filePath = interviewStatePath(basePath, state.interviewId);
    state.updatedAt = new Date().toISOString();
    fs.writeFileSync(filePath, JSON.stringify(state, null, 2), 'utf-8');
}

export function loadInterviewState(basePath: string, interviewId?: string): InterviewState | null {
    const id = interviewId || getLatestInterviewId(basePath);
    if (!id) return null;

    const filePath = interviewStatePath(basePath, id);
    if (!fs.existsSync(filePath)) return null;

    try {
        const content = fs.readFileSync(filePath, 'utf-8');
        return JSON.parse(content) as InterviewState;
    } catch {
        return null;
    }
}

export function listInterviewStates(basePath: string): Array<{ id: string; status: string; rounds: number }> {
    const dir = getInterviewDir(basePath);
    const results: Array<{ id: string; status: string; rounds: number }> = [];

    try {
        for (const file of fs.readdirSync(dir)) {
            if (!file.endsWith('.json')) continue;
            try {
                const content = fs.readFileSync(path.join(dir, file), 'utf-8');
                const state = JSON.parse(content) as InterviewState;
                results.push({
                    id: state.interviewId,
                    status: state.status,
                    rounds: state.rounds.length,
                });
            } catch { /* skip corrupt files */ }
        }
    } catch { /* dir not found */ }

    return results;
}
