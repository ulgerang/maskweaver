/**
 * Weave Tool for OpenCode Plugin
 * 
 * Integrates Weave workflow into OpenCode as a tool.
 * Commands: design, craft, status
 */

import { z } from 'zod';
// Inline shim: tool() is just an identity function in @opencode-ai/plugin
const tool = <T>(input: T): T => input;

import * as path from 'node:path';
import * as fs from 'node:fs';
import { mkdir, readdir, readFile, unlink, writeFile } from 'node:fs/promises';
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';

import { VERSION } from '../../version.js';
import { intake } from '../../weave/stages/intake.js';
import { writeResearchReport } from '../../weave/stages/research.js';
import { refinePlanFromNotes } from '../../weave/stages/refine.js';
import { spec as createSpec } from '../../weave/stages/spec.js';
import { plan } from '../../weave/stages/plan.js';
import { preparePhaseExecution, formatExecutionPlan, runAIVerification, generateVerificationReport } from '../../weave/stages/execute.js';
import { handoff, generateStatusReport, handleUserResponse } from '../../weave/stages/handoff.js';
import { getPhaseManager } from '../../weave/phase-manager.js';
import { recommendVerificationCommands, formatRecommendedCommandsAsBash } from '../../weave/verification/index.js';
import {
    createWeaveWorktree,
    listWeaveWorktrees,
    resolveWeaveWorktree,
    removeWeaveWorktree,
    ensureIgnoreOverride,
    ensureWeaveState,
} from '../../weave/worktree.js';
import { ensureGitRepo, stageAllChanges, listStagedFiles, hasStagedChanges, commitStagedChanges } from '../../weave/git.js';
import { scanFilesForSecrets, loadSecretScanConfig, shouldBlockOnFindings, formatSecretScanReport } from '../../weave/security/secret-scan.js';
import { searchTroubleshooting, recordTroubleshooting, GlobalKnowledge } from '../../weave/knowledge/global.js';
import type { WeavePhase, WeavePlan } from '../../weave/types.js';
import {
    getEffectiveGdcConfig,
    runGdcMachineCommand,
    countGdcCheckIssues,
    getStatsNodeSummary,
} from '../../weave/gdc.js';

// ============================================================================
// Tool Factory
// ============================================================================

export function createWeaveTool() {
    return {
        description: `Weave: Phase-driven development workflow with expert mask auto-selection and cross-project knowledge sharing.

Commands:
- init: Initialize weave workspace files and probe GDC integration
- research [docsPath]: Deep-read docs + workspace context and write persistent research.md
- spec [docsPath]: Generate baseline spec (requirements + AC)
- design [docsPath]: Analyze requirements and create phase-based plan (auto-splits oversized plans)
- prepare [docsPath]: Create research + spec + plan with defaults (auto-splits oversized plans)
- refine-plan: Apply annotation notes to active plan
- approve-plan: Mark plan reviewed/approved before implementation
- flow [docsPath]: One-command path (prepare -> auto-approve -> craft -> verify -> finalize)
- craft [phaseId]: Prepare execution context for a phase (phase auto-select if omitted)
- status: View overall progress
- worktree: Manage git worktrees for parallel work
- verify: Run build/test verification for current worktree
- troubleshoot [error]: Search global knowledge for solutions
- record [solution]: Record a troubleshooting solution
- repair: Scan and auto-repair corrupted plan YAML files

Examples:
- weave init
- weave research docs/
- weave design docs/
- weave refine-plan
- weave approve-plan
- weave craft P1
- weave status
- weave repair
- weave troubleshoot "Cannot find module 'xyz'"`,

        args: {
            command: z.enum(['init', 'research', 'spec', 'design', 'prepare', 'refine-plan', 'approve-plan', 'flow', 'craft', 'status', 'worktree', 'verify', 'troubleshoot', 'record', 'help', 'repair'])
                .describe('Weave command to execute'),
            docsPath: z.string().optional()
                .describe('Path to requirements documents (for design command)'),
            phaseId: z.string().optional()
                .describe('Phase ID (optional for craft)'),
            projectName: z.string().optional()
                .describe('Project name (for design command)'),
            planName: z.string().optional()
                .describe('Plan name (kebab-case) used for plan filename (optional)'),
            splitPlans: z.boolean().optional()
                .describe('Auto-split oversized plans into multiple shard plan files (default: true)'),
            splitMaxPhases: z.number().int().min(2).max(8).optional()
                .describe('Max phases per shard when splitPlans is enabled (default: 3)'),
            splitMaxHours: z.number().int().min(4).max(40).optional()
                .describe('Max estimated hours per shard when splitPlans is enabled (default: 10)'),
            planReview: z.string().optional()
                .describe('Plan review summary text (for approve-plan command)'),
            notesPath: z.string().optional()
                .describe('Path to structured plan notes (default: tasks/plan-notes.md)'),
            applyNotes: z.boolean().optional()
                .describe('Auto-apply plan notes during approve-plan (default: true)'),
            worktreeAction: z.enum(['create', 'list', 'open', 'remove', 'merge']).optional()
                .describe('Worktree action (for worktree command)'),
            name: z.string().optional()
                .describe('Worktree name (for worktree command)'),
            fromRef: z.string().optional()
                .describe('Base git ref to branch from (for worktree create)'),
            deleteBranch: z.boolean().optional()
                .describe('Delete branch when removing worktree (default: false)'),
            bootstrapWeave: z.boolean().optional()
                .describe('Bootstrap .opencode/weave into new worktree (default: true)'),
            bootstrapGdc: z.boolean().optional()
                .describe('Bootstrap .gdc config/nodes into new worktree (default: true)'),
            skipVerify: z.boolean().optional()
                .describe('Skip final verification before auto-finalize (default: false)'),
            verifyMode: z.enum(['quick', 'full']).optional()
                .describe('Verification mode: quick (typecheck+tests) or full (all available)'),
            commit: z.boolean().optional()
                .describe('Create git commits during craft loop verification passes (default: false)'),
            stageAll: z.boolean().optional()
                .describe('Stage all changes before commit (default: false)'),
            commitMessage: z.string().optional()
                .describe('Commit message (optional)'),
            verify: z.boolean().optional()
                .describe('Run verification (for verify/flow paths)'),
            error: z.string().optional()
                .describe('Error message to search solutions for (for troubleshoot command)'),
            solution: z.string().optional()
                .describe('Solution to record (for record command)'),
            context: z.string().optional()
                .describe('Context for the troubleshooting entry'),
            projectType: z.string().optional()
                .describe('Project type (react, nextjs, go, etc.)'),
        },

        execute: async (
            args: {
                command: 'init' | 'research' | 'spec' | 'design' | 'prepare' | 'refine-plan' | 'approve-plan' | 'flow' | 'craft' | 'status' | 'worktree' | 'verify' | 'troubleshoot' | 'record' | 'help' | 'repair';
                docsPath?: string;
                phaseId?: string;
                projectName?: string;
                planName?: string;
                splitPlans?: boolean;
                splitMaxPhases?: number;
                splitMaxHours?: number;
                planReview?: string;
                notesPath?: string;
                applyNotes?: boolean;
                worktreeAction?: 'create' | 'list' | 'open' | 'remove' | 'merge';
                name?: string;
                fromRef?: string;
                deleteBranch?: boolean;
                bootstrapWeave?: boolean;
                bootstrapGdc?: boolean;
                skipVerify?: boolean;
                verifyMode?: 'quick' | 'full';
                commit?: boolean;
                stageAll?: boolean;
                commitMessage?: string;
                verify?: boolean;
                error?: string;
                solution?: string;
                context?: string;
                projectType?: string;
            },
            context: { worktree: string }
        ): Promise<string> => {
            const { command } = args;
            const basePath = context.worktree;

            try {
                switch (command) {
                    case 'init':
                        return await handleInit(basePath);

                    case 'research':
                        return await handleResearch(args, basePath);

                    case 'spec':
                        return await handleSpec(args, basePath);

                    case 'design':
                        return await handleDesign(args, basePath);

                    case 'prepare':
                        return await handlePrepare(args, basePath);

                    case 'refine-plan':
                        return await handleRefinePlan(args, basePath);

                    case 'approve-plan':
                        return await handleApprovePlan(args, basePath);

                    case 'flow':
                        return await handleFlow(args, basePath);

                    case 'craft':
                        return await handleCraft(args, basePath);

                    case 'status':
                        return await handleStatus(basePath);

                    case 'worktree':
                        return await handleWorktree(args, basePath);

                    case 'verify':
                        return await handleVerify(args, basePath);

                    case 'troubleshoot':
                        return await handleTroubleshoot(args);

                    case 'record':
                        return await handleRecord(args);

                    case 'repair':
                        return await handleRepair(basePath);

                    case 'help':
                        return getHelpMessage();

                    default:
                        return `Error: Unknown command: ${command}. Use 'help' for available commands.`;
                }
            } catch (e) {
                const error = e instanceof Error ? e.message : String(e);
                return `Error: Weave error: ${error}`;
            }
        },
    };
}

// ============================================================================
// Command Handlers
// ============================================================================

function toWorkspaceRelative(basePath: string, filePath: string): string {
    const rel = path.relative(basePath, filePath);
    if (!rel || rel.startsWith('..')) return filePath;
    return rel.replace(/\\/g, '/');
}

function getActivePlanArtifactPath(basePath: string, planName: string | undefined): string {
    if (!planName) return '.opencode/weave/plans/<active>.yaml';
    return toWorkspaceRelative(basePath, path.join(basePath, '.opencode', 'weave', 'plans', `${planName}.yaml`));
}

async function updateActivePlanReviewMetadata(
    basePath: string,
    metadata: {
        researchPath?: string;
        resetApproval?: boolean;
        approvalNotes?: string | undefined;
    }
): Promise<void> {
    const manager = getPhaseManager(basePath);
    const activePlan = await manager.loadPlan();
    if (!activePlan) return;

    if (metadata.researchPath) {
        activePlan.researchPath = toWorkspaceRelative(basePath, metadata.researchPath);
        activePlan.researchUpdatedAt = new Date().toISOString();
    }

    if (metadata.resetApproval) {
        activePlan.planApproved = false;
        activePlan.planApprovedAt = undefined;
        activePlan.planApprovalNotes = metadata.approvalNotes || 'Plan changed. Review and approve again.';
    }

    await manager.savePlan(activePlan);
}

