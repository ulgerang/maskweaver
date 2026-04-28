/**
 * Weave Tool for OpenCode Plugin
 * 
 * Integrates Weave workflow into OpenCode as a tool.
 * Commands: design, craft, status
 */

import { z } from 'zod';
// Inline shim: tool() is just an identity function in @opencode-ai/plugin
const tool = <T>(input: T): T => input;

import { createHash } from 'node:crypto';
import * as os from 'node:os';
import * as path from 'node:path';
import * as fs from 'node:fs';
import { mkdir, readdir, readFile, unlink, writeFile } from 'node:fs/promises';
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';

import { VERSION } from '../../version.js';
import * as sharedContext from '../../shared-context/index.js';
import { intake } from '../../weave/stages/intake.js';
import { writeResearchReport } from '../../weave/stages/research.js';
import { refinePlanFromNotes } from '../../weave/stages/refine.js';
import { spec as createSpec } from '../../weave/stages/spec.js';
import { plan } from '../../weave/stages/plan.js';
import { preparePhaseExecution, formatExecutionPlan, runAIVerification, generateVerificationReport } from '../../weave/stages/execute.js';
import { archiveChange } from '../../weave/stages/archive.js';
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
import { ensureChangeArtifact, readChangeMetadata, writeChangeVerificationReport } from '../../weave/change-artifacts.js';
import type { WeavePhase, WeavePlan } from '../../weave/types.js';
import { analyzeParallelOpportunities, executionPlanToSquadTasks } from '../../weave/bridge.js';
import {
    acquireLoopOperatorLock,
    appendLoopEvent,
    createLoopRun,
    ensureLoopContract,
    listLoopRuns,
    readLoopRun,
    releaseLoopOperatorLock,
    refreshLoopOperatorLock,
    requestLoopStop,
    toLoopOperatorStatePath,
    resolveLoopId,
    toLoopRunPath,
    updateLoopRun,
    writeLoopOperatorState,
    writeLoopAttemptControllerNotes,
    writeLoopAttemptTaskBundle,
    writeLoopAttemptWorkerBrief,
    writeLoopAttemptVerificationReport,
} from '../../weave/loop.js';
import {
    getEffectiveGdcConfig,
    runGdcMachineCommand,
    countGdcCheckIssues,
    getStatsNodeSummary,
} from '../../weave/gdc.js';
import {
    generatePoolAgentFilesFromConfig,
    writeDefaultRuntimeConfig,
    writeDefaultPluginConfig,
} from '../../shared/generate-agents.js';

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
- approve-plan: Approve the plan, or finalize a crafted phase when phaseId is provided
- flow [docsPath]: One-command path (prepare -> auto-approve -> craft -> verify -> finalize)
- craft [phaseId]: Prepare execution context for a phase (phase auto-select if omitted)
- status: View overall progress
- worktree: Manage git worktrees for parallel work
- verify: Run build/test verification for current worktree
- archive: Archive the verified active change artifact
- loop-run: Run a bounded loop for the active change until verify passes or the run blocks
- loop-start: Create a loop run without executing it
- loop-status: Inspect a loop run by loopId
- loop-stop: Request a semantic stop for a loop run
- loop-list: List known loop runs
- loop-sync: Sync delegated squad results back into a loop run
- loop-watchdog: Poll loop delegation sessions and auto-sync completed runs
- loop-poll: Bounded wait loop that watches delegated work and resumes automatically
- loop-operator: Recurring operator run for delegated loops (automation-friendly)
- troubleshoot [error]: Search global knowledge for solutions
- record [solution]: Record a troubleshooting solution
- repair: Scan and auto-repair corrupted plan YAML files
- sync-agents: Force regenerate dummy-human agent .md files from maskweaver.config.json pool (reads project config first, falls back to ~/.config/opencode/maskweaver.config.json)
- init-config: Create default maskweaver.config.json with pool template (does not overwrite existing)

