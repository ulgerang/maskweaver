/**
 * Phase Manager
 * 
 * Manages phase lifecycle and persistence.
 * Integrates with Maskweaver's context module for file tracking.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import type { WeavePhase, WeavePlan, PhaseStatus } from './types.js';

// ============================================================================
// Configuration
// ============================================================================

const WEAVE_DIR = '.opencode/weave';
const PLAN_FILE = 'PLAN.yaml';
const STATE_FILE = 'state.yaml';
const PLANS_DIR = 'plans';

function getWeaveDir(basePath: string = process.cwd()): string {
    return path.join(basePath, WEAVE_DIR);
}

function getPlanPath(basePath: string = process.cwd()): string {
    return path.join(getWeaveDir(basePath), PLAN_FILE);
}

function getStatePath(basePath: string = process.cwd()): string {
    return path.join(getWeaveDir(basePath), STATE_FILE);
}

function getPlansDir(basePath: string = process.cwd()): string {
    return path.join(getWeaveDir(basePath), PLANS_DIR);
}

function ensureWeaveDir(basePath: string = process.cwd()): void {
    const dir = getWeaveDir(basePath);
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
}

function ensurePlansDir(basePath: string = process.cwd()): void {
    const dir = getPlansDir(basePath);
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
}

// ============================================================================
// Safe File I/O with Backup & Recovery
// ============================================================================

/**
 * Atomically write a file with backup.
 * 1. If target exists, copy it to target.bak
 * 2. Write content to target.tmp
 * 3. Rename target.tmp → target (atomic on most OS)
 * Falls back to direct write if rename fails (e.g., cross-device on Windows).
 */
function safeWriteFile(filePath: string, content: string): void {
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }

    // Step 1: Backup existing file
    if (fs.existsSync(filePath)) {
        try {
            fs.copyFileSync(filePath, filePath + '.bak');
        } catch (e) {
            console.error(`[PhaseManager] Warning: Failed to create backup for ${path.basename(filePath)}:`, e);
        }
    }

    // Step 2-3: Write to .tmp then rename (atomic)
    const tmpPath = filePath + '.tmp';
    try {
        fs.writeFileSync(tmpPath, content, 'utf-8');
        fs.renameSync(tmpPath, filePath);
    } catch (e) {
        // Fallback: direct write (rename can fail on some Windows configs)
        try { fs.unlinkSync(tmpPath); } catch { /* ignore */ }
        fs.writeFileSync(filePath, content, 'utf-8');
    }
}

/**
 * Safely read and parse a YAML file with auto-recovery.
 * 
 * Recovery chain:
 * 1. Try reading the file normally
 * 2. If parse fails, try the .bak backup file
 * 3. If .bak succeeds, auto-restore the file from backup
 * 4. Returns { data, recovered, error } indicating what happened
 */
async function safeReadYaml<T = any>(filePath: string): Promise<{
    data: T | null;
    recovered: boolean;
    error?: string;
}> {
    const { parse } = await import('yaml');
    const fileName = path.basename(filePath);

    // File doesn't exist at all
    if (!fs.existsSync(filePath)) {
        return { data: null, recovered: false };
    }

    // Try reading the main file
    try {
        const content = fs.readFileSync(filePath, 'utf-8');
        if (!content.trim()) {
            throw new Error('File is empty');
        }
        const data = parse(content);
        return { data, recovered: false };
    } catch (primaryError) {
        const errMsg = primaryError instanceof Error ? primaryError.message : String(primaryError);
        console.error(`[PhaseManager] YAML parse failed for ${fileName}: ${errMsg}`);

        // Try .bak backup
        const bakPath = filePath + '.bak';
        if (fs.existsSync(bakPath)) {
            try {
                const bakContent = fs.readFileSync(bakPath, 'utf-8');
                if (!bakContent.trim()) {
                    throw new Error('Backup file is empty');
                }
                const data = parse(bakContent);

                // Auto-restore from backup
                console.error(`[PhaseManager] Auto-recovered ${fileName} from backup`);
                try {
                    // Save corrupted file for debugging
                    const corruptedPath = filePath + '.corrupted';
                    fs.copyFileSync(filePath, corruptedPath);
                    // Restore from backup
                    fs.copyFileSync(bakPath, filePath);
                } catch (restoreErr) {
                    console.error(`[PhaseManager] Warning: Could not auto-restore file:`, restoreErr);
                }

                return {
                    data,
                    recovered: true,
                    error: `${fileName} was corrupted and auto-recovered from backup. Corrupted file saved as ${fileName}.corrupted`,
                };
            } catch (bakError) {
                const bakErrMsg = bakError instanceof Error ? bakError.message : String(bakError);
                console.error(`[PhaseManager] Backup ${fileName}.bak also failed: ${bakErrMsg}`);
                return {
                    data: null,
                    recovered: false,
                    error: `${fileName} is corrupted and backup is also invalid. Manual recovery needed. Error: ${errMsg}`,
                };
            }
        }

        // No backup available
        return {
            data: null,
            recovered: false,
            error: `${fileName} is corrupted (no backup available). Error: ${errMsg}`,
        };
    }
}