function formatPlanApprovalRequired(
    basePath: string,
    plan: { planName?: string; researchPath?: string; planApproved?: boolean }
): string {
    const planPath = getActivePlanArtifactPath(basePath, plan.planName);
    const researchPath = plan.researchPath || 'tasks/research.md';

    return [
        'Plan approval required before implementation.',
        '',
        `- Review research: \`${researchPath}\``,
        `- Review plan: \`${planPath}\``,
        '- (Optional) Apply note directives: `weave command=refine-plan`',
        '- Then run: `weave command=approve-plan`',
    ].join('\n');
}

const DEFAULT_PLAN_NOTES_PATH = path.join('tasks', 'plan-notes.md');

type PlanRefinementOutcome = {
    status: 'missing' | 'no_directives' | 'no_changes' | 'changed';
    notesAbsolutePath: string;
    notesRelativePath: string;
    directivesParsed: number;
    changes: string[];
    warnings: string[];
    updatedPlan?: WeavePlan;
};

function resolvePlanNotesPath(basePath: string, notesPath?: string): string {
    const requested = notesPath?.trim() ? notesPath.trim() : DEFAULT_PLAN_NOTES_PATH;
    if (path.isAbsolute(requested)) return requested;
    return path.join(basePath, requested);
}

async function refinePlanByNotes(
    basePath: string,
    activePlan: WeavePlan,
    notesPath?: string
): Promise<PlanRefinementOutcome> {
    const notesAbsolutePath = resolvePlanNotesPath(basePath, notesPath);
    const notesRelativePath = toWorkspaceRelative(basePath, notesAbsolutePath);

    try {
        const content = await readFile(notesAbsolutePath, 'utf-8');
        const result = refinePlanFromNotes(activePlan, content);

        if (result.directivesParsed === 0) {
            return {
                status: 'no_directives',
                notesAbsolutePath,
                notesRelativePath,
                directivesParsed: 0,
                changes: [],
                warnings: result.warnings,
            };
        }

        if (!result.changed) {
            return {
                status: 'no_changes',
                notesAbsolutePath,
                notesRelativePath,
                directivesParsed: result.directivesParsed,
                changes: [],
                warnings: result.warnings,
                updatedPlan: result.updatedPlan,
            };
        }

        return {
            status: 'changed',
            notesAbsolutePath,
            notesRelativePath,
            directivesParsed: result.directivesParsed,
            changes: result.changes,
            warnings: result.warnings,
            updatedPlan: result.updatedPlan,
        };
    } catch {
        return {
            status: 'missing',
            notesAbsolutePath,
            notesRelativePath,
            directivesParsed: 0,
            changes: [],
            warnings: [],
        };
    }
}

function formatRefinePlanGuide(notesRelativePath: string): string {
    return [
        'No plan-notes file found for refinement.',
        '',
        `- Create: \`${notesRelativePath}\``,
        '- Add structured directives, for example:',
        '```txt',
        '@plan vision: 로그인 이후 대시보드 탐색 흐름을 단순화한다',
        '@arch frontend: React + Vite + TanStack Query',
        '@phase P1 done_when: 유저가 이메일/비밀번호로 로그인할 수 있다',
        '@phase P1 add_task: 로그인 API 구현 | test=로그인 성공 시 200 반환 | retries=2',
        '@phase P1 add_checklist: 로그인 실패 메시지가 명확히 표시된다',
        '```',
        '',
        'Then run: `weave command=refine-plan`',
    ].join('\n');
}

function formatRefinePlanResult(title: string, outcome: PlanRefinementOutcome): string {
    const lines: string[] = [];
    lines.push(title);
    lines.push('');
    lines.push(`- Notes: \`${outcome.notesRelativePath}\``);
    lines.push(`- Parsed directives: ${outcome.directivesParsed}`);
    lines.push(`- Applied changes: ${outcome.changes.length}`);

    if (outcome.changes.length > 0) {
        lines.push('');
        lines.push('### Diff');
        for (const change of outcome.changes.slice(0, 40)) {
            lines.push(`- ${change}`);
        }
    }

    if (outcome.warnings.length > 0) {
        lines.push('');
        lines.push('### Notes');
        for (const warning of outcome.warnings.slice(0, 20)) {
            lines.push(`- ${warning}`);
        }
    }

    return lines.join('\n');
}

type GdcVerifyGateResult = {
    applied: boolean;
    passed: boolean;
    report: string;
    failedAt?: string;
};

type GdcPrepareSyncResult = {
    applied: boolean;
    report: string;
};

function pickLogTail(text: string, maxLength = 180): string {
    if (!text) return '';
    const lines = text.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
    if (lines.length === 0) return '';
    return sanitizeLessonText(lines[lines.length - 1], maxLength);
}

function formatGdcCommandLine(
    label: string,
    result: {
        exitCode: number;
        transportError?: string;
        parseError?: string;
        timedOut: boolean;
        stdout: string;
        stderr: string;
    }
): string {
    const parts: string[] = [];
    parts.push(result.exitCode === 0 ? 'PASS' : `FAIL(exit=${result.exitCode})`);
    if (result.timedOut) parts.push('timeout');
    if (result.transportError) parts.push(sanitizeLessonText(result.transportError, 140));
    if (result.parseError) parts.push(`parse=${sanitizeLessonText(result.parseError, 120)}`);

    const detail = pickLogTail(result.stderr || result.stdout);
    if (detail) parts.push(`detail=${detail}`);

    return `- ${label}: ${parts.join(' | ')}`;
}

async function runGdcVerifyGate(basePath: string): Promise<GdcVerifyGateResult> {
    const gdc = getEffectiveGdcConfig(basePath);
    if (!gdc.enabled) {
        return {
            applied: false,
            passed: true,
            report: '',
        };
    }

    const lines: string[] = [];
    lines.push('### GDC Pre-Verify Gate');
    lines.push('');
    lines.push(`- mode: ${gdc.strictVerify ? 'strict' : 'lenient'}`);
    lines.push(`- binary: \`${gdc.binPath}\``);

    const syncResult = await runGdcMachineCommand({
        basePath,
        command: 'sync',
        config: gdc,
    });
    lines.push(formatGdcCommandLine('sync', syncResult));

    const syncInfraFailure = Boolean(syncResult.transportError)
        || (syncResult.exitCode !== 0 && syncResult.exitCode !== 2);
    const syncMachineParseFailure = Boolean(syncResult.parseError && syncResult.exitCode === 0);

    if (syncInfraFailure || syncMachineParseFailure) {
        if (gdc.strictVerify) {
            lines.push('');
            lines.push('❌ Strict mode blocks verification when GDC sync cannot be trusted.');
            return {
                applied: true,
                passed: false,
                failedAt: 'GDC Sync',
                report: lines.join('\n'),
            };
        }

        lines.push('');
        lines.push('⚠️ Proceeding without strict GDC sync gate (lenient mode).');
        return {
            applied: true,
            passed: true,
            report: lines.join('\n'),
        };
    }

    const checkResult = await runGdcMachineCommand({
        basePath,
        command: 'check',
        config: gdc,
    });
    lines.push(formatGdcCommandLine('check', checkResult));

    if (checkResult.exitCode === 2) {
        lines.push('');
        lines.push('❌ Blocking GDC check issues detected (exit code 2).');
        return {
            applied: true,
            passed: false,
            failedAt: 'GDC Check',
            report: lines.join('\n'),
        };
    }

    const checkInfraFailure = Boolean(checkResult.transportError)
        || (checkResult.exitCode !== 0 && checkResult.exitCode !== 2);
    if (checkInfraFailure) {
        if (gdc.strictVerify) {
            lines.push('');
            lines.push('❌ Strict mode blocks verification when GDC check fails to run.');
            return {
                applied: true,
                passed: false,
                failedAt: 'GDC Check',
                report: lines.join('\n'),
            };
        }

        lines.push('');
        lines.push('⚠️ GDC check execution failed, but lenient mode allows verification to continue.');
        return {
            applied: true,
            passed: true,
            report: lines.join('\n'),
        };
    }

    const counts = countGdcCheckIssues(checkResult.data);
    lines.push(`- check summary: errors=${counts.errors}, warnings=${counts.warnings}, info=${counts.infos}, issues=${counts.issueCount}`);

    if (counts.errors > 0) {
        lines.push('');
        lines.push('❌ Blocking GDC check errors found. Resolve them before build/test verification.');
        return {
            applied: true,
            passed: false,
            failedAt: 'GDC Check',
            report: lines.join('\n'),
        };
    }

    if (checkResult.parseError) {
        if (gdc.strictVerify) {
            lines.push('');
            lines.push('❌ Strict mode requires parseable GDC machine output.');
            return {
                applied: true,
                passed: false,
                failedAt: 'GDC Check Parse',
                report: lines.join('\n'),
            };
        }

        lines.push('');
        lines.push('⚠️ GDC check output could not be parsed; continuing in lenient mode.');
    }

    lines.push('');
    lines.push('✅ GDC gate passed.');
    return {
        applied: true,
        passed: true,
        report: lines.join('\n'),
    };
}

async function runGdcPrepareSync(basePath: string): Promise<GdcPrepareSyncResult> {
    const gdc = getEffectiveGdcConfig(basePath);
    if (!gdc.enabled || !gdc.autoSyncOnPrepare) {
        return {
            applied: false,
            report: '',
        };
    }

    const lines: string[] = [];
    lines.push('### GDC Prepare Sync');
    lines.push('');
    lines.push(`- binary: \`${gdc.binPath}\``);

    const syncResult = await runGdcMachineCommand({
        basePath,
        command: 'sync',
        config: gdc,
    });
    lines.push(formatGdcCommandLine('sync', syncResult));

    const syncInfraFailure = Boolean(syncResult.transportError)
        || (syncResult.exitCode !== 0 && syncResult.exitCode !== 2);
    const syncMachineParseFailure = Boolean(syncResult.parseError && syncResult.exitCode === 0);

    lines.push('');
    if (syncInfraFailure || syncMachineParseFailure) {
        lines.push('⚠️ GDC sync failed during prepare; continuing without blocking.');
    } else {
        lines.push('✅ GDC sync completed before research/plan generation.');
    }

    return {
        applied: true,
        report: lines.join('\n'),
    };
}