Examples:
- weave init
- weave research docs/
- weave design docs/
- weave refine-plan
- weave approve-plan
- weave craft P1
- weave loop-run
- weave loop-status loopId="docs-p1-loop-r1"
- weave status
- weave repair
- weave sync-agents
- weave init-config
- weave troubleshoot "Cannot find module 'xyz'"`,

        args: {
            command: z.enum(['init', 'research', 'spec', 'design', 'prepare', 'refine-plan', 'approve-plan', 'flow', 'craft', 'status', 'worktree', 'verify', 'archive', 'loop-run', 'loop-start', 'loop-step', 'loop-status', 'loop-stop', 'loop-list', 'loop-sync', 'loop-watchdog', 'loop-poll', 'loop-operator', 'troubleshoot', 'record', 'help', 'repair', 'sync-agents', 'init-config'])
                .describe('Weave command to execute'),
            docsPath: z.string().optional()
                .describe('Path to requirements documents (for design command)'),
            phaseId: z.string().optional()
                .describe('Phase ID (used by craft and approve-plan finalize flow)'),
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
            loopId: z.string().optional()
                .describe('Readable loop run identifier (for loop commands)'),
            maxIterations: z.number().int().min(1).max(20).optional()
                .describe('Maximum loop iterations before blocking (default: 1 for manual loop slices)'),
            maxNoProgress: z.number().int().min(0).max(10).optional()
                .describe('Maximum repeated no-progress failures before blocking (default: 1)'),
            pollIntervalMs: z.number().int().min(10).max(60000).optional()
                .describe('Polling interval for loop-poll/watchdog-style commands (default: 1000ms)'),
            pollCycles: z.number().int().min(1).max(1000).optional()
                .describe('Maximum polling cycles for loop-poll (default: 30)'),
        },

        execute: async (
            args: {
                command: 'init' | 'research' | 'spec' | 'design' | 'prepare' | 'refine-plan' | 'approve-plan' | 'flow' | 'craft' | 'status' | 'worktree' | 'verify' | 'archive' | 'loop-run' | 'loop-start' | 'loop-step' | 'loop-status' | 'loop-stop' | 'loop-list' | 'loop-sync' | 'loop-watchdog' | 'loop-poll' | 'loop-operator' | 'troubleshoot' | 'record' | 'help' | 'repair' | 'sync-agents' | 'init-config';
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
                loopId?: string;
                maxIterations?: number;
                maxNoProgress?: number;
                pollIntervalMs?: number;
                pollCycles?: number;
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

                    case 'archive':
                        return await handleArchive(basePath);

                    case 'loop-run':
                        return await handleLoopRun(args, basePath);

                    case 'loop-start':
                        return await handleLoopStart(args, basePath);

                    case 'loop-step':
                        return await handleLoopStep(args, basePath);

                    case 'loop-status':
                        return await handleLoopStatus(args, basePath);

                    case 'loop-stop':
                        return await handleLoopStop(args, basePath);

                    case 'loop-list':
                        return await handleLoopList(basePath);

                    case 'loop-sync':
                        return await handleLoopSync(args, basePath);

                    case 'loop-watchdog':
                        return await handleLoopWatchdog(args, basePath);

                    case 'loop-poll':
                        return await handleLoopPoll(args, basePath);

                    case 'loop-operator':
                        return await handleLoopOperator(args, basePath);

                    case 'troubleshoot':
                        return await handleTroubleshoot(args);

                    case 'record':
                        return await handleRecord(args);

                    case 'repair':
                        return await handleRepair(basePath);

                    case 'sync-agents':
                        return await handleSyncAgents(basePath);

                    case 'init-config':
                        return await handleInitConfig(basePath);

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

function deriveChangeId(plan: Pick<WeavePlan, 'activeChangeId' | 'planName' | 'projectName'>): string {
    const preferred = plan.activeChangeId || plan.planName || plan.projectName;
    return toKebabCase(preferred || 'weave-change') || 'weave-change';
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

async function ensureActivePlanChangeArtifact(basePath: string): Promise<{ changeId: string; metadataPath: string } | null> {
    const manager = getPhaseManager(basePath);
    const activePlan = await manager.loadPlan();
    if (!activePlan) return null;

    const changeId = deriveChangeId(activePlan);
    activePlan.activeChangeId = changeId;
    activePlan.changeIds = Array.from(new Set([...(activePlan.changeIds || []), changeId]));
    await manager.savePlan(activePlan);

    await ensureChangeArtifact({
        basePath,
        changeId,
        planName: activePlan.planName || changeId,
        projectName: activePlan.projectName,
    });

    return {
        changeId,
        metadataPath: `.opencode/weave/changes/${changeId}/metadata.yaml`,
    };
}

async function resolveLoopContext(
    basePath: string,
    requestedPhaseId?: string
): Promise<{ plan: WeavePlan; changeId: string; phaseId: string } | { error: string }> {
    const manager = getPhaseManager(basePath);
    const plan = await manager.loadPlan();
    if (!plan) {
        return { error: 'Error: No active plan. Run `weave prepare docs/` first.' };
    }
    if (!plan.planApproved) {
        return { error: formatPlanApprovalRequired(basePath, plan) };
    }

    const phaseId = requestedPhaseId
        || plan.currentPhase
        || plan.phases.find(phase => phase.status === 'in_progress')?.id
        || plan.phases.find(phase => phase.status !== 'completed')?.id;
    if (!phaseId) {
        return { error: 'Error: No phase found for loop execution.' };
    }

    const phase = plan.phases.find(item => item.id === phaseId);
    if (!phase) {
        return { error: `Error: Phase not found: ${phaseId}` };
    }

    const changeId = deriveChangeId(plan);
    plan.activeChangeId = changeId;
    plan.changeIds = Array.from(new Set([...(plan.changeIds || []), changeId]));
    await manager.savePlan(plan);
    await ensureChangeArtifact({
        basePath,
        changeId,
        planName: plan.planName || changeId,
        projectName: plan.projectName,
    });

    return { plan, changeId, phaseId };
}

type VerificationExecution = {
    report: string;
    passed: boolean;
    noCommands: boolean;
    failedAt?: string;
    gdcApplied: boolean;
};

async function executeVerification(
    args: { projectType?: string; verifyMode?: 'quick' | 'full' },
    basePath: string
): Promise<VerificationExecution> {
    const projectType = args.projectType || 'unknown';
    const mode = args.verifyMode || 'full';
    const gdcGate = await runGdcVerifyGate(basePath);
    const sections: string[] = [];
    if (gdcGate.applied && gdcGate.report) {
        sections.push(gdcGate.report);
    }
    if (!gdcGate.passed) {
        sections.push(`❌ Verification failed at: ${gdcGate.failedAt || 'GDC Gate'}`);
        return {
            report: sections.join('\n\n'),
            passed: false,
            noCommands: false,
            failedAt: gdcGate.failedAt || 'GDC Gate',
            gdcApplied: gdcGate.applied,
        };
    }

    const verification = await runAIVerification({
        projectType,
        projectPath: basePath,
        enablePlaywright: false,
        enableScreenshots: false,
        mode,
    });

    sections.push(generateVerificationReport(verification.results));

    if (verification.results.length === 0) {
        sections.push([
            '',
            '> No verification commands detected for this project.',
            '> Provide scripts/tools (package.json, go.mod, Cargo.toml, pyproject.toml, *.sln) or pass projectType hint.',
        ].join('\n'));
        return {
            report: sections.join('\n\n'),
            passed: false,
            noCommands: true,
            failedAt: undefined,
            gdcApplied: gdcGate.applied,
        };
    }

    if (!verification.passed) {
        sections.push([
            '',
            `❌ Verification failed at: ${verification.failedAt || 'unknown'}`,
        ].join('\n'));
        return {
            report: sections.join('\n\n'),
            passed: false,
            noCommands: false,
            failedAt: verification.failedAt || 'unknown',
            gdcApplied: gdcGate.applied,
        };
    }

    sections.push([
        '',
        '✅ Verification passed.',
    ].join('\n'));
    return {
        report: sections.join('\n\n'),
        passed: true,
        noCommands: false,
        failedAt: undefined,
        gdcApplied: gdcGate.applied,
    };
}

function formatLoopStatus(run: {
    loopId: string;
    changeId: string;
    phaseId: string;
    status: string;
    iterationCount: number;
    maxIterations: number;
    noProgressCount?: number;
    maxNoProgress?: number;
    lastVerifierResult?: string;
    lastFailureSummary?: string;
    latestWorkerBriefPath?: string;
    collaborationSessionId?: string;
    latestSquadId?: string;
    latestTaskBundlePath?: string;
    verifyMode?: string;
}): string {
    return [
        `Loop ID: \`${run.loopId}\``,
        `Change ID: \`${run.changeId}\``,
        `Phase ID: \`${run.phaseId}\``,
        `Status: ${run.status}`,
        `Iterations: ${run.iterationCount}/${run.maxIterations}`,
        typeof run.noProgressCount === 'number' && typeof run.maxNoProgress === 'number'
            ? `No progress: ${run.noProgressCount}/${run.maxNoProgress}`
            : '',
        run.lastVerifierResult ? `Last verifier result: ${run.lastVerifierResult}` : '',
        run.lastFailureSummary ? `Last failure: ${run.lastFailureSummary}` : '',
        run.latestWorkerBriefPath ? `Latest worker brief: \`${run.latestWorkerBriefPath}\`` : '',
        run.collaborationSessionId ? `Delegation session: \`${run.collaborationSessionId}\`` : '',
        run.latestSquadId ? `Latest squad: \`${run.latestSquadId}\`` : '',
        run.latestTaskBundlePath ? `Latest task bundle: \`${run.latestTaskBundlePath}\`` : '',
        run.verifyMode ? `Verify mode: ${run.verifyMode}` : '',
        `Run artifact: \`${toLoopRunPath(run.loopId)}\``,
    ].filter(Boolean).join('\n');
}