/**
 * Validate that raw parsed YAML has the expected plan structure.
 * Returns a sanitized object or null if unrecoverable.
 */
function validatePlanStructure(raw: any): any | null {
    if (!raw || typeof raw !== 'object') {
        return null;
    }

    // Ensure phases is an array
    if (raw.phases && !Array.isArray(raw.phases)) {
        console.error('[PhaseManager] Invalid phases field (not an array), resetting to empty');
        raw.phases = [];
    }

    // Ensure each phase has required fields
    if (Array.isArray(raw.phases)) {
        raw.phases = raw.phases.filter((p: any) => {
            if (!p || typeof p !== 'object') return false;
            if (!p.id || !p.name) {
                console.error(`[PhaseManager] Skipping invalid phase entry (missing id/name)`);
                return false;
            }
            // Ensure tasks is an array
            if (p.tasks && !Array.isArray(p.tasks)) {
                p.tasks = [];
            }
            // Ensure checklist is an array
            if (p.checklist && !Array.isArray(p.checklist)) {
                p.checklist = [];
            }
            return true;
        });
    }

    return raw;
}

/**
 * Escape a string value for safe YAML serialization.
 * Uses double-quoted YAML string escaping.
 */
function yamlEscapeString(value: string): string {
    if (!value) return '""';
    // If value contains characters that could break YAML, use double-quoted escaping
    if (/[\n\r\t"\\:#{}\[\],&*?|>!%@`]/.test(value) || value.trim() !== value) {
        return '"' + value
            .replace(/\\/g, '\\\\')
            .replace(/"/g, '\\"')
            .replace(/\n/g, '\\n')
            .replace(/\r/g, '\\r')
            .replace(/\t/g, '\\t')
            + '"';
    }
    return `"${value}"`;
}

// ============================================================================
// YAML Serialization (Simple)
// ============================================================================

function serializePlan(plan: WeavePlan): string {
    const lines: string[] = [];

    lines.push(`# Weave Plan - ${plan.projectName}`);
    lines.push(`# Generated by Maskweaver Weave`);
    lines.push('');
    lines.push(`project_name: ${yamlEscapeString(plan.projectName)}`);
    lines.push(`created_at: "${plan.createdAt}"`);
    lines.push(`updated_at: "${plan.updatedAt}"`);
    lines.push('');
    lines.push('vision: |');
    for (const line of (plan.vision || '').split('\n')) {
        lines.push(`  ${line}`);
    }
    lines.push('');
    lines.push('architecture:');
    if (plan.architecture?.frontend) lines.push(`  frontend: ${yamlEscapeString(plan.architecture.frontend)}`);
    if (plan.architecture?.backend) lines.push(`  backend: ${yamlEscapeString(plan.architecture.backend)}`);
    if (plan.architecture?.database) lines.push(`  database: ${yamlEscapeString(plan.architecture.database)}`);
    if (plan.architecture?.notes) lines.push(`  notes: ${yamlEscapeString(plan.architecture.notes)}`);
    lines.push('');

    if (plan.currentPhase) {
        lines.push(`current_phase: "${plan.currentPhase}"`);
        lines.push('');
    }

    lines.push('phases:');
    for (const phase of (plan.phases || [])) {
        lines.push(`  - id: "${phase.id}"`);
        lines.push(`    name: ${yamlEscapeString(phase.name)}`);
        lines.push(`    status: "${phase.status}"`);
        lines.push(`    done_when: ${yamlEscapeString(phase.doneWhen)}`);

        if (phase.estimatedHours) {
            lines.push(`    estimated_hours: ${phase.estimatedHours}`);
        }
        if (phase.actualHours) {
            lines.push(`    actual_hours: ${phase.actualHours}`);
        }
        if (phase.startedAt) {
            lines.push(`    started_at: "${phase.startedAt}"`);
        }
        if (phase.completedAt) {
            lines.push(`    completed_at: "${phase.completedAt}"`);
        }

        lines.push('    checklist:');
        for (const item of (phase.checklist || [])) {
            lines.push(`      - ${yamlEscapeString(item)}`);
        }

        lines.push('    tasks:');
        for (const task of (phase.tasks || [])) {
            lines.push(`      - id: "${task.id}"`);
            lines.push(`        name: ${yamlEscapeString(task.name)}`);
            lines.push(`        status: "${task.status}"`);
            lines.push(`        retry_count: ${task.retryCount ?? 0}`);
            lines.push(`        max_retries: ${task.maxRetries ?? 5}`);
            if (task.testCase) {
                lines.push(`        test_case: ${yamlEscapeString(task.testCase)}`);
            }
            if (task.maskUsed) {
                lines.push(`        mask_used: ${yamlEscapeString(task.maskUsed)}`);
            }
            if (task.lastError) {
                lines.push(`        last_error: ${yamlEscapeString(task.lastError)}`);
            }
        }

        if (phase.dependsOn && phase.dependsOn.length > 0) {
            lines.push(`    depends_on: [${phase.dependsOn.map(d => `"${d}"`).join(', ')}]`);
        }

        if (phase.masksUsed && phase.masksUsed.length > 0) {
            lines.push(`    masks_used: [${phase.masksUsed.map(m => yamlEscapeString(m)).join(', ')}]`);
        }

        lines.push('');
    }

    return lines.join('\n');
}

// ============================================================================
// Phase Manager Class
// ============================================================================

export class PhaseManager {
    private basePath: string;
    private plan: WeavePlan | null = null;
    /** Recovery messages from the last loadPlan() call. */
    private _lastRecoveryMessages: string[] = [];

    constructor(basePath: string = process.cwd()) {
        this.basePath = basePath;
    }

    /**
     * Get recovery messages from the last loadPlan() call.
     * Returns empty array if no recovery was needed.
     */
    getRecoveryMessages(): string[] {
        return this._lastRecoveryMessages;
    }

    /**
     * Load existing plan or return null.
     * Supports multi-plan architecture (state.yaml → plans/) with legacy PLAN.yaml fallback.
     * Auto-recovers from .bak backup when YAML is corrupted.
     */
    async loadPlan(): Promise<WeavePlan | null> {
        // Track recovery messages for user-facing reporting
        const recoveryMessages: string[] = [];

        // 1. Try new multi-plan architecture: state.yaml → plans/{active_plan}.yaml
        const statePath = getStatePath(this.basePath);
        if (fs.existsSync(statePath)) {
            const stateResult = await safeReadYaml<{ active_plan?: string }>(statePath);
            if (stateResult.recovered && stateResult.error) {
                recoveryMessages.push(stateResult.error);
            }

            const activePlan = stateResult.data?.active_plan;
            if (activePlan) {
                const planFilePath = path.join(getPlansDir(this.basePath), `${activePlan}.yaml`);
                const planResult = await safeReadYaml(planFilePath);
                if (planResult.recovered && planResult.error) {
                    recoveryMessages.push(planResult.error);
                }

                if (planResult.data) {
                    const validated = validatePlanStructure(planResult.data);
                    if (validated) {
                        this.plan = this.rawToPlan(validated);
                        this._lastRecoveryMessages = recoveryMessages;
                        return this.plan;
                    }
                }
            }

            // If state.yaml existed but we couldn't load a plan, report the error
            if (stateResult.error && !stateResult.recovered) {
                recoveryMessages.push(stateResult.error);
            }
        }

        // 2. Legacy fallback: PLAN.yaml
        const planPath = getPlanPath(this.basePath);
        if (!fs.existsSync(planPath)) {
            this._lastRecoveryMessages = recoveryMessages;
            return null;
        }

        const planResult = await safeReadYaml(planPath);
        if (planResult.recovered && planResult.error) {
            recoveryMessages.push(planResult.error);
        }

        if (planResult.data) {
            const validated = validatePlanStructure(planResult.data);
            if (validated) {
                this.plan = this.rawToPlan(validated);
                this._lastRecoveryMessages = recoveryMessages;
                return this.plan;
            }
        }

        if (planResult.error) {
            recoveryMessages.push(planResult.error);
        }

        this._lastRecoveryMessages = recoveryMessages;
        return null;
    }

    /**
     * Save plan to disk with atomic writes and automatic backup.
     * If state.yaml exists (new mode): save to plans/{planName}.yaml and update state.yaml.
     * Otherwise (legacy mode): save to PLAN.yaml.
     */
    async savePlan(plan: WeavePlan): Promise<void> {
        ensureWeaveDir(this.basePath);
        const { stringify } = await import('yaml');

        plan.updatedAt = new Date().toISOString();
        const content = serializePlan(plan);

        const statePath = getStatePath(this.basePath);
        if (fs.existsSync(statePath)) {
            // New multi-plan mode: save to plans/ directory
            ensurePlansDir(this.basePath);
            const planName = this.toPlanFileName(plan.projectName);
            const planFilePath = path.join(getPlansDir(this.basePath), `${planName}.yaml`);
            safeWriteFile(planFilePath, content);

            // Update state.yaml with active_plan
            const stateContent = stringify({ active_plan: planName });
            safeWriteFile(statePath, stateContent);
        } else {
            // Legacy mode: save to PLAN.yaml
            safeWriteFile(getPlanPath(this.basePath), content);
        }

        this.plan = plan;
    }

    /**
     * Create a new plan.
     */
    async createPlan(input: {
        projectName: string;
        vision: string;
        architecture: WeavePlan['architecture'];
        phases: Omit<WeavePhase, 'tasks'>[];
    }): Promise<WeavePlan> {
        const now = new Date().toISOString();

        const plan: WeavePlan = {
            projectName: input.projectName,
            createdAt: now,
            updatedAt: now,
            vision: input.vision,
            architecture: input.architecture,
            phases: input.phases.map(p => ({
                ...p,
                tasks: [],
            })),
        };

        await this.savePlan(plan);
        return plan;
    }

    /**
     * Get a specific phase.
     */
    getPhase(phaseId: string): WeavePhase | null {
        if (!this.plan) return null;
        return this.plan.phases.find(p => p.id === phaseId) || null;
    }

    /**
     * Update phase status.
     */
    async updatePhaseStatus(
        phaseId: string,
        status: PhaseStatus,
        additionalData?: Partial<WeavePhase>
    ): Promise<WeavePhase | null> {
        if (!this.plan) {
            await this.loadPlan();
        }

        if (!this.plan) return null;

        const phase = this.plan.phases.find(p => p.id === phaseId);
        if (!phase) return null;

        phase.status = status;

        if (status === 'in_progress' && !phase.startedAt) {
            phase.startedAt = new Date().toISOString();
        }

        if (status === 'completed' && !phase.completedAt) {
            phase.completedAt = new Date().toISOString();

            // Calculate actual hours if we have start time
            if (phase.startedAt) {
                const start = new Date(phase.startedAt).getTime();
                const end = new Date(phase.completedAt).getTime();
                phase.actualHours = Math.round((end - start) / (1000 * 60 * 60) * 10) / 10;
            }
        }

        if (additionalData) {
            Object.assign(phase, additionalData);
        }

        this.plan.currentPhase = status === 'in_progress' ? phaseId : undefined;
        await this.savePlan(this.plan);

        return phase;
    }

    /**
     * Add tasks to a phase.
     */
    async addTasks(phaseId: string, tasks: Omit<WeavePhase['tasks'][0], 'status' | 'retryCount'>[]): Promise<void> {
        if (!this.plan) {
            await this.loadPlan();
        }

        if (!this.plan) return;

        const phase = this.plan.phases.find(p => p.id === phaseId);
        if (!phase) return;

        phase.tasks.push(...tasks.map(t => ({
            ...t,
            status: 'pending' as const,
            retryCount: 0,
            maxRetries: t.maxRetries ?? 5,
        })));

        await this.savePlan(this.plan);
    }

    /**
     * Update task status.
     */
    async updateTaskStatus(
        phaseId: string,
        taskId: string,
        status: 'pending' | 'in_progress' | 'passed' | 'failed',
        additionalData?: Partial<WeavePhase['tasks'][0]>
    ): Promise<void> {
        if (!this.plan) {
            await this.loadPlan();
        }

        if (!this.plan) return;

        const phase = this.plan.phases.find(p => p.id === phaseId);
        if (!phase) return;

        const task = phase.tasks.find(t => t.id === taskId);
        if (!task) return;

        task.status = status;

        if (status === 'failed') {
            task.retryCount++;
        }

        if (additionalData) {
            Object.assign(task, additionalData);
        }

        // Track masks used in phase
        if (task.maskUsed && !phase.masksUsed?.includes(task.maskUsed)) {
            phase.masksUsed = [...(phase.masksUsed || []), task.maskUsed];
        }

        await this.savePlan(this.plan);
    }

    /**
     * Get next pending phase (respecting dependencies).
     */
    getNextPhase(): WeavePhase | null {
        if (!this.plan) return null;

        for (const phase of this.plan.phases) {
            if (phase.status === 'pending') {
                // Check dependencies
                if (phase.dependsOn && phase.dependsOn.length > 0) {
                    const allDepsCompleted = phase.dependsOn.every(depId => {
                        const dep = this.plan!.phases.find(p => p.id === depId);
                        return dep?.status === 'completed';
                    });

                    if (!allDepsCompleted) continue;
                }

                return phase;
            }
        }

        return null;
    }

    /**
     * Get plan statistics.
     */
    getStats(): {
        totalPhases: number;
        completedPhases: number;
        inProgressPhases: number;
        progress: number;
    } {
        if (!this.plan) {
            return { totalPhases: 0, completedPhases: 0, inProgressPhases: 0, progress: 0 };
        }

        const total = this.plan.phases.length;
        const completed = this.plan.phases.filter(p => p.status === 'completed').length;
        const inProgress = this.plan.phases.filter(p => p.status === 'in_progress').length;

        return {
            totalPhases: total,
            completedPhases: completed,
            inProgressPhases: inProgress,
            progress: total > 0 ? Math.round((completed / total) * 100) : 0,
        };
    }

    /**
     * Convert project name to a filesystem-safe plan file name.
     */
    private toPlanFileName(projectName: string): string {
        return projectName
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-+|-+$/g, '') || 'unnamed';
    }

    /**
     * Load all plans from the plans/ directory.
     * Returns empty array in legacy mode or if no plans exist.
     * Auto-recovers corrupted plan files from backups.
     */
    async loadAllPlans(): Promise<WeavePlan[]> {
        const plansDir = getPlansDir(this.basePath);
        if (!fs.existsSync(plansDir)) {
            // Legacy mode: try loading single PLAN.yaml
            const legacyPlan = await this.loadPlan();
            return legacyPlan ? [legacyPlan] : [];
        }

        const plans: WeavePlan[] = [];

        try {
            const files = fs.readdirSync(plansDir).filter(f => f.endsWith('.yaml') && !f.endsWith('.bak') && !f.endsWith('.tmp') && !f.endsWith('.corrupted'));
            for (const file of files) {
                const filePath = path.join(plansDir, file);
                const result = await safeReadYaml(filePath);
                if (result.recovered) {
                    console.error(`[PhaseManager] Auto-recovered plan ${file} from backup`);
                }
                if (result.data) {
                    const validated = validatePlanStructure(result.data);
                    if (validated) {
                        plans.push(this.rawToPlan(validated));
                    }
                } else if (result.error) {
                    console.error(`[PhaseManager] Skipping unrecoverable plan ${file}: ${result.error}`);
                }
            }
        } catch (e) {
            console.error('[PhaseManager] Failed to scan plans directory:', e);
        }

        return plans;
    }

    /**
     * Get the active plan name from state.yaml.
     * Returns null in legacy mode or if state.yaml doesn't exist.
     * Auto-recovers from backup if corrupted.
     */
    async getActivePlanName(): Promise<string | null> {
        const statePath = getStatePath(this.basePath);
        if (!fs.existsSync(statePath)) {
            return null;
        }

        const result = await safeReadYaml<{ active_plan?: string }>(statePath);
        if (result.recovered) {
            console.error(`[PhaseManager] Auto-recovered state.yaml from backup`);
        }
        return result.data?.active_plan || null;
    }

    /**
     * Load and return state.yaml content.
     * Returns null if state.yaml doesn't exist (legacy mode).
     * Auto-recovers from backup if corrupted.
     */
    async loadState(): Promise<{ active_plan?: string } | null> {
        const statePath = getStatePath(this.basePath);
        if (!fs.existsSync(statePath)) {
            return null;
        }

        const result = await safeReadYaml<{ active_plan?: string }>(statePath);
        if (result.recovered) {
            console.error(`[PhaseManager] Auto-recovered state.yaml from backup`);
        }
        return result.data || null;
    }

    private rawToPlan(raw: any): WeavePlan {
        return {
            projectName: raw.project_name || raw.projectName || 'Unknown',
            createdAt: raw.created_at || raw.createdAt || new Date().toISOString(),
            updatedAt: raw.updated_at || raw.updatedAt || new Date().toISOString(),
            vision: raw.vision || '',
            architecture: raw.architecture || {},
            currentPhase: raw.current_phase || raw.currentPhase,
            phases: (raw.phases || []).map((p: any) => ({
                id: p.id,
                name: p.name,
                status: p.status || 'pending',
                doneWhen: p.done_when || p.doneWhen || '',
                checklist: p.checklist || [],
                tasks: (p.tasks || []).map((t: any) => ({
                    id: t.id,
                    name: t.name,
                    status: t.status || 'pending',
                    testCase: t.test_case || t.testCase,
                    retryCount: t.retry_count || t.retryCount || 0,
                    maxRetries: t.max_retries || t.maxRetries || 5,
                    lastError: t.last_error || t.lastError,
                    maskUsed: t.mask_used || t.maskUsed,
                })),
                dependsOn: p.depends_on || p.dependsOn,
                estimatedHours: p.estimated_hours || p.estimatedHours,
                actualHours: p.actual_hours || p.actualHours,
                startedAt: p.started_at || p.startedAt,
                completedAt: p.completed_at || p.completedAt,
                masksUsed: p.masks_used || p.masksUsed,
            })),
        };
    }
}

// ============================================================================
// Convenience Functions
// ============================================================================

let managerInstance: PhaseManager | null = null;

export function getPhaseManager(basePath?: string): PhaseManager {
    if (!managerInstance || basePath) {
        managerInstance = new PhaseManager(basePath);
    }
    return managerInstance;
}

export async function createPhase(
    phaseId: string,
    name: string,
    doneWhen: string,
    checklist: string[],
    dependsOn?: string[]
): Promise<WeavePhase> {
    const phase: WeavePhase = {
        id: phaseId,
        name,
        status: 'pending',
        doneWhen,
        checklist,
        tasks: [],
        dependsOn,
    };
    return phase;
}

export async function getPhase(phaseId: string): Promise<WeavePhase | null> {
    const manager = getPhaseManager();
    await manager.loadPlan();
    return manager.getPhase(phaseId);
}

export async function updatePhaseStatus(
    phaseId: string,
    status: PhaseStatus
): Promise<WeavePhase | null> {
    const manager = getPhaseManager();
    return manager.updatePhaseStatus(phaseId, status);
}

export async function listPhases(): Promise<WeavePhase[]> {
    const manager = getPhaseManager();
    const plan = await manager.loadPlan();
    return plan?.phases || [];
}