async function readActivePlanFromState(statePath: string): Promise<string | null> {
    try {
        const raw = await readFile(statePath, 'utf-8');
        const parsed = parseYaml(raw) as { active_plan?: unknown } | null;
        const active = typeof parsed?.active_plan === 'string' ? parsed.active_plan.trim() : '';
        return active || null;
    } catch {
        return null;
    }
}

async function countPlanFiles(plansDir: string): Promise<number> {
    try {
        const entries = await readdir(plansDir, { withFileTypes: true });
        return entries.filter(entry => entry.isFile() && /\.(ya?ml)$/i.test(entry.name)).length;
    } catch {
        return 0;
    }
}

function countYamlFilesRecursive(dirPath: string): number {
    if (!fs.existsSync(dirPath)) return 0;
    let count = 0;
    const stack = [dirPath];

    while (stack.length > 0) {
        const current = stack.pop();
        if (!current) continue;
        let entries: fs.Dirent[] = [];
        try {
            entries = fs.readdirSync(current, { withFileTypes: true });
        } catch {
            continue;
        }

        for (const entry of entries) {
            const full = path.join(current, entry.name);
            if (entry.isDirectory()) {
                stack.push(full);
                continue;
            }
            if (entry.isFile() && /\.(ya?ml)$/i.test(entry.name)) {
                count += 1;
            }
        }
    }

    return count;
}

async function collectGdcStatusLines(basePath: string): Promise<string[]> {
    const gdc = getEffectiveGdcConfig(basePath);
    const lines: string[] = [];
    lines.push('### GDC Status');
    lines.push(`- Mode: ${String(gdc.mode)}`);
    lines.push(`- Detected: ${gdc.detected ? 'yes' : 'no'}`);
    lines.push(`- Enabled: ${gdc.enabled ? 'yes' : 'no'}`);
    lines.push(`- Strict verify: ${gdc.strictVerify ? 'yes' : 'no'}`);

    const gdcRoot = path.join(basePath, '.gdc');
    const nodesDir = path.join(gdcRoot, 'nodes');
    const nodeSpecCount = countYamlFilesRecursive(nodesDir);
    lines.push(`- Node specs: ${nodeSpecCount}`);
    lines.push(`- Graph DB: ${fs.existsSync(path.join(gdcRoot, 'graph.db')) ? 'present' : 'missing'}`);

    if (!gdc.detected) {
        lines.push('- Guide: run `gdc init --language <lang>` to enable graph-aware workflow.');
        return lines;
    }

    if (!gdc.enabled) {
        lines.push('- Guide: set `gdc.enabled=true` (or `auto`) in `maskweaver.config.json`.');
        return lines;
    }

    const [statsResult, checkResult] = await Promise.all([
        runGdcMachineCommand({
            basePath,
            command: 'stats',
            config: gdc,
            timeoutMs: 20_000,
        }),
        runGdcMachineCommand({
            basePath,
            command: 'check',
            config: gdc,
            timeoutMs: 20_000,
        }),
    ]);

    const stats = getStatsNodeSummary(statsResult.data);
    if (typeof stats.total === 'number') {
        lines.push(`- Stats: total=${stats.total}, implemented=${stats.implemented ?? 0}, tested=${stats.tested ?? 0}`);
    } else {
        lines.push(`- Stats command: exit=${statsResult.exitCode}`);
    }

    const counts = countGdcCheckIssues(checkResult.data);
    lines.push(`- Check: errors=${counts.errors}, warnings=${counts.warnings}, info=${counts.infos}, issues=${counts.issueCount}, exit=${checkResult.exitCode}`);

    return lines;
}

async function migrateLegacyPlanIfNeeded(basePath: string, activePlan: string | null): Promise<{
    migrated: boolean;
    migratedPlanName?: string;
    note?: string;
}> {
    const legacyPlanPath = path.join(basePath, '.opencode', 'weave', 'PLAN.yaml');
    if (!fs.existsSync(legacyPlanPath)) {
        return { migrated: false };
    }

    if (activePlan) {
        return {
            migrated: false,
            note: 'Legacy `PLAN.yaml` detected, but active multi-plan state already exists. Legacy file was left untouched.',
        };
    }

    const manager = getPhaseManager(basePath);
    const legacyPlan = await manager.loadPlan();
    if (!legacyPlan) {
        return {
            migrated: false,
            note: 'Legacy `PLAN.yaml` exists but could not be parsed for migration.',
        };
    }

    await manager.savePlan(legacyPlan);

    try {
        await unlink(legacyPlanPath);
    } catch {
        // Non-fatal. Keep migrated plan and continue.
    }

    return {
        migrated: true,
        migratedPlanName: legacyPlan.planName || legacyPlan.projectName,
    };
}

async function runGdcInitProbe(basePath: string): Promise<string[]> {
    const gdc = getEffectiveGdcConfig(basePath);
    const lines: string[] = [];
    lines.push('### GDC Integration');
    lines.push('');
    lines.push(`- mode: ${String(gdc.mode)}`);
    lines.push(`- detected: ${gdc.detected ? 'yes' : 'no'}`);
    lines.push(`- enabled: ${gdc.enabled ? 'yes' : 'no'}`);
    lines.push(`- binary: \`${gdc.binPath}\``);

    if (!gdc.detected) {
        lines.push('');
        lines.push('ℹ️ GDC workspace was not detected.');
        lines.push('- To build a project graph, run: `gdc init --language <lang>`');
        lines.push('- Then rerun: `weave command=init` (or continue with `weave command=prepare`)');
        return lines;
    }

    if (!gdc.enabled) {
        lines.push('');
        lines.push('ℹ️ GDC workspace is present but integration is disabled by configuration.');
        lines.push('- Enable it with `gdc.enabled=true` or `gdc.enabled="auto"` in `maskweaver.config.json`.');
        return lines;
    }

    const versionResult = await runGdcMachineCommand({
        basePath,
        command: 'version',
        config: gdc,
        timeoutMs: 20_000,
    });
    lines.push(formatGdcCommandLine('version', versionResult));

    const syncResult = await runGdcMachineCommand({
        basePath,
        command: 'sync',
        config: gdc,
        timeoutMs: 60_000,
    });
    lines.push(formatGdcCommandLine('sync', syncResult));

    const checkResult = await runGdcMachineCommand({
        basePath,
        command: 'check',
        config: gdc,
        timeoutMs: 60_000,
    });
    lines.push(formatGdcCommandLine('check', checkResult));

    const checkCounts = countGdcCheckIssues(checkResult.data);
    lines.push(`- check summary: errors=${checkCounts.errors}, warnings=${checkCounts.warnings}, info=${checkCounts.infos}, issues=${checkCounts.issueCount}`);

    const statsResult = await runGdcMachineCommand({
        basePath,
        command: 'stats',
        config: gdc,
        timeoutMs: 30_000,
    });
    lines.push(formatGdcCommandLine('stats', statsResult));
    const stats = getStatsNodeSummary(statsResult.data);
    if (typeof stats.total === 'number') {
        lines.push(`- node stats: total=${stats.total}, implemented=${stats.implemented ?? 0}, tested=${stats.tested ?? 0}`);
    }

    lines.push('');
    if (checkResult.exitCode === 2 || checkCounts.errors > 0) {
        lines.push('⚠️ GDC check found blocking issues. Resolve node/spec drift before strict verification.');
    } else {
        lines.push('✅ GDC graph sync/check probe completed.');
    }

    return lines;
}

async function handleInit(basePath: string): Promise<string> {
    const ignorePath = path.join(basePath, '.ignore');
    const weaveRoot = path.join(basePath, '.opencode', 'weave');
    const statePath = path.join(weaveRoot, 'state.yaml');
    const plansDir = path.join(weaveRoot, 'plans');
    const specsDir = path.join(weaveRoot, 'specs');

    const hadIgnore = fs.existsSync(ignorePath);
    const ignoreBefore = hadIgnore
        ? await readFile(ignorePath, 'utf-8').catch(() => '')
        : '';
    const hadState = fs.existsSync(statePath);
    const hadPlansDir = fs.existsSync(plansDir);
    const hadSpecsDir = fs.existsSync(specsDir);

    ensureIgnoreOverride(basePath);
    ensureWeaveState(basePath);

    const ignoreAfter = await readFile(ignorePath, 'utf-8').catch(() => '');
    const created: string[] = [];
    const updated: string[] = [];

    if (!hadIgnore) created.push('.ignore');
    else if (ignoreBefore !== ignoreAfter) updated.push('.ignore');
    if (!hadState) created.push('.opencode/weave/state.yaml');
    if (!hadPlansDir) created.push('.opencode/weave/plans/');
    if (!hadSpecsDir) created.push('.opencode/weave/specs/');

    const activePlanBeforeMigration = await readActivePlanFromState(statePath);
    const migration = await migrateLegacyPlanIfNeeded(basePath, activePlanBeforeMigration);

    if (!fs.existsSync(statePath)) {
        await writeFile(statePath, stringifyYaml({ active_plan: null }), 'utf-8');
    }

    const activePlan = await readActivePlanFromState(statePath);
    const totalPlans = await countPlanFiles(plansDir);
    const gdcReport = await runGdcInitProbe(basePath);

    const lines: string[] = [];
    const alreadyInitialized = created.length === 0 && updated.length === 0 && !migration.migrated;
    if (alreadyInitialized) {
        lines.push('ℹ️ 이미 Weave가 초기화되어 있습니다.');
    } else {
        lines.push('## ✅ Weave 초기화 완료!');
    }

    lines.push('');
    lines.push('### Weave 상태');
    lines.push(`- 활성 플랜: ${activePlan || '없음'}`);
    lines.push(`- 전체 플랜 수: ${totalPlans}`);

    if (created.length > 0) {
        lines.push('');
        lines.push('### 생성된 항목');
        for (const file of created) {
            lines.push(`- \`${file}\``);
        }
    }

    if (updated.length > 0) {
        lines.push('');
        lines.push('### 수정된 항목');
        for (const file of updated) {
            lines.push(`- \`${file}\``);
        }
    }

    if (migration.migrated) {
        lines.push('');
        lines.push('### Legacy Migration');
        lines.push(`- Migrated legacy \`PLAN.yaml\` to multi-plan format (${migration.migratedPlanName || 'active plan'}).`);
    } else if (migration.note) {
        lines.push('');
        lines.push('### Legacy Migration');
        lines.push(`- ${migration.note}`);
    }

    lines.push('');
    lines.push(...gdcReport);
    lines.push('');
    lines.push('다음 단계:');
    lines.push('- `weave command=prepare docsPath="docs/"` (권장)');
    lines.push('- 또는 `weave command=status`');

    return lines.join('\n');
}