async function ensureLoopDelegationSession(
    basePath: string,
    run: {
        loopId: string;
        changeId: string;
        phaseId: string;
        collaborationSessionId?: string;
    }
): Promise<sharedContext.Session> {
    const storage = new sharedContext.FileStorageAdapter(path.join(basePath, '.opencode'));
    if (run.collaborationSessionId) {
        const existing = await sharedContext.loadSession(storage, run.collaborationSessionId);
        if (existing) {
            return existing;
        }
    }

    return sharedContext.createSession(storage, {
        goal: `Weave loop ${run.loopId}: ${run.changeId}/${run.phaseId}`,
        createdBy: 'weave-loop-controller',
    });
}

async function executeLoopAttempt(
    args: {
        loopId: string;
        projectType?: string;
        verifyMode?: 'quick' | 'full';
    },
    basePath: string
): Promise<string> {
    const run = await readLoopRun(basePath, args.loopId);
    if (!run) {
        return `Error: Loop not found: ${args.loopId}`;
    }

    if (run.status === 'verified' || run.status === 'failed' || run.status === 'blocked') {
        return formatLoopStatus(run);
    }

    if (run.status === 'stopping') {
        const stopped = await updateLoopRun(basePath, run.loopId, current => ({
            ...current,
            status: 'stopped',
            stoppedAt: current.stoppedAt || new Date().toISOString(),
        }));
        if (!stopped) {
            return `Error: Loop not found: ${args.loopId}`;
        }
        await appendLoopEvent(basePath, run.loopId, {
            type: 'loop_stopped',
            at: stopped.updatedAt,
            reason: stopped.stopReason || 'manual stop requested',
        });
        return [
            formatLoopStatus(stopped),
            '',
            `Stop reason: ${stopped.stopReason || 'manual stop requested'}`,
        ].join('\n');
    }

    const attemptNumber = run.iterationCount + 1;
    const attemptId = `attempt-${String(attemptNumber).padStart(3, '0')}`;

    await appendLoopEvent(basePath, run.loopId, {
        type: 'attempt_started',
        at: new Date().toISOString(),
        attemptId,
    });

    const craftOutput = await handleCraft({
        phaseId: run.phaseId,
        projectType: args.projectType,
    }, basePath);
    if (craftOutput.startsWith('Error:') || craftOutput.startsWith('Plan approval required')) {
        const blocked = await updateLoopRun(basePath, run.loopId, current => ({
            ...current,
            status: 'blocked',
            iterationCount: attemptNumber,
            lastAttemptId: attemptId,
            lastVerifierResult: 'fail',
            stopReason: craftOutput.split('\n')[0],
        }));
        if (!blocked) {
            return craftOutput;
        }
        await appendLoopEvent(basePath, run.loopId, {
            type: 'attempt_blocked',
            at: blocked.updatedAt,
            attemptId,
            reason: blocked.stopReason,
        });
        return [
            formatLoopStatus(blocked),
            '',
            craftOutput,
        ].join('\n');
    }

    const verification = await executeVerification({
        projectType: args.projectType,
        verifyMode: args.verifyMode || run.verifyMode,
    }, basePath);
    const attemptReportPath = await writeLoopAttemptVerificationReport({
        basePath,
        changeId: run.changeId,
        loopId: run.loopId,
        iteration: attemptNumber,
        reportMarkdown: verification.report,
        passed: verification.passed,
    });
    await writeChangeVerificationReport({
        basePath,
        changeId: run.changeId,
        reportMarkdown: verification.report,
        passed: verification.passed,
    });

    if (verification.passed) {
        const verified = await updateLoopRun(basePath, run.loopId, current => ({
            ...current,
            status: 'verified',
            iterationCount: attemptNumber,
            noProgressCount: 0,
            lastAttemptId: attemptId,
            lastVerifierResult: 'pass',
            lastFailureFingerprint: undefined,
            lastFailureSummary: undefined,
            latestWorkerBriefPath: undefined,
            verifyMode: args.verifyMode || current.verifyMode,
        }));
        if (!verified) {
            return `Error: Loop not found: ${args.loopId}`;
        }

        await appendLoopEvent(basePath, run.loopId, {
            type: 'attempt_passed',
            at: verified.updatedAt,
            attemptId,
            reportPath: attemptReportPath,
        });

        const finalizeOutput = await handleApprove({
            phaseId: run.phaseId,
            skipVerify: true,
            source: 'command',
        }, basePath);

        return [
            formatLoopStatus(verified),
            `Attempt report: \`${attemptReportPath}\``,
            '',
            verification.report,
            '',
            finalizeOutput,
        ].join('\n');
    }

    const failureSummary = verification.noCommands
        ? 'No verification commands detected.'
        : `Verification failed at ${verification.failedAt || 'verification'}.`;
    const failureFingerprint = createHash('sha1')
        .update(verification.noCommands ? 'no-commands' : (verification.failedAt || 'verification'))
        .digest('hex')
        .slice(0, 12);
    const noProgressCount = run.lastFailureFingerprint === failureFingerprint
        ? run.noProgressCount + 1
        : 0;

    const manager = getPhaseManager(basePath);
    const activePlan = await manager.loadPlan();
    const phase = activePlan?.phases.find(item => item.id === run.phaseId);
    const focusFiles = Array.from(new Set((phase?.tasks || []).flatMap(task => task.files || []))).slice(0, 6);
    const nextActionLines = [
        `Fix the failing verifier target: ${verification.failedAt || 'verification'}.`,
        focusFiles.length > 0
            ? `Focus files: ${focusFiles.map(file => `\`${file}\``).join(', ')}`
            : `Focus phase: ${run.phaseId}. Review the crafted execution plan and touched files.`,
        `Re-run: weave command=loop-step loopId="${run.loopId}"`,
    ];
    const controllerNotes = await writeLoopAttemptControllerNotes({
        basePath,
        changeId: run.changeId,
        loopId: run.loopId,
        iteration: attemptNumber,
        failureSummary,
        noProgressCount,
        maxNoProgress: run.maxNoProgress,
        nextActionLines,
    });
    const workerBriefPath = await writeLoopAttemptWorkerBrief({
        basePath,
        changeId: run.changeId,
        loopId: run.loopId,
        iteration: attemptNumber,
        briefMarkdown: [
            '# Worker Brief',
            '',
            `- Loop ID: \`${run.loopId}\``,
            `- Phase ID: \`${run.phaseId}\``,
            `- Attempt: \`${attemptId}\``,
            '',
            '## Current Failure',
            '',
            `- ${failureSummary}`,
            '',
            '## Next Action',
            '',
            ...nextActionLines.map(line => `- ${line}`),
            '',
            '## Execution Context',
            '',
            craftOutput.trim(),
            '',
        ].join('\n'),
    });
    const { plan: delegationPlan } = await preparePhaseExecution({
        phaseId: run.phaseId,
        projectType: args.projectType,
        onEvent: () => undefined,
        basePath,
    });
    const squadTasks = executionPlanToSquadTasks(delegationPlan);
    const parallelAnalysis = analyzeParallelOpportunities(delegationPlan);
    const delegationSession = await ensureLoopDelegationSession(basePath, run);
    const { spec: delegationSquad } = await sharedContext.createSquad(delegationSession, {
        mission: `Weave loop ${run.loopId} ${attemptId}`,
        operator: 'weave-loop-operator',
        scope: focusFiles.length > 0 ? { files: focusFiles } : undefined,
        constraints: {
            maxWorkers: Math.max(1, Math.min(squadTasks.length || 1, 4)),
        },
    });
    const dependencyMap = new Map<string, string>();
    const assignedTasks: Array<{
        weaveTaskId: string;
        taskId: string;
        assignee: string;
        priority: string;
        dependencies: string[];
    }> = [];
    for (const squadTask of squadTasks) {
        const mappedDependencies = (squadTask.dependencies || [])
            .map(dependency => dependencyMap.get(dependency))
            .filter((dependency): dependency is string => Boolean(dependency));
        const assignedTask = await sharedContext.assignTask(delegationSession, delegationSquad.squadId, {
            assignee: squadTask.assignee,
            description: `[${run.loopId} ${attemptId}] ${squadTask.description}\nbrief: ${workerBriefPath}`,
            priority: squadTask.priority,
            dependencies: mappedDependencies.length > 0 ? mappedDependencies : undefined,
        });
        dependencyMap.set(squadTask.taskId, assignedTask.taskId);
        assignedTasks.push({
            weaveTaskId: squadTask.taskId,
            taskId: assignedTask.taskId,
            assignee: assignedTask.assignee,
            priority: assignedTask.priority,
            dependencies: assignedTask.dependencies || [],
        });
    }
    const taskBundlePath = await writeLoopAttemptTaskBundle({
        basePath,
        changeId: run.changeId,
        loopId: run.loopId,
        iteration: attemptNumber,
        bundle: {
            loopId: run.loopId,
            phaseId: run.phaseId,
            attemptId,
            briefPath: workerBriefPath,
            sessionId: delegationSession.manifest.sessionId,
            squadId: delegationSquad.squadId,
            tasks: delegationPlan.taskPlans.map(taskPlan => ({
                taskId: taskPlan.task.id,
                name: taskPlan.task.name,
                assignee: taskPlan.agentTier,
                mask: taskPlan.mask,
                complexity: taskPlan.complexity,
                dependencies: taskPlan.task.dependsOn || [],
                files: taskPlan.task.files || [],
                briefPath: workerBriefPath,
            })),
            squadTasks,
            assignedTasks,
            parallel: {
                totalWaves: parallelAnalysis.totalWaves,
                parallelismFactor: parallelAnalysis.parallelismFactor,
                criticalPath: parallelAnalysis.criticalPath,
            },
        },
    });

    const noProgressExceeded = noProgressCount >= run.maxNoProgress && !verification.noCommands;
    const nextStatus = verification.noCommands || noProgressExceeded || attemptNumber >= run.maxIterations
        ? 'blocked'
        : 'running';
    const stopReason = nextStatus === 'blocked'
        ? verification.noCommands
            ? 'No verification commands detected.'
            : noProgressExceeded
                ? `No-progress budget exhausted at ${verification.failedAt || 'verification'}.`
                : `Retry budget exhausted at ${verification.failedAt || 'verification'}.`
        : run.stopReason;
    const next = await updateLoopRun(basePath, run.loopId, current => ({
        ...current,
        status: nextStatus,
        iterationCount: attemptNumber,
        noProgressCount,
        lastAttemptId: attemptId,
        lastVerifierResult: 'fail',
        lastFailureFingerprint: failureFingerprint,
        lastFailureSummary: failureSummary,
        latestWorkerBriefPath: workerBriefPath,
        collaborationSessionId: delegationSession.manifest.sessionId,
        latestSquadId: delegationSquad.squadId,
        latestTaskBundlePath: taskBundlePath,
        verifyMode: args.verifyMode || current.verifyMode,
        stopReason,
    }));
    if (!next) {
        return `Error: Loop not found: ${args.loopId}`;
    }

    await appendLoopEvent(basePath, run.loopId, {
        type: 'attempt_failed',
        at: next.updatedAt,
        attemptId,
        reportPath: attemptReportPath,
        summaryPath: controllerNotes.summaryPath,
        nextActionPath: controllerNotes.nextActionPath,
        workerBriefPath,
        taskBundlePath,
        sessionId: delegationSession.manifest.sessionId,
        squadId: delegationSquad.squadId,
        assignedTaskIds: assignedTasks.map(task => task.taskId),
        failedAt: verification.failedAt || 'verification',
        status: next.status,
        noProgressCount,
    });

    return [
        formatLoopStatus(next),
        `Attempt report: \`${attemptReportPath}\``,
        `Attempt summary: \`${controllerNotes.summaryPath}\``,
        `Next action: \`${controllerNotes.nextActionPath}\``,
        `Worker brief: \`${workerBriefPath}\``,
        `Task bundle: \`${taskBundlePath}\``,
        next.stopReason ? `Reason: ${next.stopReason}` : '',
        '',
        verification.report,
    ].filter(Boolean).join('\n');
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
    // Check global config
    const globalConfigPath = path.join(os.homedir(), '.config', 'opencode', 'maskweaver.config.json');
    if (!fs.existsSync(globalConfigPath)) {
        lines.push('');
        lines.push('### ⚠️ 글로벌 설정 파일 없음');
        lines.push('`~/.config/opencode/maskweaver.config.json` 파일이 없습니다.');
        lines.push('실행: `weave init-config` 로 기본 설정 파일을 생성하세요.');
        lines.push('또는 수동으로 생성한 후 `weave sync-agents` 를 실행하세요.');
    }

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
    args: {
        phaseId?: string;
        planReview?: string;
        notesPath?: string;
        applyNotes?: boolean;
        projectType?: string;
        skipVerify?: boolean;
        verifyMode?: 'quick' | 'full';
        commit?: boolean;
        stageAll?: boolean;
        commitMessage?: string;
    },
    basePath: string
): Promise<string> {
    const manager = getPhaseManager(basePath);
    const activePlan = await manager.loadPlan();
    if (!activePlan) {
        return 'Error: No active plan found. Run `weave prepare docs/` or `weave design docs/` first.';
    }

    if (args.phaseId) {
        const phase = activePlan.phases.find(item => item.id === args.phaseId);
        if (!phase) {
            return `Error: Phase not found: ${args.phaseId}`;
        }
        if (!activePlan.planApproved) {
            return formatPlanApprovalRequired(basePath, activePlan);
        }

        return handleApprove({
            phaseId: args.phaseId,
            projectType: args.projectType,
            skipVerify: args.skipVerify,
            verifyMode: args.verifyMode,
            commit: args.commit,
            stageAll: args.stageAll,
            commitMessage: args.commitMessage,
            source: 'command',
        }, basePath);
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
    const changeArtifact = await ensureActivePlanChangeArtifact(basePath);

    return [
        researchResult.summary,
        '',
        planResult.summary,
        ...(changeArtifact ? ['', `Change artifact: \`${changeArtifact.metadataPath}\``] : []),
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
    const changeArtifact = await ensureActivePlanChangeArtifact(basePath);

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
    if (changeArtifact) {
        lines.push('');
        lines.push(`Change artifact: \`${changeArtifact.metadataPath}\``);
    }

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
    const generatedChangeContextPaths = (executionPlan.gdcContextFiles || [])
        .filter(item => item.status === 'generated' && item.changePath)
        .map(item => item.changePath as string);
    if (generatedContextPaths.length > 0) {
        lines.push('');
        lines.push('### GDC Extract Context');
        lines.push('');
        for (const contextPath of generatedContextPaths.slice(0, 24)) {
            lines.push(`- \`${contextPath}\``);
        }
        for (const contextPath of generatedChangeContextPaths.slice(0, 24)) {
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
        contextPaths: [...generatedContextPaths, ...generatedChangeContextPaths],
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
        if (activePlan.activeChangeId) {
            const changeMetadata = await readChangeMetadata(basePath, activePlan.activeChangeId);
            lines.push(`- Active change: \`${activePlan.activeChangeId}\``);
            if (changeMetadata) {
                lines.push(`- Change status: ${changeMetadata.status}`);
                lines.push(`- Change metadata: \`.opencode/weave/changes/${activePlan.activeChangeId}/metadata.yaml\``);
            }
        }
        if (activePlan.changeIds && activePlan.changeIds.length > 0) {
            lines.push(`- Known changes: ${activePlan.changeIds.map(changeId => `\`${changeId}\``).join(', ')}`);
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
    const manager = getPhaseManager(basePath);
    const activePlan = await manager.loadPlan();
    const activeChangeId = activePlan?.activeChangeId;

    const verification = await executeVerification(args, basePath);

    if (activeChangeId) {
        await writeChangeVerificationReport({
            basePath,
            changeId: activeChangeId,
            reportMarkdown: verification.report,
            passed: verification.passed,
        });
    }

    return verification.report;
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

/**
 * Handle `sync-agents` command.
 * 
 * Reads maskweaver.config.json (project or global ~/.config/opencode/)
 * and force-overwrites all dummy-human agent .md files in .opencode/agents/.
 * 
 * Search order:
 * 1. {projectDir}/maskweaver.config.json
 * 2. {projectDir}/.opencode/maskweaver.config.json
 * 3. ~/.config/opencode/maskweaver.config.json (user global)
 */
async function handleSyncAgents(basePath: string): Promise<string> {
    const agentsDir = path.join(basePath, '.opencode', 'agents');
    const result = generatePoolAgentFilesFromConfig(basePath, agentsDir, { force: true });

    const lines: string[] = [];
    lines.push('## 🔄 Agent Sync Results');
    lines.push('');

    if (result.created.length > 0) {
        lines.push(`**Created:** ${result.created.length} files`);
        for (const f of result.created) {
            lines.push(`  ✅ ${toWorkspaceRelative(basePath, f)}`);
        }
    }

    if (result.updated.length > 0) {
        lines.push(`**Updated:** ${result.updated.length} files`);
        for (const f of result.updated) {
            lines.push(`  🔄 ${toWorkspaceRelative(basePath, f)}`);
        }
    }

    if (result.skipped.length > 0) {
        lines.push(`**Skipped:** ${result.skipped.length} files`);
        for (const f of result.skipped) {
            lines.push(`  ⏭️ ${toWorkspaceRelative(basePath, f)}`);
        }
    }

    if (result.errors.length > 0) {
        lines.push('**Errors:**');
        for (const err of result.errors) {
            lines.push(`  ❌ ${err}`);
        }
    }

    if (result.created.length === 0 && result.updated.length === 0 && result.errors.length === 0) {
        lines.push('No changes. All agent files are up to date.');
    }

    if (result.created.length > 0 || result.updated.length > 0) {
        lines.push('');
        lines.push('> ⚠️ **Important:** You may need to restart OpenCode for the updated agent files to take effect.');
    }

    return lines.join('\n');
}

/**
 * Handle `init-config` command.
 * 
 * Creates default maskweaver.config.json (runtime config with pool template)
 * and .opencode/maskweaver.json (plugin config) if they don't exist.
 * Does NOT overwrite existing files.
 */
async function handleInitConfig(basePath: string): Promise<string> {
    const lines: string[] = [];
    lines.push('## 📝 Config Initialization');
    lines.push('');

    // Create runtime config (maskweaver.config.json)
    const runtimePath = writeDefaultRuntimeConfig(basePath);
    if (runtimePath) {
        lines.push(`✅ Created runtime config: ${toWorkspaceRelative(basePath, runtimePath)}`);
        lines.push('   Edit this file to add your model names in the dummyHumans.pool,');
        lines.push('   then run `weave sync-agents` to generate agent files.');
    } else {
        lines.push('⏭️  maskweaver.config.json already exists (skipped)');
    }

    lines.push('');

    // Create plugin config (.opencode/maskweaver.json)
    const pluginPath = writeDefaultPluginConfig(basePath);
    if (pluginPath) {
        lines.push(`✅ Created plugin config: ${toWorkspaceRelative(basePath, pluginPath)}`);
    } else {
        lines.push('⏭️  .opencode/maskweaver.json already exists (skipped)');
    }

    lines.push('');
    lines.push('> 💡 Tip: You can also set up a global config at `~/.config/opencode/maskweaver.config.json`');
    lines.push('>   with your model pool, then run `weave sync-agents` in any project to apply it.');

    return lines.join('\n');
}

async function handleArchive(basePath: string): Promise<string> {
    const manager = getPhaseManager(basePath);
    const activePlan = await manager.loadPlan();
    const activeChangeId = activePlan?.activeChangeId;

    if (!activeChangeId) {
        return 'Error: No active change found. Run `weave prepare` first.';
    }

    const result = await archiveChange({
        basePath,
        changeId: activeChangeId,
        summaryLines: [
            `Archived from plan \`${activePlan?.planName || 'active-plan'}\`.`,
            'Canonical spec sync is pending implementation.',
        ],
    });

    if (!result.ok) {
        return `Error: ${result.reason || `Failed to archive change: ${activeChangeId}`}`;
    }

    const status = result.alreadyArchived ? 'already archived' : 'archived';
    return [
        `Change ${status}: \`${activeChangeId}\``,
        result.archivePath ? `Archive report: \`${result.archivePath}\`` : '',
    ].filter(Boolean).join('\n');
}

async function handleLoopStart(
    args: {
        phaseId?: string;
        projectType?: string;
        verifyMode?: 'quick' | 'full';
        loopId?: string;
        maxIterations?: number;
        maxNoProgress?: number;
    },
    basePath: string
): Promise<string> {
    const context = await resolveLoopContext(basePath, args.phaseId);
    if ('error' in context) {
        return context.error;
    }

    const loopId = await resolveLoopId({
        basePath,
        changeId: context.changeId,
        phaseId: context.phaseId.toLowerCase(),
        loopId: args.loopId,
    });
    const maxIterations = args.maxIterations || 1;
    const maxNoProgress = args.maxNoProgress ?? 1;

    const run = await createLoopRun({
        basePath,
        loopId,
        changeId: context.changeId,
        phaseId: context.phaseId,
        verifyMode: args.verifyMode || 'quick',
        maxIterations,
        maxNoProgress,
        status: 'running',
    });
    const contractPath = await ensureLoopContract({
        basePath,
        changeId: context.changeId,
        loopId,
        phaseId: context.phaseId,
        maxIterations,
        maxNoProgress,
    });

    return [
        formatLoopStatus(run),
        `Loop contract: \`${contractPath}\``,
    ].join('\n');
}

async function handleLoopStep(
    args: {
        loopId?: string;
        projectType?: string;
        verifyMode?: 'quick' | 'full';
    },
    basePath: string
): Promise<string> {
    if (!args.loopId) {
        return 'Error: loopId is required. Use `weave command=loop-list` to inspect runs.';
    }

    return executeLoopAttempt({
        loopId: args.loopId,
        projectType: args.projectType,
        verifyMode: args.verifyMode,
    }, basePath);
}

async function handleLoopRun(
    args: {
        phaseId?: string;
        projectType?: string;
        verifyMode?: 'quick' | 'full';
        loopId?: string;
        maxIterations?: number;
        maxNoProgress?: number;
    },
    basePath: string
): Promise<string> {
    const context = await resolveLoopContext(basePath, args.phaseId);
    if ('error' in context) {
        return context.error;
    }

    const loopId = await resolveLoopId({
        basePath,
        changeId: context.changeId,
        phaseId: context.phaseId.toLowerCase(),
        loopId: args.loopId,
    });
    const maxIterations = args.maxIterations || 1;
    const maxNoProgress = args.maxNoProgress ?? 1;

    const run = await createLoopRun({
        basePath,
        loopId,
        changeId: context.changeId,
        phaseId: context.phaseId,
        verifyMode: args.verifyMode || 'quick',
        maxIterations,
        maxNoProgress,
        status: 'running',
    });
    await ensureLoopContract({
        basePath,
        changeId: context.changeId,
        loopId,
        phaseId: context.phaseId,
        maxIterations,
        maxNoProgress,
    });

    let latestOutput = formatLoopStatus(run);

    for (let index = 0; index < maxIterations; index += 1) {
        latestOutput = await handleLoopStep({
            loopId,
            projectType: args.projectType,
            verifyMode: args.verifyMode || 'quick',
        }, basePath);

        const run = await readLoopRun(basePath, loopId);
        if (!run || ['verified', 'blocked', 'failed', 'stopped'].includes(run.status)) {
            break;
        }
    }

    return latestOutput;
}

async function handleLoopStatus(
    args: { loopId?: string },
    basePath: string
): Promise<string> {
    if (!args.loopId) {
        return 'Error: loopId is required. Use `weave command=loop-list` to inspect runs.';
    }

    const run = await readLoopRun(basePath, args.loopId);
    if (!run) {
        return `Error: Loop not found: ${args.loopId}`;
    }

    return formatLoopStatus(run);
}

async function handleLoopStop(
    args: { loopId?: string; context?: string },
    basePath: string
): Promise<string> {
    if (!args.loopId) {
        return 'Error: loopId is required. Use `weave command=loop-list` to inspect runs.';
    }

    const run = await requestLoopStop({
        basePath,
        loopId: args.loopId,
        reason: args.context,
    });
    if (!run) {
        return `Error: Loop not found: ${args.loopId}`;
    }

    return [
        `Stop requested for loop \`${args.loopId}\``,
        '',
        formatLoopStatus(run),
    ].join('\n');
}

async function handleLoopList(basePath: string): Promise<string> {
    const runs = await listLoopRuns(basePath);
    if (runs.length === 0) {
        return 'No loop runs found.';
    }

    const lines: string[] = ['## Loop Runs', ''];
    for (const run of runs) {
        lines.push(`- \`${run.loopId}\` | ${run.status} | ${run.changeId} | ${run.phaseId} | ${run.iterationCount}/${run.maxIterations}`);
    }
    return lines.join('\n');
}

type LoopSyncOutcome =
    | { kind: 'error'; output: string }
    | { kind: 'no_delegation'; output: string }
    | { kind: 'missing'; output: string }
    | { kind: 'waiting'; output: string; completedTasks: number; totalTasks: number }
    | { kind: 'failed'; output: string }
    | { kind: 'synced'; output: string };

async function syncLoopDelegation(
    args: {
        loopId: string;
        projectType?: string;
        verifyMode?: 'quick' | 'full';
    },
    basePath: string
): Promise<LoopSyncOutcome> {
    const run = await readLoopRun(basePath, args.loopId);
    if (!run) {
        return { kind: 'error', output: `Error: Loop not found: ${args.loopId}` };
    }
    if (!run.collaborationSessionId || !run.latestSquadId) {
        return {
            kind: 'no_delegation',
            output: [
                formatLoopStatus(run),
                '',
                'No delegated squad is linked to this loop run.',
            ].join('\n'),
        };
    }

    const storage = new sharedContext.FileStorageAdapter(path.join(basePath, '.opencode'));
    const session = await sharedContext.loadSession(storage, run.collaborationSessionId);
    if (!session) {
        return {
            kind: 'missing',
            output: [
                formatLoopStatus(run),
                '',
                `Delegation session not found: ${run.collaborationSessionId}`,
            ].join('\n'),
        };
    }

    const squad = await sharedContext.getSquad(session, run.latestSquadId);
    if (!squad) {
        return {
            kind: 'missing',
            output: [
                formatLoopStatus(run),
                '',
                `Delegated squad not found: ${run.latestSquadId}`,
            ].join('\n'),
        };
    }

    const totalTasks = squad.state.tasks.length;
    const completedTasks = squad.state.tasks.filter(task => task.status === 'completed').length;
    const failedTasks = squad.state.tasks.filter(task => task.status === 'failed').length;
    const activeTasks = squad.state.tasks.filter(task => task.status === 'active' || task.status === 'pending' || task.status === 'paused').length;

    const summaryLines = [
        `Delegation session: \`${run.collaborationSessionId}\``,
        `Delegated squad: \`${run.latestSquadId}\``,
        `Task status: ${completedTasks}/${totalTasks} completed, ${failedTasks} failed, ${activeTasks} active`,
    ];

    if (failedTasks > 0) {
        const blocked = await updateLoopRun(basePath, run.loopId, current => ({
            ...current,
            status: 'blocked',
            stopReason: 'Delegated squad contains failed tasks.',
        }));
        if (!blocked) {
            return { kind: 'error', output: `Error: Loop not found: ${args.loopId}` };
        }
        await appendLoopEvent(basePath, run.loopId, {
            type: 'delegation_failed',
            at: blocked.updatedAt,
            squadId: run.latestSquadId,
        });
        return {
            kind: 'failed',
            output: [
                formatLoopStatus(blocked),
                '',
                ...summaryLines,
            ].join('\n'),
        };
    }

    if (activeTasks > 0) {
        return {
            kind: 'waiting',
            completedTasks,
            totalTasks,
            output: [
                formatLoopStatus(run),
                '',
                ...summaryLines,
            ].join('\n'),
        };
    }

    const resumed = await updateLoopRun(basePath, run.loopId, current => ({
        ...current,
        status: 'running',
        noProgressCount: 0,
        stopReason: undefined,
    }));
    if (!resumed) {
        return { kind: 'error', output: `Error: Loop not found: ${args.loopId}` };
    }
    await appendLoopEvent(basePath, run.loopId, {
        type: 'delegation_completed',
        at: resumed.updatedAt,
        squadId: run.latestSquadId,
        sessionId: run.collaborationSessionId,
    });

    const resumedOutput = await executeLoopAttempt({
        loopId: run.loopId,
        projectType: args.projectType,
        verifyMode: args.verifyMode || run.verifyMode,
    }, basePath);

    return {
        kind: 'synced',
        output: [
            'Delegated work completed. Resuming loop verification.',
            '',
            ...summaryLines,
            '',
            resumedOutput,
        ].join('\n'),
    };
}

async function handleLoopSync(
    args: {
        loopId?: string;
        projectType?: string;
        verifyMode?: 'quick' | 'full';
    },
    basePath: string
): Promise<string> {
    if (!args.loopId) {
        return 'Error: loopId is required. Use `weave command=loop-list` to inspect runs.';
    }
    const result = await syncLoopDelegation({
        loopId: args.loopId,
        projectType: args.projectType,
        verifyMode: args.verifyMode,
    }, basePath);
    return result.output;
}

async function handleLoopWatchdog(
    args: {
        loopId?: string;
        projectType?: string;
        verifyMode?: 'quick' | 'full';
    },
    basePath: string
): Promise<string> {
    const runs = args.loopId
        ? [await readLoopRun(basePath, args.loopId)].filter((run): run is NonNullable<Awaited<ReturnType<typeof readLoopRun>>> => Boolean(run))
        : await listLoopRuns(basePath);

    if (runs.length === 0) {
        return args.loopId
            ? `Error: Loop not found: ${args.loopId}`
            : 'No loop runs found.';
    }

    const candidates = runs.filter(run =>
        Boolean(run.collaborationSessionId && run.latestSquadId)
        && !['verified', 'failed', 'stopped'].includes(run.status)
    );
    if (candidates.length === 0) {
        return 'No delegated loop runs require watchdog polling.';
    }

    const syncedOutputs: string[] = [];
    let waitingCount = 0;
    let failedCount = 0;

    for (const run of candidates) {
        const result = await syncLoopDelegation({
            loopId: run.loopId,
            projectType: args.projectType,
            verifyMode: args.verifyMode,
        }, basePath);
        if (result.kind === 'synced') {
            syncedOutputs.push(result.output);
        } else if (result.kind === 'waiting') {
            waitingCount += 1;
        } else if (result.kind === 'failed') {
            failedCount += 1;
            syncedOutputs.push(result.output);
        }
    }

    return [
        '## Loop Watchdog',
        '',
        `Scanned: ${candidates.length}`,
        `Synced: ${syncedOutputs.filter(output => output.startsWith('Delegated work completed')).length}`,
        `Failed: ${failedCount}`,
        `Waiting: ${waitingCount}`,
        syncedOutputs.length > 0 ? '' : '',
        ...syncedOutputs,
    ].filter(Boolean).join('\n');
}

async function handleLoopPoll(
    args: {
        loopId?: string;
        projectType?: string;
        verifyMode?: 'quick' | 'full';
        pollIntervalMs?: number;
        pollCycles?: number;
    },
    basePath: string
): Promise<string> {
    const pollIntervalMs = args.pollIntervalMs ?? 1000;
    const pollCycles = args.pollCycles ?? 30;
    let lastOutput = '';

    for (let cycle = 1; cycle <= pollCycles; cycle += 1) {
        if (args.loopId) {
            const result = await syncLoopDelegation({
                loopId: args.loopId,
                projectType: args.projectType,
                verifyMode: args.verifyMode,
            }, basePath);
            lastOutput = result.output;
            if (result.kind === 'synced' || result.kind === 'failed' || result.kind === 'error') {
                return [
                    `Loop poll completed in ${cycle} cycles.`,
                    '',
                    result.output,
                ].join('\n');
            }
        } else {
            const watchdogOutput = await handleLoopWatchdog({
                projectType: args.projectType,
                verifyMode: args.verifyMode,
            }, basePath);
            lastOutput = watchdogOutput;
            if (/Synced: [1-9]/.test(watchdogOutput) || /Failed: [1-9]/.test(watchdogOutput)) {
                return [
                    `Loop poll completed in ${cycle} cycles.`,
                    '',
                    watchdogOutput,
                ].join('\n');
            }
        }

        if (cycle < pollCycles) {
            await sleep(pollIntervalMs);
        }
    }

    return [
        `Loop poll timed out after ${pollCycles} cycles.`,
        '',
        lastOutput || 'No delegated loop runs require polling.',
    ].join('\n');
}

async function handleLoopOperator(
    args: {
        loopId?: string;
        projectType?: string;
        verifyMode?: 'quick' | 'full';
        pollIntervalMs?: number;
        pollCycles?: number;
    },
    basePath: string
): Promise<string> {
    const pollIntervalMs = args.pollIntervalMs ?? 1000;
    const pollCycles = args.pollCycles ?? 30;
    const operatorId = toKebabCase([
        'loop-operator',
        args.loopId || 'all',
        Date.now().toString(36),
    ].join('-'));
    const lock = await acquireLoopOperatorLock({
        basePath,
        operatorId,
    });
    if (!lock.acquired) {
        return [
            'Loop operator is already active.',
            lock.activeOperatorId ? `Active operator: \`${lock.activeOperatorId}\`` : '',
            lock.updatedAt ? `Updated at: ${lock.updatedAt}` : '',
            `Lock artifact: \`${toLoopOperatorStatePath()}\``,
        ].filter(Boolean).join('\n');
    }

    const startedAt = new Date().toISOString();
    let syncedCount = 0;
    let failedCount = 0;
    let waitingCount = 0;
    let lastSummary = 'No delegated loop runs were scanned yet.';
    let completedCycles = 0;
    let finalStatus: 'running' | 'idle' | 'completed' | 'timed_out' | 'blocked' = 'running';
    const outputSections: string[] = [];

    try {
        for (let cycle = 1; cycle <= pollCycles; cycle += 1) {
            completedCycles = cycle;
            await refreshLoopOperatorLock({ basePath, operatorId });

            const runs = args.loopId
                ? [await readLoopRun(basePath, args.loopId)].filter((run): run is NonNullable<Awaited<ReturnType<typeof readLoopRun>>> => Boolean(run))
                : await listLoopRuns(basePath);
            if (args.loopId && runs.length === 0) {
                finalStatus = 'blocked';
                lastSummary = `Loop not found: ${args.loopId}`;
                await writeLoopOperatorState(basePath, {
                    operatorId,
                    status: finalStatus,
                    startedAt,
                    updatedAt: new Date().toISOString(),
                    finishedAt: new Date().toISOString(),
                    targetLoopId: args.loopId,
                    pollIntervalMs,
                    pollCycles,
                    lastCycle: cycle,
                    syncedCount,
                    failedCount,
                    waitingCount,
                    lastSummary,
                });
                return `Error: Loop not found: ${args.loopId}`;
            }

            const candidates = runs.filter(run =>
                Boolean(run.collaborationSessionId && run.latestSquadId)
                && !['verified', 'failed', 'stopped'].includes(run.status)
            );

            if (candidates.length === 0) {
                finalStatus = cycle === 1 ? 'idle' : 'completed';
                lastSummary = 'No delegated loop runs require operator polling.';
                await writeLoopOperatorState(basePath, {
                    operatorId,
                    status: finalStatus,
                    startedAt,
                    updatedAt: new Date().toISOString(),
                    finishedAt: new Date().toISOString(),
                    targetLoopId: args.loopId,
                    pollIntervalMs,
                    pollCycles,
                    lastCycle: cycle,
                    syncedCount,
                    failedCount,
                    waitingCount,
                    lastSummary,
                });
                return [
                    '## Loop Operator',
                    '',
                    `Operator ID: \`${operatorId}\``,
                    `Status: ${finalStatus}`,
                    `Cycles: ${cycle}/${pollCycles}`,
                    `Synced: ${syncedCount}`,
                    `Failed: ${failedCount}`,
                    `Waiting: ${waitingCount}`,
                    `State artifact: \`${toLoopOperatorStatePath()}\``,
                    '',
                    lastSummary,
                ].join('\n');
            }

            let cycleSynced = 0;
            let cycleFailed = 0;
            let cycleWaiting = 0;
            const cycleOutputs: string[] = [];

            for (const run of candidates) {
                const result = await syncLoopDelegation({
                    loopId: run.loopId,
                    projectType: args.projectType,
                    verifyMode: args.verifyMode,
                }, basePath);

                if (result.kind === 'synced') {
                    cycleSynced += 1;
                    cycleOutputs.push(result.output);
                } else if (result.kind === 'failed') {
                    cycleFailed += 1;
                    cycleOutputs.push(result.output);
                } else if (result.kind === 'waiting') {
                    cycleWaiting += 1;
                } else if (result.kind === 'error' || result.kind === 'missing') {
                    cycleFailed += 1;
                    cycleOutputs.push(result.output);
                }
            }

            syncedCount += cycleSynced;
            failedCount += cycleFailed;
            waitingCount = cycleWaiting;
            lastSummary = `Cycle ${cycle}: synced ${cycleSynced}, failed ${cycleFailed}, waiting ${cycleWaiting}.`;
            if (cycleOutputs.length > 0) {
                outputSections.push(...cycleOutputs);
            }

            await writeLoopOperatorState(basePath, {
                operatorId,
                status: 'running',
                startedAt,
                updatedAt: new Date().toISOString(),
                targetLoopId: args.loopId,
                pollIntervalMs,
                pollCycles,
                lastCycle: cycle,
                syncedCount,
                failedCount,
                waitingCount,
                lastSummary,
            });

            if (cycleWaiting === 0) {
                finalStatus = cycleFailed > 0 ? 'blocked' : 'completed';
                break;
            }

            if (cycle < pollCycles) {
                await sleep(pollIntervalMs);
            }
        }

        if (finalStatus === 'running') {
            finalStatus = 'timed_out';
        }

        await writeLoopOperatorState(basePath, {
            operatorId,
            status: finalStatus,
            startedAt,
            updatedAt: new Date().toISOString(),
            finishedAt: new Date().toISOString(),
            targetLoopId: args.loopId,
            pollIntervalMs,
            pollCycles,
            lastCycle: completedCycles,
            syncedCount,
            failedCount,
            waitingCount,
            lastSummary,
        });

        return [
            '## Loop Operator',
            '',
            `Operator ID: \`${operatorId}\``,
            `Status: ${finalStatus}`,
            `Cycles: ${completedCycles}/${pollCycles}`,
            `Synced: ${syncedCount}`,
            `Failed: ${failedCount}`,
            `Waiting: ${waitingCount}`,
            `State artifact: \`${toLoopOperatorStatePath()}\``,
            '',
            lastSummary,
            outputSections.length > 0 ? '' : '',
            ...outputSections,
        ].filter(Boolean).join('\n');
    } finally {
        await releaseLoopOperatorLock({ basePath, operatorId });
    }
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

    await phaseManager.markAllTasksPassed(resolvedPhaseId);
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
  | \`weave approve-plan\` | Approve plan, or finalize a phase with \`phaseId\` |
  | \`weave flow [docs]\` | One-command path (prepare -> auto-approve -> craft -> verify -> finalize) |
  | \`weave design [docs]\` | Analyze requirements and create phase plan (auto-splits oversized plans) |
  | \`weave craft [id]\` | Prepare execution context for a phase |
  | \`weave status\` | View progress |
  | \`weave worktree ...\` | Manage git worktrees for parallel work |
  | \`weave verify\` | Run build/test verification for current worktree |
  | \`weave archive\` | Archive the verified active change artifact |
  | \`weave loop-run\` | Create and execute a bounded loop for the active change |
  | \`weave loop-start\` | Create a loop run without executing it |
  | \`weave loop-step\` | Execute one loop iteration for an existing loopId |
  | \`weave loop-status\` | Inspect a loop run by loopId |
  | \`weave loop-stop\` | Request a semantic stop for a loop run |
  | \`weave loop-list\` | List known loop runs |
  | \`weave loop-sync\` | Pull delegated squad results back into a loop run |
  | \`weave loop-watchdog\` | Scan delegated loops and auto-sync completed runs |
  | \`weave loop-poll\` | Bounded wait loop for delegated completion |
  | \`weave loop-operator\` | Recurring operator run with state + lock artifacts |
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
weave approve-plan phaseId="P1"                          # Finalize crafted phase P1
weave flow                                               # One-shot: prepare/approve/craft/verify/finalize
weave craft                                              # Prepare current phase execution context
weave loop-run                                           # Run bounded loop for the active change
weave loop-status loopId="docs-p1-loop-r1"               # Inspect a specific loop run
weave loop-sync loopId="docs-p1-loop-r1"                 # Resume after delegated workers finish
weave loop-watchdog                                      # Scan all delegated loops once
weave loop-poll loopId="docs-p1-loop-r1"                 # Wait for delegated completion and resume automatically
weave loop-operator                                      # Automation-friendly recurring operator pass
weave archive                                            # Archive verified active change
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
        const requestedPhase = options.phaseId
            ? plan.phases.find(phase => phase.id === options.phaseId)
            : undefined;
        const currentPhaseId = requestedPhase && requestedPhase.status !== 'completed'
            ? requestedPhase.id
            : plan.currentPhase
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

function sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
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

