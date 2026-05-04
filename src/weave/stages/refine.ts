/**
 * Weave Refine Stage
 *
 * Applies structured plan-note directives to an existing plan.
 * This enables an annotation cycle where humans edit notes and
 * the plan is updated mechanically before implementation.
 */

import type { PhaseStatus, WeavePhase, WeavePlan, GherkinScenario } from '../types.js';
import { parseGherkinBlock } from '../gherkin.js';

const STATUS_VALUES: Set<PhaseStatus> = new Set([
    'pending',
    'in_progress',
    'completed',
    'blocked',
]);

export interface RefinePlanResult {
    updatedPlan: WeavePlan;
    changed: boolean;
    directivesParsed: number;
    changes: string[];
    warnings: string[];
}

function normalizeNoteLine(raw: string): string {
    let line = raw.trim();
    if (!line) return '';
    line = line.replace(/^[-*+]\s+/, '');
    line = line.replace(/^\d+\.\s+/, '');
    return line.trim();
}

function nextTaskNumber(phase: WeavePhase): number {
    let max = 0;
    for (const task of phase.tasks) {
        const match = /-T(\d+)$/i.exec(task.id);
        if (!match) continue;
        const n = Number.parseInt(match[1], 10);
        if (Number.isFinite(n) && n > max) {
            max = n;
        }
    }
    return max + 1;
}

function splitPipeSpec(spec: string): string[] {
    return spec
        .split('|')
        .map(part => part.trim())
        .filter(part => part.length > 0);
}

function parseKeyValue(part: string): { key: string; value: string } | null {
    const idx = part.indexOf('=');
    if (idx < 0) return null;
    const key = part.slice(0, idx).trim().toLowerCase();
    const value = part.slice(idx + 1).trim();
    if (!key || !value) return null;
    return { key, value };
}

function findPhase(plan: WeavePlan, phaseId: string): WeavePhase | null {
    return plan.phases.find(phase => phase.id.toUpperCase() === phaseId.toUpperCase()) || null;
}

function removePhaseAndFixDependencies(plan: WeavePlan, phaseId: string, changes: string[]): void {
    const index = plan.phases.findIndex(phase => phase.id.toUpperCase() === phaseId.toUpperCase());
    if (index < 0) return;

    const removed = plan.phases[index];
    plan.phases.splice(index, 1);
    changes.push(`- Removed phase ${removed.id} (${removed.name})`);

    const existingIds = new Set(plan.phases.map(phase => phase.id));
    for (const phase of plan.phases) {
        if (!phase.dependsOn || phase.dependsOn.length === 0) continue;
        const before = phase.dependsOn.length;
        phase.dependsOn = phase.dependsOn.filter(dep => existingIds.has(dep));
        if (phase.dependsOn.length !== before) {
            changes.push(`~ Updated dependencies for ${phase.id}`);
        }
        if (phase.dependsOn.length === 0) {
            phase.dependsOn = undefined;
        }
    }

    if (plan.currentPhase && !existingIds.has(plan.currentPhase)) {
        plan.currentPhase = undefined;
        changes.push('~ Cleared current_phase (removed phase was active)');
    }
}

function formatPhaseLabel(phase: WeavePhase): string {
    return `${phase.id} (${phase.name})`;
}