async function handleResearch(
    args: { docsPath?: string; projectName?: string },
    basePath: string
): Promise<string> {
    const { docsPath, projectName } = args;
    if (!docsPath) {
        return 'Error: docsPath is required for research command. Example: weave research docs/';
    }

    const resolvedDocsPath = resolveUnderBase(basePath, docsPath);
    const intakeResult = await intake({ docsPath: resolvedDocsPath });
    const researchResult = await writeResearchReport({
        docsPath: resolvedDocsPath,
        intake: intakeResult,
        basePath,
        projectName: projectName || 'My Project',
    });

    await updateActivePlanReviewMetadata(basePath, {
        researchPath: researchResult.reportPath,
        resetApproval: true,
        approvalNotes: 'Research refreshed. Re-approve plan before implementation.',
    });

    return [
        '## ✅ Weave Research 완료',
        '',
        researchResult.summary,
        '',
        '다음 단계:',
        `- \`weave prepare ${docsPath}\` (권장)`,
        `- 또는 \`weave design ${docsPath}\``,
    ].join('\n');
}

async function handleRefinePlan(
    args: { notesPath?: string },
    basePath: string
): Promise<string> {
    const manager = getPhaseManager(basePath);
    const activePlan = await manager.loadPlan();
    if (!activePlan) {
        return 'Error: No active plan found. Run `weave prepare docs/` or `weave design docs/` first.';
    }

    const outcome = await refinePlanByNotes(basePath, activePlan, args.notesPath);
    if (outcome.status === 'missing') {
        return formatRefinePlanGuide(outcome.notesRelativePath);
    }

    if (outcome.status === 'no_directives') {
        return [
            'No refine directives found in plan-notes.',
            '',
            `- Notes: \`${outcome.notesRelativePath}\``,
            '- Add lines starting with `@phase`, `@plan`, or `@arch` and rerun.',
        ].join('\n');
    }

    if (outcome.status === 'no_changes') {
        return [
            'Plan notes parsed, but no plan diff was produced.',
            '',
            `- Notes: \`${outcome.notesRelativePath}\``,
            `- Parsed directives: ${outcome.directivesParsed}`,
            '- Your directives may already be reflected in the active plan.',
        ].join('\n');
    }

    const refinedPlan = outcome.updatedPlan;
    if (!refinedPlan) {
        return 'Error: plan refinement failed (no updated plan).';
    }

    refinedPlan.planApproved = false;
    refinedPlan.planApprovedAt = undefined;
    refinedPlan.planApprovalNotes = `Refined from notes (${outcome.notesRelativePath}). Review and approve again.`;
    await manager.savePlan(refinedPlan);

    await syncWorkflowArtifacts(basePath, manager, {
        reviewLines: [
            `Plan refined from notes: ${outcome.notesRelativePath}`,
            `Applied changes: ${outcome.changes.length}`,
        ],
    });

    return [
        formatRefinePlanResult('## 📝 Plan Refined From Notes', outcome),
        '',
        'Review the updated plan, then run: `weave command=approve-plan`',
    ].join('\n');
}

async function handleApprovePlan(
    args: { planReview?: string; notesPath?: string; applyNotes?: boolean },
    basePath: string
): Promise<string> {
    const manager = getPhaseManager(basePath);
    const activePlan = await manager.loadPlan();
    if (!activePlan) {
        return 'Error: No active plan found. Run `weave prepare docs/` or `weave design docs/` first.';
    }

    const autoApplyNotes = args.applyNotes ?? true;
    if (autoApplyNotes) {
        const outcome = await refinePlanByNotes(basePath, activePlan, args.notesPath);
        if (outcome.status === 'changed' && outcome.updatedPlan) {
            const refinedPlan = outcome.updatedPlan;
            refinedPlan.planApproved = false;
            refinedPlan.planApprovedAt = undefined;
            refinedPlan.planApprovalNotes = `Refined from notes (${outcome.notesRelativePath}). Review and approve again.`;
            await manager.savePlan(refinedPlan);

            await syncWorkflowArtifacts(basePath, manager, {
                reviewLines: [
                    `Approve-plan paused: refinement applied from ${outcome.notesRelativePath}.`,
                    `Applied changes: ${outcome.changes.length}`,
                ],
            });

            return [
                formatRefinePlanResult('## 📝 Plan Refined During Approve', outcome),
                '',
                'Approval paused after applying note directives.',
                'Review the updated plan and rerun: `weave command=approve-plan`',
            ].join('\n');
        }
    }

    let review = (args.planReview || '').trim();
    if (!review) {
        try {
            const notePath = resolvePlanNotesPath(basePath, args.notesPath);
            const noteBody = (await readFile(notePath, 'utf-8')).trim();
            if (noteBody.length > 0) {
                review = sanitizeLessonText(noteBody, 240);
            }
        } catch {
            // Optional note file.
        }
    }

    activePlan.planApproved = true;
    activePlan.planApprovedAt = new Date().toISOString();
    activePlan.planApprovalNotes = review || 'Approved without additional notes.';
    await manager.savePlan(activePlan);

    const nextPhase = activePlan.currentPhase
        || activePlan.phases.find(phase => phase.status === 'in_progress')?.id
        || activePlan.phases.find(phase => phase.status !== 'completed')?.id;

    return [
        '## ✅ Plan Approved',
        '',
        `- Plan: \`${getActivePlanArtifactPath(basePath, activePlan.planName)}\``,
        `- Approved at: ${activePlan.planApprovedAt}`,
        `- Review note: ${activePlan.planApprovalNotes}`,
        '',
        nextPhase
            ? `다음 단계: \`weave command=craft phaseId="${nextPhase}"\``
            : '다음 단계: `weave command=status`',
    ].join('\n');
}

async function handleDesign(
    args: {
        docsPath?: string;
        projectName?: string;
        planName?: string;
        splitPlans?: boolean;
        splitMaxPhases?: number;
        splitMaxHours?: number;
    },
    basePath: string
): Promise<string> {
    const { docsPath, projectName } = args;

    if (!docsPath) {
        return 'Error: docsPath is required for design command. Example: weave design docs/';
    }

    // Step 1: Intake
    const resolvedDocsPath = resolveUnderBase(basePath, docsPath);
    const intakeResult = await intake({ docsPath: resolvedDocsPath });
    const researchResult = await writeResearchReport({
        docsPath: resolvedDocsPath,
        intake: intakeResult,
        basePath,
        projectName: projectName || 'My Project',
    });

    // Check if there are questions
    if (intakeResult.questions.length > 0) {
        const lines: string[] = [];
        lines.push(researchResult.summary);
        lines.push('');
        lines.push('## 📄 문서 분석 완료\n');
        lines.push(`**발견한 기능**: ${intakeResult.features.slice(0, 5).join(', ')}`);
        lines.push(`**기술 스택**: ${JSON.stringify(intakeResult.technicalRequirements)}\n`);
        lines.push('## ❓ 확인이 필요합니다\n');

        for (const q of intakeResult.questions) {
            lines.push(`### ${q.id}. ${q.topic}`);
            lines.push(q.question);
            if (q.options) {
                for (const opt of q.options) {
                    lines.push(`- ${opt}`);
                }
            }
            lines.push('');
        }

        lines.push('---');
        lines.push('답변해주시면 계획서를 만들겠습니다.');
        lines.push('(또는 기본값으로 진행하려면 "기본값으로 진행해"라고 해주세요)');

        return lines.join('\n');
    }

    // Step 2: Plan (if no questions or defaults accepted)
    const planResult = await plan({
        intake: intakeResult,
        projectName: projectName || 'My Project',
        planName: normalizePlanName(args.planName, projectName, resolvedDocsPath),
        basePath,
        splitPlans: args.splitPlans,
        splitMaxPhases: args.splitMaxPhases,
        splitMaxHours: args.splitMaxHours,
    });

    await updateActivePlanReviewMetadata(basePath, {
        researchPath: researchResult.reportPath,
        resetApproval: true,
        approvalNotes: 'Plan created from design. Review and approve before implementation.',
    });

    return [
        researchResult.summary,
        '',
        planResult.summary,
        '',
        '---',
        '계획을 검토하고 구현 전에 승인하세요:',
        '- `weave command=approve-plan`',
    ].join('\n');
}

async function handleSpec(
    args: { docsPath?: string; projectName?: string; planName?: string },
    basePath: string
): Promise<string> {
    const { docsPath, projectName } = args;

    if (!docsPath) {
        return 'Error: docsPath is required for spec command. Example: weave spec docs/';
    }

    const resolvedDocsPath = resolveUnderBase(basePath, docsPath);
    const intakeResult = await intake({ docsPath: resolvedDocsPath });

    const specName = normalizePlanName(args.planName, projectName, resolvedDocsPath);
    const specResult = await createSpec({
        intake: intakeResult,
        projectName: projectName || 'My Project',
        specName,
        basePath,
    });

    return [
        '## ✅ Weave Spec 완료',
        '',
        specResult.summary,
        '',
        '다음 단계:',
        `- \`weave design ${docsPath}\``,
    ].join('\n');
}

