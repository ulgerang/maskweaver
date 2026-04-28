import * as fs from 'node:fs';
import * as path from 'node:path';
import { mkdir, readFile, writeFile } from 'node:fs/promises';

import type { WeavePlan, WeavePhase, StructuralChange } from '../types.js';
import {
    getOpenspecDir,
    getOpenspecChangeDir,
    toOpenspecChangePath,
} from '../change-artifacts.js';

export interface OpenSpecOutputOptions {
    basePath: string;
    changeId: string;
    plan: WeavePlan;
    /** Overwrite existing files (default: false). */
    overwrite?: boolean;
}

export interface OpenSpecOutputResult {
    changeDir: string;
    files: string[];
    summary: string;
}

function generateProposalMd(plan: WeavePlan): string {
    const lines: string[] = [];
    lines.push(`# ${plan.vision.split('\n')[0] || plan.projectName}`);
    lines.push('');
    lines.push('## Summary');
    lines.push('');
    lines.push(plan.vision);
    lines.push('');
    if (plan.structuralChanges && plan.structuralChanges.length > 0) {
        lines.push('## Structural Changes');
        lines.push('');
        for (const sc of plan.structuralChanges) {
            const icon = sc.breaking ? '⚠️' : '📦';
            const status = sc.agreed ? '✅ Agreed' : '⏳ Pending';
            lines.push(`- ${icon} **${sc.area}** (${status})`);
            lines.push(`  - Current: ${sc.currentState}`);
            lines.push(`  - Proposed: ${sc.proposedChange}`);
            lines.push(`  - Rationale: ${sc.rationale}`);
        }
        lines.push('');
    }
    lines.push('## Architecture');
    lines.push('');
    if (plan.architecture.frontend) lines.push(`- Frontend: ${plan.architecture.frontend}`);
    if (plan.architecture.backend) lines.push(`- Backend: ${plan.architecture.backend}`);
    if (plan.architecture.database) lines.push(`- Database: ${plan.architecture.database}`);
    if (plan.architecture.notes) lines.push(`- Notes: ${plan.architecture.notes}`);
    lines.push('');
    lines.push('## Phases');
    lines.push('');
    for (const phase of plan.phases) {
        lines.push(`- **${phase.id}: ${phase.name}** (${phase.estimatedHours ? `~${phase.estimatedHours}h` : 'TBD'})`);
        lines.push(`  - Done when: ${phase.doneWhen}`);
        if (phase.dependsOn && phase.dependsOn.length > 0) {
            lines.push(`  - Depends on: ${phase.dependsOn.join(', ')}`);
        }
    }
    return lines.join('\n');
}

function generateDesignMd(plan: WeavePlan): string {
    const lines: string[] = [];
    lines.push(`# Design: ${plan.vision.split('\n')[0] || plan.projectName}`);
    lines.push('');
    lines.push('## Technical Approach');
    lines.push('');
    if (plan.architecture.frontend) lines.push(`- Frontend: ${plan.architecture.frontend}`);
    if (plan.architecture.backend) lines.push(`- Backend: ${plan.architecture.backend}`);
    if (plan.architecture.database) lines.push(`- Database: ${plan.architecture.database}`);
    if (plan.architecture.notes) lines.push(`- Notes: ${plan.architecture.notes}`);
    lines.push('');
    if (plan.structuralChanges && plan.structuralChanges.length > 0) {
        lines.push('## Structural Changes');
        lines.push('');
        for (const sc of plan.structuralChanges) {
            lines.push(`### ${sc.area}`);
            lines.push(`- **Current**: ${sc.currentState}`);
            lines.push(`- **Proposed**: ${sc.proposedChange}`);
            lines.push(`- **Rationale**: ${sc.rationale}`);
            lines.push(`- **Impact**: ${sc.impact}`);
            lines.push(`- **Breaking**: ${sc.breaking ? 'Yes' : 'No'}`);
            if (sc.affectedFiles.length > 0) {
                lines.push(`- **Affected files**: ${sc.affectedFiles.join(', ')}`);
            }
            lines.push('');
        }
    }
    lines.push('## Phases');
    lines.push('');
    for (const phase of plan.phases) {
        lines.push(`### ${phase.id}: ${phase.name}`);
        lines.push(`- **Done when**: ${phase.doneWhen}`);
        if (phase.dependsOn && phase.dependsOn.length > 0) {
            lines.push(`- **Depends on**: ${phase.dependsOn.join(', ')}`);
        }
        lines.push('');
        if (phase.tasks.length > 0) {
            lines.push('| Task | Status | Files |');
            lines.push('|------|--------|-------|');
            for (const task of phase.tasks) {
                const files = task.files?.join(', ') || '-';
                lines.push(`| ${task.name} | ${task.status} | ${files} |`);
            }
            lines.push('');
        }
    }
    return lines.join('\n');
}