export function refinePlanFromNotes(plan: WeavePlan, notesContent: string): RefinePlanResult {
    const updated = JSON.parse(JSON.stringify(plan)) as WeavePlan;
    const changes: string[] = [];
    const warnings: string[] = [];
    let directivesParsed = 0;

    const lines = notesContent.split(/\r?\n/);
    for (let i = 0; i < lines.length; i += 1) {
        const original = lines[i] || '';
        const line = normalizeNoteLine(original);
        if (!line || line.startsWith('#') || line.startsWith('>')) {
            continue;
        }
        if (!line.startsWith('@')) {
            continue;
        }

        let matched = false;

        const planVision = /^@plan\s+vision\s*:\s*(.+)$/i.exec(line);
        if (planVision) {
            directivesParsed += 1;
            matched = true;
            const nextVision = planVision[1].trim();
            if (nextVision.length > 0 && nextVision !== updated.vision) {
                updated.vision = nextVision;
                changes.push('~ Updated plan vision');
            }
        }

        if (matched) continue;

        const archLine = /^@arch\s+(frontend|backend|database|notes)\s*:\s*(.+)$/i.exec(line);
        if (archLine) {
            directivesParsed += 1;
            matched = true;
            const key = archLine[1].toLowerCase() as keyof WeavePlan['architecture'];
            const value = archLine[2].trim();
            if (value.length > 0 && updated.architecture[key] !== value) {
                updated.architecture[key] = value;
                changes.push(`~ Updated architecture.${key}`);
            }
        }

        if (matched) continue;

        const phaseAdd = /^@phase\s+add\s+([A-Za-z0-9_-]+)\s*:\s*(.+)$/i.exec(line);
        if (phaseAdd) {
            directivesParsed += 1;
            matched = true;

            const phaseId = phaseAdd[1].toUpperCase();
            const existing = findPhase(updated, phaseId);
            if (existing) {
                warnings.push(`Line ${i + 1}: phase ${phaseId} already exists (skipped add).`);
                continue;
            }

            const parts = splitPipeSpec(phaseAdd[2]);
            const name = parts[0] || phaseId;
            let doneWhen = `${name} can be used`;
            let estimatedHours: number | undefined;

            for (const p of parts.slice(1)) {
                const kv = parseKeyValue(p);
                if (!kv) continue;
                if (kv.key === 'done' || kv.key === 'done_when') {
                    doneWhen = kv.value;
                } else if (kv.key === 'hours') {
                    const n = Number.parseFloat(kv.value);
                    if (Number.isFinite(n) && n > 0) {
                        estimatedHours = n;
                    }
                }
            }

            const phase: WeavePhase = {
                id: phaseId,
                name,
                status: 'pending',
                doneWhen,
                checklist: [
                    `${name} UI/behavior is visible`,
                    `${name} works in normal scenario`,
                ],
                tasks: [],
                estimatedHours,
            };

            updated.phases.push(phase);
            changes.push(`+ Added phase ${phaseId} (${name})`);
        }

        if (matched) continue;

        const phaseRemove = /^@phase\s+remove\s+([A-Za-z0-9_-]+)$/i.exec(line);
        if (phaseRemove) {
            directivesParsed += 1;
            matched = true;
            const phaseId = phaseRemove[1].toUpperCase();
            const existing = findPhase(updated, phaseId);
            if (!existing) {
                warnings.push(`Line ${i + 1}: phase ${phaseId} not found (skipped remove).`);
                continue;
            }
            removePhaseAndFixDependencies(updated, phaseId, changes);
        }

        if (matched) continue;

        const phaseField = /^@phase\s+([A-Za-z0-9_-]+)\s+(name|done_when|status)\s*:\s*(.+)$/i.exec(line);
        if (phaseField) {
            directivesParsed += 1;
            matched = true;

            const phaseId = phaseField[1].toUpperCase();
            const field = phaseField[2].toLowerCase();
            const value = phaseField[3].trim();
            const phase = findPhase(updated, phaseId);

            if (!phase) {
                warnings.push(`Line ${i + 1}: phase ${phaseId} not found (skipped ${field}).`);
                continue;
            }

            if (field === 'name' && value.length > 0 && phase.name !== value) {
                const old = phase.name;
                phase.name = value;
                changes.push(`~ ${phaseId} name: "${old}" -> "${value}"`);
            } else if (field === 'done_when' && value.length > 0 && phase.doneWhen !== value) {
                phase.doneWhen = value;
                changes.push(`~ ${phaseId} done_when updated`);
            } else if (field === 'status') {
                const next = value.toLowerCase() as PhaseStatus;
                if (!STATUS_VALUES.has(next)) {
                    warnings.push(`Line ${i + 1}: invalid status "${value}" for ${phaseId}.`);
                    continue;
                }
                if (phase.status !== next) {
                    phase.status = next;
                    changes.push(`~ ${phaseId} status -> ${next}`);
                }
            }
        }

        if (matched) continue;

        const addChecklist = /^@phase\s+([A-Za-z0-9_-]+)\s+add_checklist\s*:\s*(.+)$/i.exec(line);
        if (addChecklist) {
            directivesParsed += 1;
            matched = true;
            const phaseId = addChecklist[1].toUpperCase();
            const item = addChecklist[2].trim();
            const phase = findPhase(updated, phaseId);
            if (!phase) {
                warnings.push(`Line ${i + 1}: phase ${phaseId} not found (skipped checklist add).`);
                continue;
            }
            if (!phase.checklist.includes(item)) {
                phase.checklist.push(item);
                changes.push(`+ ${phaseId} checklist: ${item}`);
            }
        }

        if (matched) continue;

        const removeChecklist = /^@phase\s+([A-Za-z0-9_-]+)\s+remove_checklist\s*:\s*(.+)$/i.exec(line);
        if (removeChecklist) {
            directivesParsed += 1;
            matched = true;
            const phaseId = removeChecklist[1].toUpperCase();
            const item = removeChecklist[2].trim();
            const phase = findPhase(updated, phaseId);
            if (!phase) {
                warnings.push(`Line ${i + 1}: phase ${phaseId} not found (skipped checklist remove).`);
                continue;
            }

            const before = phase.checklist.length;
            phase.checklist = phase.checklist.filter(v => v !== item);
            if (phase.checklist.length !== before) {
                changes.push(`- ${phaseId} checklist removed: ${item}`);
            }
        }

        if (matched) continue;

        const addTask = /^@phase\s+([A-Za-z0-9_-]+)\s+add_task\s*:\s*(.+)$/i.exec(line);
        if (addTask) {
            directivesParsed += 1;
            matched = true;
            const phaseId = addTask[1].toUpperCase();
            const phase = findPhase(updated, phaseId);
            if (!phase) {
                warnings.push(`Line ${i + 1}: phase ${phaseId} not found (skipped task add).`);
                continue;
            }

            const parts = splitPipeSpec(addTask[2]);
            const taskName = (parts[0] || '').trim();
            if (!taskName) {
                warnings.push(`Line ${i + 1}: empty task name (skipped).`);
                continue;
            }

            let explicitId: string | undefined;
            let testCase: string | undefined;
            let maxRetries = 3;

            for (const p of parts.slice(1)) {
                const kv = parseKeyValue(p);
                if (!kv) continue;
                if (kv.key === 'id') {
                    explicitId = kv.value;
                } else if (kv.key === 'test' || kv.key === 'test_case') {
                    testCase = kv.value;
                } else if (kv.key === 'retries' || kv.key === 'max_retries') {
                    const n = Number.parseInt(kv.value, 10);
                    if (Number.isFinite(n) && n >= 1) {
                        maxRetries = n;
                    }
                }
            }

            const duplicateByName = phase.tasks.find(task => task.name === taskName && (task.testCase || '') === (testCase || ''));
            if (duplicateByName) {
                warnings.push(`Line ${i + 1}: task already exists in ${formatPhaseLabel(phase)} (skipped add).`);
                continue;
            }

            const taskId = explicitId && explicitId.trim().length > 0
                ? explicitId.trim()
                : `${phase.id}-T${nextTaskNumber(phase)}`;

            const duplicateById = phase.tasks.find(task => task.id === taskId);
            if (duplicateById) {
                warnings.push(`Line ${i + 1}: task id ${taskId} already exists (skipped add).`);
                continue;
            }

            phase.tasks.push({
                id: taskId,
                name: taskName,
                status: 'pending',
                retryCount: 0,
                maxRetries,
                testCase,
            });
            changes.push(`+ ${phase.id} task added: ${taskId} (${taskName})`);
        }

        if (matched) continue;

        const removeTask = /^@phase\s+([A-Za-z0-9_-]+)\s+remove_task\s*:\s*(.+)$/i.exec(line);
        if (removeTask) {
            directivesParsed += 1;
            matched = true;
            const phaseId = removeTask[1].toUpperCase();
            const taskId = removeTask[2].trim();
            const phase = findPhase(updated, phaseId);
            if (!phase) {
                warnings.push(`Line ${i + 1}: phase ${phaseId} not found (skipped task remove).`);
                continue;
            }

            const before = phase.tasks.length;
            phase.tasks = phase.tasks.filter(task => task.id !== taskId);
            if (phase.tasks.length !== before) {
                changes.push(`- ${phase.id} task removed: ${taskId}`);
            }
        }

        if (matched) continue;

        const renameTask = /^@phase\s+([A-Za-z0-9_-]+)\s+rename_task\s+([A-Za-z0-9_-]+)\s*:\s*(.+)$/i.exec(line);
        if (renameTask) {
            directivesParsed += 1;
            matched = true;
            const phaseId = renameTask[1].toUpperCase();
            const taskId = renameTask[2].trim();
            const name = renameTask[3].trim();
            const phase = findPhase(updated, phaseId);
            if (!phase) {
                warnings.push(`Line ${i + 1}: phase ${phaseId} not found (skipped task rename).`);
                continue;
            }

            const task = phase.tasks.find(t => t.id === taskId);
            if (!task) {
                warnings.push(`Line ${i + 1}: task ${taskId} not found in ${phase.id}.`);
                continue;
            }
            if (name.length > 0 && task.name !== name) {
                const old = task.name;
                task.name = name;
                changes.push(`~ ${phase.id} task ${taskId}: "${old}" -> "${name}"`);
            }
        }

        if (matched) continue;

        const addCriteria = /^@phase\s+([A-Za-z0-9_-]+)\s+add_criteria\s*:\s*(.+)$/is.exec(line);
        if (addCriteria) {
            directivesParsed += 1;
            matched = true;
            const phaseId = addCriteria[1].toUpperCase();
            const rawBlock = addCriteria[2].trim();
            const phase = findPhase(updated, phaseId);
            if (!phase) {
                warnings.push(`Line ${i + 1}: phase ${phaseId} not found (skipped criteria add).`);
                continue;
            }

            const scenarios = parseGherkinBlock(rawBlock);
            if (scenarios.length === 0) {
                warnings.push(`Line ${i + 1}: could not parse Gherkin block for ${phaseId}.`);
                continue;
            }

            if (!phase.acceptanceCriteria) phase.acceptanceCriteria = [];
            phase.acceptanceCriteria.push(...scenarios);
            changes.push(`+ ${phaseId} acceptance criteria: ${scenarios.length} scenario(s)`);
        }

        if (matched) continue;

        const replaceCriteria = /^@phase\s+([A-Za-z0-9_-]+)\s+replace_criteria\s*:\s*(.+)$/is.exec(line);
        if (replaceCriteria) {
            directivesParsed += 1;
            matched = true;
            const phaseId = replaceCriteria[1].toUpperCase();
            const rawBlock = replaceCriteria[2].trim();
            const phase = findPhase(updated, phaseId);
            if (!phase) {
                warnings.push(`Line ${i + 1}: phase ${phaseId} not found (skipped criteria replace).`);
                continue;
            }

            const scenarios = parseGherkinBlock(rawBlock);
            if (scenarios.length === 0) {
                warnings.push(`Line ${i + 1}: could not parse Gherkin block for ${phaseId}.`);
                continue;
            }

            phase.acceptanceCriteria = scenarios;
            changes.push(`~ ${phaseId} acceptance criteria replaced: ${scenarios.length} scenario(s)`);
        }

        if (matched) continue;

        const taskCriteria = /^@task\s+([A-Za-z0-9_-]+)\s+([A-Za-z0-9_-]+)\s+criteria\s*:\s*(.+)$/is.exec(line);
        if (taskCriteria) {
            directivesParsed += 1;
            matched = true;
            const phaseId = taskCriteria[1].toUpperCase();
            const taskId = taskCriteria[2].trim();
            const rawBlock = taskCriteria[3].trim();
            const phase = findPhase(updated, phaseId);
            if (!phase) {
                warnings.push(`Line ${i + 1}: phase ${phaseId} not found (skipped task criteria).`);
                continue;
            }

            const task = phase.tasks.find(t => t.id === taskId);
            if (!task) {
                warnings.push(`Line ${i + 1}: task ${taskId} not found in ${phaseId} (skipped criteria).`);
                continue;
            }

            const scenarios = parseGherkinBlock(rawBlock);
            if (scenarios.length === 0) {
                warnings.push(`Line ${i + 1}: could not parse Gherkin block for ${taskId}.`);
                continue;
            }

            task.acceptanceCriteria = scenarios;
            if (!task.verify) task.verify = [];
            task.verify.push({ kind: 'gherkin', value: `${scenarios.length} scenario(s)` });
            changes.push(`~ ${phaseId}/${taskId} acceptance criteria: ${scenarios.length} scenario(s)`);
        }

        if (matched) continue;

        warnings.push(`Line ${i + 1}: unrecognized directive: ${line}`);
    }

    return {
        updatedPlan: updated,
        changed: changes.length > 0,
        directivesParsed,
        changes,
        warnings,
    };
}