async function handlePrepare(
    args: {
        docsPath?: string;
        projectName?: string;
        planName?: string;
        splitPlans?: boolean;
        splitMaxPhases?: number;
        splitMaxHours?: number;
    },
    basePath: string
): Promise<string> {
    const { docsPath, projectName } = args;

    if (!docsPath) {
        return 'Error: docsPath is required for prepare command. Example: weave prepare docs/';
    }

    const resolvedDocsPath = resolveUnderBase(basePath, docsPath);
    const intakeResult = await intake({ docsPath: resolvedDocsPath });
    const gdcPrepareSync = await runGdcPrepareSync(basePath);
    const researchResult = await writeResearchReport({
        docsPath: resolvedDocsPath,
        intake: intakeResult,
        basePath,
        projectName: projectName || 'My Project',
    });

    const normalizedPlanName = normalizePlanName(args.planName, projectName, resolvedDocsPath);

    // Step 2: Spec (baseline)
    const specResult = await createSpec({
        intake: intakeResult,
        projectName: projectName || 'My Project',
        specName: normalizedPlanName,
        basePath,
    });

    // Prepare is the default "happy path": proceed with reasonable defaults.
    const planResult = await plan({
        intake: intakeResult,
        projectName: projectName || 'My Project',
        planName: normalizedPlanName,
        basePath,
        splitPlans: args.splitPlans,
        splitMaxPhases: args.splitMaxPhases,
        splitMaxHours: args.splitMaxHours,
    });

    await updateActivePlanReviewMetadata(basePath, {
        researchPath: researchResult.reportPath,
        resetApproval: true,
        approvalNotes: 'Plan created from prepare. Review and approve before implementation.',
    });

    const lines: string[] = [];
    lines.push('## ✅ Weave Prepare 완료\n');
    if (gdcPrepareSync.applied && gdcPrepareSync.report) {
        lines.push(gdcPrepareSync.report);
        lines.push('');
    }
    lines.push(researchResult.summary);
    lines.push('');
    lines.push(specResult.summary);
    lines.push('');
    lines.push(planResult.summary);

    if (intakeResult.questions.length > 0) {
        lines.push('\n---\n');
        lines.push('### ❓ 확인이 필요한 질문 (기본값으로 진행)\n');
        for (const q of intakeResult.questions) {
            lines.push(`- ${q.id}: ${q.question}`);
        }
    }

    lines.push('\n---\n');
    lines.push('다음 단계 (구현 전 승인 필수):');
    lines.push('`weave command=approve-plan`');
    lines.push('그 다음 `weave craft P1` 또는 `weave flow`');

    return lines.join('\n');
}

async function handleFlow(
    args: {
        docsPath?: string;
        projectName?: string;
        planName?: string;
        splitPlans?: boolean;
        splitMaxPhases?: number;
        splitMaxHours?: number;
        phaseId?: string;
        projectType?: string;
        verifyMode?: 'quick' | 'full';
        skipVerify?: boolean;
    },
    basePath: string
): Promise<string> {
    const lines: string[] = [];
    lines.push('## ▶ Weave Flow');

    if (args.docsPath) {
        const prepareResult = await handlePrepare({
            docsPath: args.docsPath,
            projectName: args.projectName,
            planName: args.planName,
            splitPlans: args.splitPlans,
            splitMaxPhases: args.splitMaxPhases,
            splitMaxHours: args.splitMaxHours,
        }, basePath);

        if (prepareResult.startsWith('Error:')) {
            return prepareResult;
        }

        lines.push('');
        lines.push('### 1) Prepare');
        lines.push('');
        lines.push(prepareResult);
    } else {
        const manager = getPhaseManager(basePath);
        const existingPlan = await manager.loadPlan();
        if (!existingPlan) {
            return 'Error: docsPath is required when no active plan exists. Example: weave command=flow docsPath="docs/"';
        }

        lines.push('');
        lines.push('### 1) Prepare');
        lines.push('');
        lines.push('Skipped (existing active plan reused).');
    }

    const manager = getPhaseManager(basePath);
    const plan = await manager.loadPlan();
    if (!plan) {
        return 'Error: No active plan found after prepare. Run `weave prepare docs/` first.';
    }

    const requestedPhaseId = args.phaseId?.trim();
    const resolvedPhaseId = requestedPhaseId
        || plan.currentPhase
        || plan.phases.find(p => p.status === 'in_progress')?.id
        || manager.getNextPhase()?.id;

    if (!resolvedPhaseId) {
        return 'Error: No executable phase found. Run `weave status` and check plan state.';
    }

    if (requestedPhaseId && !manager.getPhase(requestedPhaseId)) {
        return `Error: Phase not found: ${requestedPhaseId}`;
    }

    const phaseBeforeCraft = manager.getPhase(resolvedPhaseId);
    if (!phaseBeforeCraft) {
        return `Error: Phase not found: ${resolvedPhaseId}`;
    }

    // Legacy plans may not have explicit tasks yet.
    if (!phaseBeforeCraft.tasks || phaseBeforeCraft.tasks.length === 0) {
        await manager.addTasks(resolvedPhaseId, generateDefaultPhaseTasks(phaseBeforeCraft));
    }

    const refreshedPhase = manager.getPhase(resolvedPhaseId);
    if (!refreshedPhase) {
        return `Error: Phase not found: ${resolvedPhaseId}`;
    }

    const planGate = evaluatePlanGate(refreshedPhase);
    lines.push('');
    lines.push('### Plan Gate');
    lines.push('');
    lines.push(`Scope: ${planGate.nonTrivial ? 'non-trivial' : 'simple'}`);
    for (const check of planGate.checks) {
        lines.push(`- ${check.passed ? 'PASS' : 'FAIL'}: ${check.label}`);
    }

    if (!planGate.passed) {
        lines.push('');
        lines.push('⚠️ Plan gate failed, but flow continues in one-shot mode.');
        lines.push(`Missing checks: ${planGate.failedLabels.join(', ')}`);

        await appendWorkflowLesson(basePath, {
            trigger: 'plan_gate_failed_bypassed',
            pattern: `Phase ${resolvedPhaseId} failed plan gate checks: ${planGate.failedLabels.join(', ')}`,
            rule: 'Flow one-shot mode bypassed plan gate. Revisit plan quality after this run.',
        });
    }

    lines.push('');
    lines.push('### Plan Approval');
    lines.push('');

    if (!plan.planApproved) {
        const approvalResult = await handleApprovePlan({
            planReview: 'Auto-approved by weave flow',
            applyNotes: false,
        }, basePath);

        if (approvalResult.startsWith('Error:')) {
            await syncWorkflowArtifacts(basePath, manager, {
                phaseId: resolvedPhaseId,
                reviewLines: [
                    `Flow failed at auto-approval for ${resolvedPhaseId}.`,
                ],
            });
            return approvalResult;
        }

        lines.push(approvalResult);
    } else {
        lines.push('- PASS: plan approved for implementation');
    }

    const craftResult = await handleCraft({
        phaseId: resolvedPhaseId,
        projectType: args.projectType,
        verify: true,
        verifyMode: args.verifyMode || 'quick',
        skipVerify: args.skipVerify,
    }, basePath);

    lines.push('');
    lines.push('### 2) Craft');
    lines.push('');
    lines.push(craftResult);

    lines.push('');
    lines.push('### 3) Verify');
    lines.push('');

    const reviewLines: string[] = [
        `Flow executed for ${resolvedPhaseId}.`,
        `Plan gate: ${planGate.passed ? 'PASS' : 'BYPASS'} (${planGate.nonTrivial ? 'non-trivial' : 'simple'} scope).`,
    ];

    const gdcGate = await runGdcVerifyGate(basePath);
    if (gdcGate.applied && gdcGate.report) {
        lines.push(gdcGate.report);
        lines.push('');
    }
    if (!gdcGate.passed) {
        lines.push(`❌ Verification failed at: ${gdcGate.failedAt || 'GDC Gate'}`);

        reviewLines.push(`Flow stopped at GDC gate for ${resolvedPhaseId}: ${gdcGate.failedAt || 'GDC Gate'}.`);
        await syncWorkflowArtifacts(basePath, manager, {
            phaseId: resolvedPhaseId,
            reviewLines,
        });
        return lines.join('\n');
    }

    const verification = await runAIVerification({
        projectType: args.projectType || 'unknown',
        projectPath: basePath,
        enablePlaywright: false,
        enableScreenshots: false,
        mode: args.verifyMode || 'quick',
    });
    const verificationReport = generateVerificationReport(verification.results);
    lines.push(verificationReport);

    reviewLines.push(`Craft prepared execution context for ${resolvedPhaseId}.`);
    reviewLines.push('Phase implementation/verification proceeds outside the legacy auto loop.');
    if (gdcGate.applied) {
        reviewLines.push(`GDC pre-verify gate passed for ${resolvedPhaseId}.`);
    }

    if (!verification.passed) {
        lines.push('');
        lines.push(`❌ Verification failed at: ${verification.failedAt || 'unknown'}`);
        lines.push('Fix the issues and rerun `weave command=flow` or `weave command=verify`.');

        reviewLines.push(`Flow stopped at verification for ${resolvedPhaseId}: ${verification.failedAt || 'unknown'}.`);
        await syncWorkflowArtifacts(basePath, manager, {
            phaseId: resolvedPhaseId,
            reviewLines,
        });
        return lines.join('\n');
    }

    lines.push('');
    lines.push('### 4) Finalize');
    lines.push('');

    const finalizeResult = await handleApprove({
        phaseId: resolvedPhaseId,
        projectType: args.projectType,
        skipVerify: true,
        source: 'command',
    }, basePath);
    lines.push(finalizeResult);

    reviewLines.push(`Flow verification passed for ${resolvedPhaseId}.`);
    reviewLines.push(`Flow finalized ${resolvedPhaseId}.`);

    await syncWorkflowArtifacts(basePath, manager, {
        phaseId: resolvedPhaseId,
        reviewLines,
    });

    return lines.join('\n');
}