function generateTasksMd(plan: WeavePlan): string {
    const lines: string[] = [];
    lines.push(`# Tasks: ${plan.vision.split('\n')[0] || plan.projectName}`);
    lines.push('');

    for (const phase of plan.phases) {
        lines.push(`## ${phase.id}: ${phase.name}`);
        lines.push('');
        for (const task of phase.tasks) {
            const checkbox = task.status === 'passed' ? '[x]' : '[ ]';
            lines.push(`- ${checkbox} **${task.id}**: ${task.name}`);
            if (task.testCase) lines.push(`  - Test: ${task.testCase}`);
            if (task.files && task.files.length > 0) lines.push(`  - Files: ${task.files.join(', ')}`);
            if (task.acceptanceRefs && task.acceptanceRefs.length > 0) {
                lines.push(`  - Spec refs: ${task.acceptanceRefs.join(', ')}`);
            }
        }
        lines.push('');
    }
    return lines.join('\n');
}

function generateSpecMd(phase: WeavePhase, specIndex: number): string {
    const lines: string[] = [];
    lines.push(`# Spec: ${phase.name}`);
    lines.push('');
    lines.push(`- Phase: ${phase.id}`);
    lines.push(`- Done when: ${phase.doneWhen}`);
    lines.push('');
    lines.push('## Acceptance Criteria');
    lines.push('');
    for (const item of phase.checklist) {
        lines.push(`- [ ] ${item}`);
    }
    lines.push('');
    lines.push('## Tasks');
    lines.push('');
    for (const task of phase.tasks) {
        lines.push(`### ${task.id}: ${task.name}`);
        if (task.testCase) {
            lines.push('');
            lines.push('```');
            lines.push(`Given/When/Then: ${task.testCase}`);
            lines.push('```');
            lines.push('');
        }
        if (task.verify && task.verify.length > 0) {
            for (const v of task.verify) {
                lines.push(`- Verification: \`${v.value}\``);
            }
            lines.push('');
        }
    }
    return lines.join('\n');
}

export async function generateOpenSpecArtifacts(options: OpenSpecOutputOptions): Promise<OpenSpecOutputResult> {
    const { basePath, changeId, plan, overwrite } = options;
    const changeDir = getOpenspecChangeDir(basePath, changeId);
    await mkdir(changeDir, { recursive: true });
    await mkdir(path.join(changeDir, 'specs'), { recursive: true });

    const generatedFiles: string[] = [];

    const filesToWrite: Array<[string, string]> = [];

    const proposalPath = path.join(changeDir, 'proposal.md');
    if (overwrite || !fs.existsSync(proposalPath)) {
        filesToWrite.push([proposalPath, generateProposalMd(plan)]);
    }

    const designPath = path.join(changeDir, 'design.md');
    if (overwrite || !fs.existsSync(designPath)) {
        filesToWrite.push([designPath, generateDesignMd(plan)]);
    }

    const tasksPath = path.join(changeDir, 'tasks.md');
    if (overwrite || !fs.existsSync(tasksPath)) {
        filesToWrite.push([tasksPath, generateTasksMd(plan)]);
    }

    for (let i = 0; i < plan.phases.length; i++) {
        const phase = plan.phases[i];
        const specName = phase.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || `phase-${i + 1}`;
        const specPath = path.join(changeDir, 'specs', `${specName}.md`);
        if (overwrite || !fs.existsSync(specPath)) {
            filesToWrite.push([specPath, generateSpecMd(phase, i + 1)]);
        }
    }

    for (const [filePath, content] of filesToWrite) {
        const dir = path.dirname(filePath);
        await mkdir(dir, { recursive: true });
        await writeFile(filePath, content, 'utf-8');
        generatedFiles.push(path.relative(basePath, filePath).replace(/\\/g, '/'));
    }

    return {
        changeDir: path.relative(basePath, changeDir).replace(/\\/g, '/'),
        files: generatedFiles,
        summary: `Generated ${generatedFiles.length} OpenSpec artifacts in openspec/changes/${changeId}/`,
    };
}

export async function updateOpenSpecTasks(
    basePath: string,
    changeId: string,
    phaseId: string,
    taskId: string,
    passed: boolean
): Promise<void> {
    const tasksPath = path.join(getOpenspecChangeDir(basePath, changeId), 'tasks.md');
    if (!fs.existsSync(tasksPath)) return;

    const content = await readFile(tasksPath, 'utf-8');
    const escaped = taskId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const marker = `\\*\\*${escaped}\\*\\*`;
    const checkbox = passed ? '[x]' : '[ ]';
    const re = new RegExp(`(\\[[ x]\\]\\s)${marker}`, 'g');
    const updated = content.replace(re, `${checkbox} **${taskId}**`);

    if (updated !== content) {
        await writeFile(tasksPath, updated, 'utf-8');
    }
}

export async function ensureOpenSpecWorkspace(basePath: string): Promise<void> {
    const openspecDir = getOpenspecDir(basePath);
    if (!fs.existsSync(openspecDir)) {
        await mkdir(openspecDir, { recursive: true });
        await mkdir(path.join(openspecDir, 'changes'), { recursive: true });
    }
}