async function handleCraft(
    args: {
        phaseId?: string;
        projectType?: string;
        verify?: boolean;
        verifyMode?: 'quick' | 'full';
        skipVerify?: boolean;
        commit?: boolean;
        stageAll?: boolean;
        commitMessage?: string;
    },
    basePath: string
): Promise<string> {
    const { phaseId, projectType } = args;
    let resolvedPhaseId = phaseId;
    let autoSelectedPhase = false;
    let recoveryPrefix = '';

    const planManager = getPhaseManager(basePath);
    const activePlan = await planManager.loadPlan();
    if (!activePlan) {
        return 'Error: No active plan. Run `weave design docs/` (or `weave prepare docs/`) first.';
    }
    if (!activePlan.planApproved) {
        return formatPlanApprovalRequired(basePath, activePlan);
    }

    if (!resolvedPhaseId) {
        // Get next phase
        const manager = getPhaseManager(basePath);
        await manager.loadPlan();
        
        // Show any recovery messages from auto-repair during load
        const recoveryMsgs = manager.getRecoveryMessages();
        recoveryPrefix = recoveryMsgs.length > 0
            ? `> **Auto-repair**: ${recoveryMsgs.join('; ')}\n\n`
            : '';
        
        const nextPhase = manager.getNextPhase();

        if (!nextPhase) {
            const stats = manager.getStats();
            if (stats.progress === 100) {
                return recoveryPrefix + 'All phases completed!';
            }
            return recoveryPrefix + 'Error: No phase to execute. Run /weave design first.';
        }

        resolvedPhaseId = nextPhase.id;
        autoSelectedPhase = true;
    }

    // Ensure tasks exist for legacy plans. (Old plans may have empty task arrays.)
    {
        const manager = getPhaseManager(basePath);
        await manager.loadPlan();
        const current = manager.getPhase(resolvedPhaseId);
        if (!current) {
            return `Error: Phase not found: ${resolvedPhaseId}`;
        }
        if (!current.tasks || current.tasks.length === 0) {
            await manager.addTasks(resolvedPhaseId, generateDefaultPhaseTasks(current));
        }
    }

    // Prepare execution plan (validates, marks in_progress, generates plan)
    const events: any[] = [];
    const { plan: executionPlan } = await preparePhaseExecution({
        phaseId: resolvedPhaseId,
        projectType,
        onEvent: (event) => events.push(event),
        basePath,
    });

    // Format the execution plan as markdown for the Mask Weaver
    const planMarkdown = formatExecutionPlan(executionPlan);

    const manager = getPhaseManager(basePath);
    await manager.loadPlan();

    const lines: string[] = [];
    if (recoveryPrefix) {
        lines.push(recoveryPrefix.trimEnd());
        lines.push('');
    }
    if (autoSelectedPhase) {
        lines.push(`Auto-selected phase: ${resolvedPhaseId}`);
        lines.push('');
    }
    lines.push(planMarkdown);

    const generatedContextPaths = (executionPlan.gdcContextFiles || [])
        .filter(item => item.status === 'generated')
        .map(item => item.path);
    if (generatedContextPaths.length > 0) {
        lines.push('');
        lines.push('### GDC Extract Context');
        lines.push('');
        for (const contextPath of generatedContextPaths.slice(0, 24)) {
            lines.push(`- \`${contextPath}\``);
        }
    }

    lines.push('');
    lines.push('### Next Steps');
    lines.push('');
    lines.push('- Implement/delegate the phase work using the execution plan above.');
    lines.push('- Run verification: `weave command=verify` (or your project test/build commands).');
    lines.push(`- Finalize the phase when ready: \`weave command=approve-plan phaseId="${resolvedPhaseId}"\``);
    lines.push('- Check overall progress anytime: `weave command=status`.');

    await syncWorkflowArtifacts(basePath, manager, {
        phaseId: resolvedPhaseId,
        contextPaths: generatedContextPaths,
        reviewLines: [
            `Craft prepared execution context for ${resolvedPhaseId}.`,
            'Legacy auto loop has been removed; proceed with implementation + verification, then approve.',
        ],
    });

    return lines.join('\n');
}

function generateDefaultPhaseTasks(
    phase: { id: string; name: string; doneWhen: string }
): Array<Omit<WeavePhase['tasks'][0], 'status' | 'retryCount'>> {
    const baseId = phase.id;
    const title = phase.name;
    return [
        {
            id: `${baseId}-T1`,
            name: `${title} 구현`,
            testCase: phase.doneWhen,
            verify: [
                { kind: 'checklist', value: phase.doneWhen },
            ],
            acceptanceRefs: [`phase:${phase.id}`],
            maxRetries: 3,
        },
        {
            id: `${baseId}-T2`,
            name: `${title} 테스트 추가/수정`,
            testCase: '관련 테스트가 통과한다',
            dependsOn: [`${baseId}-T1`],
            verify: [
                { kind: 'checklist', value: '관련 테스트가 통과한다' },
            ],
            acceptanceRefs: [`phase:${phase.id}:tests`],
            maxRetries: 2,
        },
        {
            id: `${baseId}-T3`,
            name: `${title} 검증 (빌드/테스트)`,
            testCase: '빌드/테스트가 통과한다',
            dependsOn: [`${baseId}-T2`],
            verify: [
                { kind: 'command', value: 'weave command=verify' },
            ],
            acceptanceRefs: [`phase:${phase.id}:verify`],
            maxRetries: 2,
        },
    ];
}

async function handleStatus(basePath: string): Promise<string> {
    const manager = getPhaseManager(basePath);
    const activePlan = await manager.loadPlan();
    
    const report = await generateStatusReport(basePath);

    // Show any recovery messages from auto-repair
    const recoveryMsgs = manager.getRecoveryMessages();

    // Add global knowledge stats
    const knowledge = new GlobalKnowledge();
    await knowledge.init();
    const stats = await knowledge.getStats();

    const lines: string[] = [];
    
    // Show recovery warnings at the top
    if (recoveryMsgs.length > 0) {
        lines.push('### YAML Auto-Repair Report\n');
        for (const msg of recoveryMsgs) {
            lines.push(`> ${msg}`);
        }
        lines.push('');
        lines.push('> Run `weave repair` for a full repair scan.\n');
    }
    
    lines.push(report, '');
    if (activePlan) {
        lines.push('### Plan Approval');
        lines.push(`- Approved: ${activePlan.planApproved ? 'yes' : 'no'}`);
        if (activePlan.planApprovedAt) {
            lines.push(`- Approved at: ${activePlan.planApprovedAt}`);
        }
        if (activePlan.researchPath) {
            lines.push(`- Research: \`${activePlan.researchPath}\``);
        }
        lines.push('');
    }

    const gdcLines = await collectGdcStatusLines(basePath);
    lines.push(...gdcLines);
    lines.push('');

    lines.push('### Global Knowledge Base');
    lines.push(`- Total troubleshooting records: ${stats.totalEntries}`);
    if (stats.topProjectTypes.length > 0) {
        lines.push(`- Top project types: ${stats.topProjectTypes.slice(0, 3).map(t => `${t.type}(${t.count})`).join(', ')}`);
    }

    return lines.join('\n');
}

async function handleWorktree(
        args: {
            worktreeAction?: 'create' | 'list' | 'open' | 'remove' | 'merge';
            name?: string;
            fromRef?: string;
            deleteBranch?: boolean;
            bootstrapWeave?: boolean;
            bootstrapGdc?: boolean;
        },
        basePath: string
    ): Promise<string> {
    const action = args.worktreeAction || 'list';

    switch (action) {
        case 'list': {
            const worktrees = await listWeaveWorktrees({ basePath });
            if (worktrees.length === 0) {
                return 'No Weave worktrees found. Create one with: weave command=worktree worktreeAction=create name="feature-x"';
            }

            const lines: string[] = [];
            lines.push('## 🌿 Weave Worktrees\n');
            lines.push('| Name | Branch | Path |');
            lines.push('|------|--------|------|');
            for (const wt of worktrees) {
                lines.push(`| ${wt.taskId} | ${wt.branch} | ${wt.path} |`);
            }
            lines.push('');
            lines.push('Open one: `weave command=worktree worktreeAction=open name="<name>"`');
            return lines.join('\n');
        }

        case 'create': {
            if (!args.name) {
                return 'Error: name is required. Example: weave command=worktree worktreeAction=create name="feature-login"';
            }

            const info = await createWeaveWorktree({
                basePath,
                name: args.name,
                fromRef: args.fromRef,
                bootstrapWeave: args.bootstrapWeave,
                bootstrapGdc: args.bootstrapGdc,
            });

            return [
                '## ✅ Worktree 생성 완료',
                '',
                `- Name: \`${info.name}\``,
                `- Branch: \`${info.branch}\``,
                `- Path: \`${info.path}\``,
                `- GDC bootstrap: ${args.bootstrapGdc === false ? 'disabled' : 'enabled'}`,
                '',
                '다음:',
                `- 해당 폴더로 이동 후 /weave-prepare 또는 /weave-design 실행`,
            ].join('\n');
        }

        case 'open': {
            if (!args.name) {
                return 'Error: name is required. Example: weave command=worktree worktreeAction=open name="feature-login"';
            }

            const info = await resolveWeaveWorktree({ basePath, name: args.name });
            if (!info) {
                return `Worktree not found: ${args.name}`;
            }

            return [
                '## 📂 Worktree Path',
                '',
                `- Name: \`${info.name}\``,
                `- Branch: \`${info.branch}\``,
                `- Path: \`${info.path}\``,
            ].join('\n');
        }

        case 'remove': {
            if (!args.name) {
                return 'Error: name is required. Example: weave command=worktree worktreeAction=remove name="feature-login"';
            }

            await removeWeaveWorktree({
                basePath,
                name: args.name,
                deleteBranch: args.deleteBranch,
            });

            return `✅ Worktree removed: ${args.name}${args.deleteBranch ? ' (branch deleted)' : ''}`;
        }

        case 'merge': {
            if (!args.name) {
                return 'Error: name is required. Example: weave command=worktree worktreeAction=merge name="feature-login"';
            }

            const info = await resolveWeaveWorktree({ basePath, name: args.name });
            const branch = info?.branch || `weave/${args.name}`;

            const rec = recommendVerificationCommands({ projectPath: basePath });
            const verifyCmds = formatRecommendedCommandsAsBash(rec);

            return [
                '## 🔀 Worktree Merge Guide',
                '',
                `Target branch: merge \`${branch}\` into your current branch.`,
                '',
                'Suggested commands:',
                '```bash',
                `git merge ${branch}`,
                verifyCmds,
                '```',
                '',
                'After merge, you can remove the worktree:',
                '```txt',
                `weave command=worktree worktreeAction=remove name="${args.name}"`,
                '```',
            ].join('\n');
        }
    }
}

async function handleVerify(
    args: { projectType?: string; verifyMode?: 'quick' | 'full' },
    basePath: string
): Promise<string> {
    const projectType = args.projectType || 'unknown';
    const mode = args.verifyMode || 'full';

    const gdcGate = await runGdcVerifyGate(basePath);
    const sections: string[] = [];
    if (gdcGate.applied && gdcGate.report) {
        sections.push(gdcGate.report);
    }
    if (!gdcGate.passed) {
        sections.push(`❌ Verification failed at: ${gdcGate.failedAt || 'GDC Gate'}`);
        return sections.join('\n\n');
    }

    const verification = await runAIVerification({
        projectType,
        projectPath: basePath,
        enablePlaywright: false,
        enableScreenshots: false,
        mode,
    });

    const report = generateVerificationReport(verification.results);
    sections.push(report);

    if (verification.results.length === 0) {
        sections.push([
            '',
            '> No verification commands detected for this project.',
            '> Provide scripts/tools (package.json, go.mod, Cargo.toml, pyproject.toml, *.sln) or pass projectType hint.',
        ].join('\n'));
        return sections.join('\n\n');
    }

    if (!verification.passed) {
        sections.push([
            '',
            `❌ Verification failed at: ${verification.failedAt || 'unknown'}`,
        ].join('\n'));
        return sections.join('\n\n');
    }

    sections.push([
        '',
        '✅ Verification passed.',
    ].join('\n'));
    return sections.join('\n\n');
}

async function handleTroubleshoot(args: { error?: string; projectType?: string }): Promise<string> {
    const { error, projectType } = args;

    if (!error) {
        return 'Error: error is required for troubleshoot command';
    }

    const solutions = await searchTroubleshooting(error, { projectType, limit: 5 });

    if (solutions.length === 0) {
        return '유사한 해결책을 찾지 못했습니다.\n\n문제를 해결하신 후, `weave record`로 해결책을 기록해주세요.';
    }

    const lines: string[] = ['## 💡 유사한 해결책 발견\n'];

    for (let i = 0; i < solutions.length; i++) {
        const { entry, score, matchType } = solutions[i];
        lines.push(`### ${i + 1}. (${matchType}, 점수: ${(score * 100).toFixed(0)}%)`);
        lines.push(`**상황**: ${entry.context}`);
        lines.push(`**해결책**: ${entry.solution}`);
        if (entry.projectType) lines.push(`**프로젝트 유형**: ${entry.projectType}`);
        lines.push(`**효과성**: ${'⭐'.repeat(Math.min(5, Math.round(entry.effectiveness / 2)))}`);
        lines.push('');
    }

    return lines.join('\n');
}

async function handleRecord(args: { error?: string; solution?: string; context?: string; projectType?: string }): Promise<string> {
    const { error, solution, context, projectType } = args;

    if (!error || !solution) {
        return 'Error: error and solution are required for record command';
    }

    const id = await recordTroubleshooting({
        errorMessage: error,
        context: context || 'User recorded',
        solution,
        projectType,
        effectiveness: 7,
    });

    return `✅ 트러블슈팅 솔루션이 기록되었습니다 (ID: ${id})\n\n다음에 비슷한 에러가 발생하면 자동으로 이 해결책을 제안합니다.`;
}

async function handleRepair(basePath: string): Promise<string> {
    const manager = getPhaseManager(basePath);
    const { results, summary } = await manager.repairPlans();
    return summary;
}

async function maybeAdvanceToNextShard(
    phaseManager: ReturnType<typeof getPhaseManager>,
    basePath: string
): Promise<string | null> {
    const activePlan = await phaseManager.loadPlan();
    if (!activePlan) return null;
    if (activePlan.planRole !== 'shard' || !activePlan.nextPlanName) return null;

    const allPhasesCompleted = activePlan.phases.length > 0
        && activePlan.phases.every(phase => phase.status === 'completed');
    if (!allPhasesCompleted) return null;

    const allPlans = await phaseManager.loadAllPlans();
    const nextPlan = allPlans.find(plan => plan.planName === activePlan.nextPlanName);
    if (!nextPlan) {
        return `Warning: next shard plan \`${activePlan.nextPlanName}\` not found.`;
    }

    await phaseManager.savePlan(nextPlan);

    const shardLabel = (typeof nextPlan.shardIndex === 'number' && typeof nextPlan.shardTotal === 'number')
        ? `${nextPlan.shardIndex}/${nextPlan.shardTotal}`
        : 'next shard';

    return [
        `Auto-switched to shard plan: \`${nextPlan.planName}\` (${shardLabel}).`,
        'Review/approve this shard before implementation:',
        '- `weave command=approve-plan`',
        '- `weave command=craft`',
    ].join('\n');
}

async function handleApprove(
    args: {
        phaseId?: string;
        projectType?: string;
        skipVerify?: boolean;
        verifyMode?: 'quick' | 'full';
        commit?: boolean;
        stageAll?: boolean;
        commitMessage?: string;
        source?: 'command' | 'craft';
    },
    basePath: string
): Promise<string> {
    const { phaseId: requestedPhaseId, projectType, skipVerify, verifyMode, commit, stageAll, commitMessage, source = 'command' } = args;
    const invokedByCraft = source === 'craft';

    const phaseManager = getPhaseManager(basePath);
    const loadedPlan = await phaseManager.loadPlan();
    const resolvedPhaseId = requestedPhaseId
        || loadedPlan?.currentPhase
        || loadedPlan?.phases.find(p => p.status === 'in_progress')?.id
        || loadedPlan?.phases.find(p => p.status !== 'completed')?.id;

    if (!resolvedPhaseId) {
        return 'Error: No phase found to finalize. Run `weave craft` first.';
    }

    const finalizeApprove = async (message: string, reviewLines: string[]): Promise<string> => {
        await syncWorkflowArtifacts(basePath, phaseManager, {
            phaseId: resolvedPhaseId,
            reviewLines,
        });
        return message;
    };

    if (!skipVerify) {
        const reportSections: string[] = [];

        const gdcGate = await runGdcVerifyGate(basePath);
        if (gdcGate.applied && gdcGate.report) {
            reportSections.push(gdcGate.report);
        }
        if (!gdcGate.passed) {
            return finalizeApprove([
                ...reportSections,
                `❌ Verification failed at: ${gdcGate.failedAt || 'GDC Gate'}`,
                '',
                invokedByCraft
                    ? 'Fix the failures and rerun `weave craft`.'
                    : 'Fix the failures and re-run `weave craft`.',
                'You can also run: `weave command=verify`',
            ].filter(Boolean).join('\n\n'), [
                `Finalization blocked at GDC gate for ${resolvedPhaseId}: ${gdcGate.failedAt || 'GDC Gate'}.`,
            ]);
        }

        const verification = await runAIVerification({
            projectType: projectType || 'unknown',
            projectPath: basePath,
            enablePlaywright: false,
            enableScreenshots: false,
            mode: verifyMode || 'full',
        });

        reportSections.push(generateVerificationReport(verification.results));
        const report = reportSections.join('\n\n');

        if (!verification.passed) {
            return finalizeApprove([
                report,
                '',
                `❌ Verification failed at: ${verification.failedAt || 'unknown'}`,
                '',
                invokedByCraft
                    ? 'Fix the failures and rerun `weave craft`.'
                    : 'Fix the failures and re-run `weave craft`.',
                'You can also run: `weave command=verify`',
            ].join('\n'), [
                `Finalization blocked: verification failed for ${resolvedPhaseId}.`,
            ]);
        }

        // If no commands detected, allow finalization but make it explicit.
        if (verification.results.length === 0) {
            await phaseManager.markAllTasksPassed(resolvedPhaseId);
            const result = await handleUserResponse(resolvedPhaseId, 'approve', undefined, basePath);
            const shardSwitch = await maybeAdvanceToNextShard(phaseManager, basePath);
            return finalizeApprove([
                report,
                '',
                '> No verification commands detected; approved without automated checks.',
                '',
                result.message,
                shardSwitch || '',
            ].filter(Boolean).join('\n'), [
                `Approved ${resolvedPhaseId} without automated verification commands.`,
                shardSwitch ? 'Advanced to next shard.' : '',
            ].filter(Boolean) as string[]);
        }

        // Optional: commit during finalization
        if (commit) {
            try {
                await ensureGitRepo(basePath);

                if (stageAll) {
                    await stageAllChanges(basePath);
                } else {
                    const hasStaged = await hasStagedChanges(basePath);
                    if (!hasStaged) {
                        return finalizeApprove([
                            report,
                            '',
                            '❌ No staged changes to commit.',
                            'Stage files first, or rerun with `stageAll=true`.',
                            'Example:',
                            '```txt',
                            `weave command=craft phaseId="${resolvedPhaseId}" commit=true stageAll=true`,
                            '```',
                        ].join('\n'), [
                            `Finalization commit blocked: no staged changes for ${resolvedPhaseId}.`,
                        ]);
                    }
                }

                const stagedFiles = await listStagedFiles(basePath);
                const secretCfg = loadSecretScanConfig(basePath);
                const findings = scanFilesForSecrets({ projectPath: basePath, files: stagedFiles, config: secretCfg });
                if (findings.length > 0 && shouldBlockOnFindings(findings, secretCfg)) {
                    return finalizeApprove([
                        report,
                        '',
                        formatSecretScanReport(findings),
                    ].join('\n'), [
                        `Finalization commit blocked by secret scan in ${resolvedPhaseId}.`,
                    ]);
                }

                const secretWarning = findings.length > 0
                    ? formatSecretScanReport(findings)
                    : null;

                // Commit message fallback: Pn: Phase Name
                const phase = phaseManager.getPhase(resolvedPhaseId);
                const defaultMsg = phase ? `${phase.id}: ${phase.name}` : `${resolvedPhaseId}: complete`;
                const msg = (commitMessage && commitMessage.trim().length > 0)
                    ? commitMessage.trim()
                    : defaultMsg;

                const commitRes = await commitStagedChanges(basePath, msg);
                const commitOutput = [commitRes.stdout, commitRes.stderr].filter(Boolean).join('\n').trim();

                await phaseManager.markAllTasksPassed(resolvedPhaseId);
                const result = await handleUserResponse(resolvedPhaseId, 'approve', undefined, basePath);
                const shardSwitch = await maybeAdvanceToNextShard(phaseManager, basePath);
                return finalizeApprove([
                    report,
                    '',
                    secretWarning ? secretWarning : '',
                    '✅ Commit created.',
                    commitOutput ? ['```', commitOutput, '```'].join('\n') : '',
                    '',
                    result.message,
                    shardSwitch || '',
                ].filter(Boolean).join('\n'), [
                    `Auto-finalized ${resolvedPhaseId} with commit.`,
                    shardSwitch ? 'Advanced to next shard.' : '',
                ].filter(Boolean) as string[]);
            } catch (e) {
                const msg = e instanceof Error ? e.message : String(e);
                return finalizeApprove([
                    report,
                    '',
                    `❌ Commit failed: ${msg}`,
                ].join('\n'), [
                    `Finalization commit failed for ${resolvedPhaseId}: ${sanitizeLessonText(msg)}`,
                ]);
            }
        }

        // Passed with results: include report in approval output.
        {
            await phaseManager.markAllTasksPassed(resolvedPhaseId);
        }
        const result = await handleUserResponse(resolvedPhaseId, 'approve', undefined, basePath);
        const shardSwitch = await maybeAdvanceToNextShard(phaseManager, basePath);
        return finalizeApprove([
            report,
            '',
            result.message,
            shardSwitch || '',
        ].filter(Boolean).join('\n'), [
            `Auto-finalized ${resolvedPhaseId} after verification pass.`,
            shardSwitch ? 'Advanced to next shard.' : '',
        ].filter(Boolean) as string[]);
    }

    const result = await handleUserResponse(resolvedPhaseId, 'approve', undefined, basePath);
    const shardSwitch = await maybeAdvanceToNextShard(phaseManager, basePath);
    return finalizeApprove([
        result.message,
        shardSwitch || '',
    ].filter(Boolean).join('\n'), [
        `Auto-finalized ${resolvedPhaseId} with skipVerify=true.`,
        shardSwitch ? 'Advanced to next shard.' : '',
    ].filter(Boolean) as string[]);
}

function getHelpMessage(): string {
    return `## Weave Workflow Help (Maskweaver v${VERSION})

**Weave** is Maskweaver's Phase-Driven Development workflow.
"AI verifies, User confirms"

### Version

\`Maskweaver v${VERSION}\`

To check installed version:
- CLI: \`maskweaver --version\`
- In chat: use \`maskweaver_status\` tool
- npm: \`npm list maskweaver\`

### Commands

  | Command | Description |
  |---------|-------------|
  | \`weave init\` | Initialize weave workspace (.ignore + state/plans) and probe GDC |
  | \`weave research [docs]\` | Deep-read docs + workspace context and write persistent research.md |
  | \`weave spec [docs]\` | Generate baseline spec (requirements + AC) |
  | \`weave prepare [docs]\` | Create spec + phase plan (auto-splits oversized plans) |
  | \`weave refine-plan\` | Apply structured plan-note directives to active plan |
  | \`weave approve-plan\` | Mark plan approved before implementation |
  | \`weave flow [docs]\` | One-command path (prepare -> auto-approve -> craft -> verify -> finalize) |
  | \`weave design [docs]\` | Analyze requirements and create phase plan (auto-splits oversized plans) |
  | \`weave craft [id]\` | Prepare execution context for a phase |
  | \`weave status\` | View progress |
  | \`weave worktree ...\` | Manage git worktrees for parallel work |
  | \`weave verify\` | Run build/test verification for current worktree |
  | \`weave repair\` | Scan and auto-repair corrupted plan YAML files |
  | \`weave troubleshoot [error]\` | Search global knowledge for solutions |
  | \`weave record [solution]\` | Record a new solution |
  | \`weave help\` | Show this help |

### Key Features

- **Mask Auto-Selection**: Automatically applies expert masks for phase execution
- **Global Knowledge Sharing**: Cross-project troubleshooting experience
- **Auto-Verification**: Build + Self-Verify Loop
- **YAML Auto-Repair**: Automatically detects and fixes corrupted plan files

### Quick Start

\`\`\`
weave init                                               # Initialize weave + probe GDC
weave prepare docs/                                      # Research + spec + plan
weave refine-plan                                        # Apply plan-notes directives (optional)
weave approve-plan                                       # Explicit approval gate
weave flow                                               # One-shot: prepare/approve/craft/verify/finalize
weave craft                                              # Prepare current phase execution context
\`\`\`
`;
}

type PlanGateCheck = {
    label: string;
    passed: boolean;
};

function evaluatePlanGate(phase: {
    id: string;
    doneWhen?: string;
    estimatedHours?: number;
    tasks: Array<{ name: string; testCase?: string }>;
}): {
    nonTrivial: boolean;
    passed: boolean;
    checks: PlanGateCheck[];
    failedLabels: string[];
} {
    const tasks = phase.tasks || [];
    const nonTrivial = tasks.length >= 3 || (phase.estimatedHours || 0) >= 4;

    const taskText = tasks
        .map(task => `${task.name} ${task.testCase || ''}`.toLowerCase())
        .join('\n');

    const checks: PlanGateCheck[] = [
        {
            label: nonTrivial
                ? 'Plan granularity (>=3 executable items for non-trivial work)'
                : 'Plan granularity (>=1 executable item)',
            passed: tasks.length >= (nonTrivial ? 3 : 1),
        },
        {
            label: 'Test coverage exists',
            passed: /\btest\b|테스트/.test(taskText),
        },
        {
            label: 'Verification/build coverage exists',
            passed: /\bverify\b|검증|\bbuild\b|\btypecheck\b/.test(taskText),
        },
        {
            label: 'Phase done_when exists',
            passed: typeof phase.doneWhen === 'string' && phase.doneWhen.trim().length > 0,
        },
    ];

    const failedLabels = checks.filter(check => !check.passed).map(check => check.label);
    return {
        nonTrivial,
        passed: failedLabels.length === 0,
        checks,
        failedLabels,
    };
}

async function syncWorkflowArtifacts(
    basePath: string,
    manager: ReturnType<typeof getPhaseManager>,
    options: {
        phaseId?: string;
        reviewLines?: string[];
        contextPaths?: string[];
    }
): Promise<void> {
    try {
        const plan = await manager.loadPlan();
        if (!plan) return;

        const tasksDir = path.join(basePath, 'tasks');
        await mkdir(tasksDir, { recursive: true });

        const todoPath = path.join(tasksDir, 'todo.md');
        const lines: string[] = [];
        const currentPhaseId = options.phaseId
            || plan.currentPhase
            || plan.phases.find(phase => phase.status === 'in_progress')?.id
            || plan.phases.find(phase => phase.status !== 'completed')?.id;

        lines.push('# Todo');
        lines.push('');
        lines.push(`- Updated: ${new Date().toISOString()}`);
        lines.push(`- Plan: \`${plan.planName || 'active-plan'}\``);
        lines.push(`- Focus phase: \`${currentPhaseId || 'none'}\``);
        lines.push('');
        lines.push('## Checklist');
        lines.push('');

        for (const phase of plan.phases) {
            const phaseDone = phase.status === 'completed';
            lines.push(`- [${phaseDone ? 'x' : ' '}] ${phase.id} ${phase.name} (${phase.status})`);
        }

        lines.push('');
        lines.push('## Review');
        lines.push('');
        const reviewLines = options.reviewLines && options.reviewLines.length > 0
            ? options.reviewLines
            : ['Pending'];
        for (const reviewLine of reviewLines) {
            lines.push(`- ${reviewLine}`);
        }

        if (options.contextPaths && options.contextPaths.length > 0) {
            lines.push('');
            lines.push('## GDC Context');
            lines.push('');
            for (const contextPath of options.contextPaths.slice(0, 40)) {
                lines.push(`- \`${contextPath}\``);
            }
        }

        await writeFile(todoPath, `${lines.join('\n')}\n`, 'utf-8');
    } catch {
        // Non-fatal: artifact sync should never break workflow execution.
    }
}

function sanitizeLessonText(input: string, maxLength = 240): string {
    return input
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, maxLength);
}

async function appendWorkflowLesson(
    basePath: string,
    lesson: {
        trigger: string;
        pattern: string;
        rule: string;
    }
): Promise<void> {
    try {
        const tasksDir = path.join(basePath, 'tasks');
        await mkdir(tasksDir, { recursive: true });

        const lessonsPath = path.join(tasksDir, 'lessons.md');
        let current = '';
        try {
            current = await readFile(lessonsPath, 'utf-8');
        } catch {
            current = [
                '# Lessons',
                '',
                '## Rules',
                '- Re-plan when implementation repeatedly stalls or fails.',
                '- Verify behavior before marking a phase complete.',
                '- Capture failure patterns as explicit prevention rules.',
                '',
            ].join('\n');
        }

        const stamp = new Date().toISOString();
        const entry = [
            `## ${stamp}`,
            `- Trigger: ${sanitizeLessonText(lesson.trigger)}`,
            `- Pattern: ${sanitizeLessonText(lesson.pattern)}`,
            `- Rule: ${sanitizeLessonText(lesson.rule)}`,
            '',
        ].join('\n');

        await writeFile(lessonsPath, `${current.trimEnd()}\n\n${entry}`, 'utf-8');
    } catch {
        // Non-fatal: lesson capture should not block workflow execution.
    }
}

function resolveUnderBase(basePath: string, inputPath: string): string {
    if (path.isAbsolute(inputPath)) return inputPath;
    return path.join(basePath, inputPath);
}

function toKebabCase(input: string): string {
    return input
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');
}

function normalizePlanName(
    explicitPlanName: string | undefined,
    projectName: string | undefined,
    docsAbsPath: string
): string {
    const direct = explicitPlanName ? toKebabCase(explicitPlanName) : '';
    if (direct) return direct;

    const fromProject = projectName ? toKebabCase(projectName) : '';
    if (fromProject) return fromProject;

    const fromDocs = toKebabCase(path.basename(docsAbsPath));
    return fromDocs || 'weave-plan';
}

