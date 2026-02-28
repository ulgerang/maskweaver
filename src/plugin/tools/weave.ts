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
import { mkdir, readFile, writeFile } from 'node:fs/promises';

import { VERSION } from '../../version.js';
import { intake } from '../../weave/stages/intake.js';
import { writeResearchReport } from '../../weave/stages/research.js';
import { refinePlanFromNotes } from '../../weave/stages/refine.js';
import { spec as createSpec } from '../../weave/stages/spec.js';
import { plan } from '../../weave/stages/plan.js';
import { execute, preparePhaseExecution, formatExecutionPlan, runAIVerification, generateVerificationReport } from '../../weave/stages/execute.js';
import { handoff, generateStatusReport, handleUserResponse } from '../../weave/stages/handoff.js';
import { getPhaseManager } from '../../weave/phase-manager.js';
import { recommendVerificationCommands, formatRecommendedCommandsAsBash } from '../../weave/verification/index.js';
import { createWeaveWorktree, listWeaveWorktrees, resolveWeaveWorktree, removeWeaveWorktree } from '../../weave/worktree.js';
import { ensureGitRepo, stageAllChanges, listStagedFiles, hasStagedChanges, getWorkingTreeStatus, commitStagedChanges } from '../../weave/git.js';
import { scanFilesForSecrets, loadSecretScanConfig, shouldBlockOnFindings, formatSecretScanReport } from '../../weave/security/secret-scan.js';
import { searchTroubleshooting, recordTroubleshooting, GlobalKnowledge } from '../../weave/knowledge/global.js';
import { getOrchestrator } from '../../weave/orchestrator.js';
import type { WeavePlan } from '../../weave/types.js';

// ============================================================================
// Tool Factory
// ============================================================================

export function createWeaveTool() {
    return {
        description: `Weave: Phase-driven development workflow with expert mask auto-selection and cross-project knowledge sharing.

Commands:
- research [docsPath]: Deep-read docs and write persistent research.md
- spec [docsPath]: Generate baseline spec (requirements + AC)
- design [docsPath]: Analyze requirements and create phase-based plan
- prepare [docsPath]: Create research + spec + plan with defaults (vNext happy path)
- refine-plan: Apply annotation notes to active plan
- approve-plan: Mark plan reviewed/approved before implementation
- flow [docsPath]: One-command path (prepare -> approve-plan gate -> craft auto-loop)
- craft [phaseId]: Execute next phase automatically if omitted (includes auto task loop)
- status: View overall progress
- worktree: Manage git worktrees for parallel work
- verify: Run build/test verification for current worktree
- approve [phaseId]: Mark phase complete (auto phase if omitted)
- troubleshoot [error]: Search global knowledge for solutions
- record [solution]: Record a troubleshooting solution
- repair: Scan and auto-repair corrupted plan YAML files

Examples:
- weave research docs/
- weave design docs/
- weave refine-plan
- weave approve-plan
- weave craft P1
- weave status
- weave repair
- weave troubleshoot "Cannot find module 'xyz'"`,

        args: {
            command: z.enum(['research', 'spec', 'design', 'prepare', 'refine-plan', 'approve-plan', 'flow', 'craft', 'status', 'worktree', 'verify', 'troubleshoot', 'record', 'approve', 'help', 'repair'])
                .describe('Weave command to execute'),
            docsPath: z.string().optional()
                .describe('Path to requirements documents (for design command)'),
            phaseId: z.string().optional()
                .describe('Phase ID (optional for craft/approve)'),
            projectName: z.string().optional()
                .describe('Project name (for design command)'),
            planName: z.string().optional()
                .describe('Plan name (kebab-case) used for plan filename (optional)'),
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
            skipVerify: z.boolean().optional()
                .describe('Skip verification before approve (default: false)'),
            verifyMode: z.enum(['quick', 'full']).optional()
                .describe('Verification mode: quick (typecheck+tests) or full (all available)'),
            autoApprove: z.boolean().optional()
                .describe('Automatically run approve after flow finishes all tasks (default: false)'),
            commit: z.boolean().optional()
                .describe('Create a git commit on approve (default: false)'),
            stageAll: z.boolean().optional()
                .describe('Stage all changes before commit (default: false)'),
            commitMessage: z.string().optional()
                .describe('Commit message (optional)'),
            taskId: z.string().optional()
                .describe('Preferred task ID when resuming craft auto-loop'),
            verify: z.boolean().optional()
                .describe('Run verification as part of craft auto-loop (default: true)'),
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
                command: 'research' | 'spec' | 'design' | 'prepare' | 'refine-plan' | 'approve-plan' | 'flow' | 'craft' | 'status' | 'worktree' | 'verify' | 'troubleshoot' | 'record' | 'approve' | 'help' | 'repair';
                docsPath?: string;
                phaseId?: string;
                projectName?: string;
                planName?: string;
                planReview?: string;
                notesPath?: string;
                applyNotes?: boolean;
                worktreeAction?: 'create' | 'list' | 'open' | 'remove' | 'merge';
                name?: string;
                fromRef?: string;
                deleteBranch?: boolean;
                bootstrapWeave?: boolean;
                skipVerify?: boolean;
                verifyMode?: 'quick' | 'full';
                autoApprove?: boolean;
                commit?: boolean;
                stageAll?: boolean;
                commitMessage?: string;
                taskId?: string;
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

                    case 'approve':
                        return await handleApprove(args, basePath);

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
    args: { docsPath?: string; projectName?: string; planName?: string },
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
    args: { docsPath?: string; projectName?: string; planName?: string },
    basePath: string
): Promise<string> {
    const { docsPath, projectName } = args;

    if (!docsPath) {
        return 'Error: docsPath is required for prepare command. Example: weave prepare docs/';
    }

    const resolvedDocsPath = resolveUnderBase(basePath, docsPath);
    const intakeResult = await intake({ docsPath: resolvedDocsPath });
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
    });

    await updateActivePlanReviewMetadata(basePath, {
        researchPath: researchResult.reportPath,
        resetApproval: true,
        approvalNotes: 'Plan created from prepare. Review and approve before implementation.',
    });

    const lines: string[] = [];
    lines.push('## ✅ Weave Prepare 완료\n');
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
        phaseId?: string;
        projectType?: string;
        verifyMode?: 'quick' | 'full';
        autoApprove?: boolean;
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
        lines.push('Flow paused: plan gate failed. Re-plan before implementation.');
        lines.push(`Run: \`weave command=craft phaseId="${resolvedPhaseId}"\``);
        lines.push('Inspect: `weave command=status`');

        await appendWorkflowLesson(basePath, {
            trigger: 'plan_gate_failed',
            pattern: `Phase ${resolvedPhaseId} failed plan gate checks: ${planGate.failedLabels.join(', ')}`,
            rule: 'Before implementation, ensure phase tasks include implementation, tests, and verification coverage.',
        });
        await syncWorkflowArtifacts(basePath, manager, {
            phaseId: resolvedPhaseId,
            reviewLines: [
                `Flow paused at plan gate for ${resolvedPhaseId}.`,
                `Missing checks: ${planGate.failedLabels.join(', ')}`,
            ],
        });
        return lines.join('\n');
    }

    lines.push('');
    lines.push('### Plan Approval');
    lines.push('');

    if (!plan.planApproved) {
        const approvalMessage = formatPlanApprovalRequired(basePath, plan);
        lines.push(approvalMessage);

        await syncWorkflowArtifacts(basePath, manager, {
            phaseId: resolvedPhaseId,
            reviewLines: [
                `Flow paused before implementation: plan approval required for ${resolvedPhaseId}.`,
            ],
        });

        return lines.join('\n');
    }

    lines.push('- PASS: plan approved for implementation');

    const craftResult = await handleCraft({
        phaseId: resolvedPhaseId,
        projectType: args.projectType,
        verify: true,
        verifyMode: args.verifyMode || 'quick',
    }, basePath);

    lines.push('');
    lines.push('### 2) Craft');
    lines.push('');
    lines.push(craftResult);

    const reviewLines: string[] = [
        `Flow executed for ${resolvedPhaseId}.`,
        `Plan gate: PASS (${planGate.nonTrivial ? 'non-trivial' : 'simple'} scope).`,
    ];

    if (craftResult.includes('All tasks done')) {
        lines.push('');
        if (args.autoApprove) {
            const approveResult = await handleApprove({
                phaseId: resolvedPhaseId,
                projectType: args.projectType,
                verifyMode: 'full',
            }, basePath);

            lines.push('### 3) Approve');
            lines.push('');
            lines.push(approveResult);

            reviewLines.push(approveResult.includes('❌')
                ? `Auto-approve failed for ${resolvedPhaseId}.`
                : `Auto-approve completed for ${resolvedPhaseId}.`);
        } else {
            lines.push(`Next: \`weave command=approve phaseId="${resolvedPhaseId}"\``);
            lines.push('Tip: set `autoApprove=true` in flow to auto-run full verification + approve.');
            reviewLines.push(`All tasks done for ${resolvedPhaseId}; waiting for manual approve.`);
        }
    } else {
        reviewLines.push(`Craft auto-loop paused for ${resolvedPhaseId}; rerun craft after implementation updates.`);
    }

    await syncWorkflowArtifacts(basePath, manager, {
        phaseId: resolvedPhaseId,
        reviewLines,
    });

    return lines.join('\n');
}

function derivePhaseIdFromTaskId(taskId?: string): string | undefined {
    if (!taskId) return undefined;
    const m = /^([Pp]\d+)-T\d+$/.exec(taskId.trim());
    if (!m) return undefined;
    return m[1].toUpperCase();
}

const taskStartSnapshots = new Map<string, string>();

function getTaskSnapshotKey(basePath: string, phaseId: string, taskId: string): string {
    return `${path.resolve(basePath)}::${phaseId}::${taskId}`;
}

async function captureTaskSnapshot(basePath: string, phaseId: string, taskId: string): Promise<void> {
    try {
        await ensureGitRepo(basePath);
        const status = await getWorkingTreeStatus(basePath);
        taskStartSnapshots.set(getTaskSnapshotKey(basePath, phaseId, taskId), status.trim());
    } catch {
        // Non-git workspace: skip snapshots.
    }
}

async function handleCraft(
    args: {
        phaseId?: string;
        projectType?: string;
        taskId?: string;
        verify?: boolean;
        verifyMode?: 'quick' | 'full';
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
    const { plan: executionPlan, phase } = await preparePhaseExecution({
        phaseId: resolvedPhaseId,
        projectType,
        onEvent: (event) => events.push(event),
        basePath,
    });

    // Format the execution plan as markdown for the Mask Weaver
    const planMarkdown = formatExecutionPlan(executionPlan);

    // Add a small "what to do next" block so users don't bounce between craft/task.
    const manager = getPhaseManager(basePath);
    await manager.loadPlan();
    const refreshed = manager.getPhase(resolvedPhaseId);
    const next = refreshed ? findNextActionableTask(refreshed) : null;

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

    if (refreshed) {
        lines.push('');
        lines.push('---');
        lines.push('');
        lines.push(formatPhaseTasksTable(refreshed));
        lines.push('');
        if (next) {
            lines.push(`Next: \`${next.id}\` (${next.status}) — ${next.name}`);
            lines.push(`Continue: \`weave command=craft phaseId="${resolvedPhaseId}" taskId="${next.id}"\``);
        } else {
            lines.push(`All tasks done for ${resolvedPhaseId}. Run: weave command=approve phaseId="${resolvedPhaseId}"`);
        }
    }

    const autoResult = await handleTask(
        {
            phaseId: resolvedPhaseId,
            taskAction: 'auto',
            taskId: args.taskId || next?.id,
            verify: args.verify,
            verifyMode: args.verifyMode,
            commit: args.commit,
            stageAll: args.stageAll,
            commitMessage: args.commitMessage,
            projectType,
        },
        basePath
    );

    lines.push('');
    lines.push('### Auto Loop');
    lines.push('');
    lines.push(autoResult);

    // Return the plan + current auto-loop execution result.
    return lines.join('\n');
}

function generateDefaultPhaseTasks(
    phase: { id: string; name: string; doneWhen: string }
): Array<{ id: string; name: string; testCase?: string; maxRetries: number }> {
    const baseId = phase.id;
    const title = phase.name;
    return [
        {
            id: `${baseId}-T1`,
            name: `${title} 구현`,
            testCase: phase.doneWhen,
            maxRetries: 3,
        },
        {
            id: `${baseId}-T2`,
            name: `${title} 테스트 추가/수정`,
            testCase: '관련 테스트가 통과한다',
            maxRetries: 2,
        },
        {
            id: `${baseId}-T3`,
            name: `${title} 검증 (빌드/테스트)`,
            testCase: '빌드/테스트가 통과한다',
            maxRetries: 2,
        },
    ];
}

function formatPhaseTasksTable(phase: any): string {
    const lines: string[] = [];
    lines.push(`## Phase ${phase.id}: Tasks`);
    lines.push('');
    if (!phase.tasks || phase.tasks.length === 0) {
        lines.push('(no tasks)');
        return lines.join('\n');
    }
    lines.push('| ID | Status | Retries | Task |');
    lines.push('|----|--------|--------|------|');
    for (const t of phase.tasks) {
        const retries = `${t.retryCount || 0}/${t.maxRetries || 5}`;
        lines.push(`| ${t.id} | ${t.status} | ${retries} | ${t.name} |`);
    }
    return lines.join('\n');
}

function findNextActionableTask(phase: any): any | null {
    if (!phase.tasks || phase.tasks.length === 0) return null;
    const inProgress = phase.tasks.find((t: any) => t.status === 'in_progress');
    if (inProgress) return inProgress;
    const failed = phase.tasks.find((t: any) => t.status === 'failed' && (t.retryCount || 0) < (t.maxRetries || 5));
    if (failed) return failed;
    const pending = phase.tasks.find((t: any) => t.status === 'pending');
    if (pending) return pending;
    return null;
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
            });

            return [
                '## ✅ Worktree 생성 완료',
                '',
                `- Name: \`${info.name}\``,
                `- Branch: \`${info.branch}\``,
                `- Path: \`${info.path}\``,
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

async function handleTask(
    args: {
        phaseId?: string;
        taskAction?: 'list' | 'next' | 'start' | 'pass' | 'fail' | 'retry' | 'auto';
        taskId?: string;
        taskError?: string;
        verify?: boolean;
        verifyMode?: 'quick' | 'full';
        projectType?: string;
        commit?: boolean;
        stageAll?: boolean;
        commitMessage?: string;
    },
    basePath: string
): Promise<string> {
    const manager = getPhaseManager(basePath);
    const plan = await manager.loadPlan();
    if (!plan) {
        return 'Error: No active plan. Run `weave design docs/` (or `weave prepare docs/`) first.';
    }

    const derivedPhaseId = derivePhaseIdFromTaskId(args.taskId);
    const phaseId = args.phaseId || derivedPhaseId || plan.currentPhase || manager.getNextPhase()?.id;
    if (!phaseId) {
        return 'Error: phaseId not resolved. Start with `weave craft` to auto-select a phase.';
    }

    const phase = manager.getPhase(phaseId);
    if (!phase) {
        return `Error: Phase not found: ${phaseId}`;
    }

    const action = args.taskAction || 'list';

    if (['start', 'pass', 'retry', 'auto'].includes(action) && !plan.planApproved) {
        return formatPlanApprovalRequired(basePath, plan);
    }

    const currentPhase = () => manager.getPhase(phaseId) || phase;

    const findTask = (taskId: string | undefined) => {
        if (!taskId) return null;
        return currentPhase().tasks.find(t => t.id === taskId) || null;
    };

    const nextActionable = () => {
        const tasks = currentPhase().tasks;
        const inProgress = tasks.find(t => t.status === 'in_progress');
        if (inProgress) return inProgress;
        const failed = tasks.find(t => t.status === 'failed' && (t.retryCount || 0) < (t.maxRetries || 5));
        if (failed) return failed;
        const pending = tasks.find(t => t.status === 'pending');
        if (pending) return pending;
        return null;
    };

    const formatTasksTable = () => {
        const p = currentPhase();
        const lines: string[] = [];
        lines.push(`## Phase ${p.id}: Tasks`);
        lines.push('');
        if (p.tasks.length === 0) {
            lines.push('(no tasks)');
            return lines.join('\n');
        }
        lines.push('| ID | Status | Retries | Task |');
        lines.push('|----|--------|--------|------|');
        for (const t of p.tasks) {
            const retries = `${t.retryCount || 0}/${t.maxRetries || 5}`;
            lines.push(`| ${t.id} | ${t.status} | ${retries} | ${t.name} |`);
        }
        return lines.join('\n');
    };

    const finalize = async (message: string, reviewLines: string[]): Promise<string> => {
        await syncWorkflowArtifacts(basePath, manager, {
            phaseId,
            reviewLines,
        });
        return message;
    };

    const passTask = async (task: { id: string; name: string }) => {
        // Guardrail: don't mark task as passed when nothing changed.
        const snapshotKey = getTaskSnapshotKey(basePath, phaseId, task.id);
        try {
            await ensureGitRepo(basePath);
            const currentStatus = (await getWorkingTreeStatus(basePath)).trim();
            const baselineStatus = taskStartSnapshots.get(snapshotKey);

            if (baselineStatus === undefined) {
                taskStartSnapshots.set(snapshotKey, currentStatus);
                await manager.updateTaskStatus(phaseId, task.id, 'in_progress', {
                    lastError: undefined,
                });
                return {
                    ok: false,
                    reason: 'no_changes' as const,
                    body: [
                        `⏸ Baseline captured for task: ${task.id}`,
                        'No implementation delta to verify yet.',
                        'Implement code changes (or delegate), then rerun `weave craft`.',
                    ].join('\n'),
                };
            }

            if (currentStatus === baselineStatus) {
                await manager.updateTaskStatus(phaseId, task.id, 'in_progress', {
                    lastError: undefined,
                });
                return {
                    ok: false,
                    reason: 'no_changes' as const,
                    body: [
                        `⏸ No implementation delta detected for task: ${task.id}`,
                        'Task remains in_progress.',
                        'Implement code changes (or delegate), then rerun `weave craft`.',
                    ].join('\n'),
                };
            }
        } catch {
            // Non-git workspace: skip change detection guard.
        }

        const shouldVerify = args.verify ?? true;
        const verifyMode = args.verifyMode || 'quick';
        const projectType = args.projectType || 'unknown';
        const commit = !!args.commit;

        // Mark in progress while we verify/commit
        await manager.updateTaskStatus(phaseId, task.id, 'in_progress');

        let verificationReport = '';
        if (shouldVerify) {
            const verification = await runAIVerification({
                projectType,
                projectPath: basePath,
                enablePlaywright: false,
                enableScreenshots: false,
                mode: verifyMode,
            });

            verificationReport = generateVerificationReport(verification.results);

            if (!verification.passed) {
                await manager.updateTaskStatus(phaseId, task.id, 'failed', {
                    lastError: `Verification failed at: ${verification.failedAt || 'unknown'}`,
                });

                return {
                    ok: false,
                    reason: 'verification_failed' as const,
                    body: [
                        verificationReport,
                        '',
                        `❌ Verification failed at: ${verification.failedAt || 'unknown'}`,
                        '',
                        `Task marked failed: ${task.id}`,
                    ].join('\n'),
                };
            }
        }

        let commitBlock: string | null = null;
        if (commit) {
            try {
                await ensureGitRepo(basePath);

                if (args.stageAll) {
                    await stageAllChanges(basePath);
                } else {
                    const hasStaged = await hasStagedChanges(basePath);
                    if (!hasStaged) {
                        await manager.updateTaskStatus(phaseId, task.id, 'failed', {
                            lastError: 'No staged changes to commit',
                        });
                        return {
                            ok: false,
                            reason: 'no_staged_changes' as const,
                            body: [
                                verificationReport,
                                '',
                                '❌ No staged changes to commit.',
                                'Stage files first, or use `stageAll=true`.',
                            ].filter(Boolean).join('\n'),
                        };
                    }
                }

                const stagedFiles = await listStagedFiles(basePath);
                const secretCfg = loadSecretScanConfig(basePath);
                const findings = scanFilesForSecrets({ projectPath: basePath, files: stagedFiles, config: secretCfg });
                if (findings.length > 0 && shouldBlockOnFindings(findings, secretCfg)) {
                    await manager.updateTaskStatus(phaseId, task.id, 'failed', {
                        lastError: 'Secret scan blocked commit',
                    });
                    return {
                        ok: false,
                        reason: 'secret_scan_blocked' as const,
                        body: [
                            verificationReport,
                            '',
                            formatSecretScanReport(findings),
                        ].filter(Boolean).join('\n'),
                    };
                }

                const secretWarning = findings.length > 0 ? formatSecretScanReport(findings) : null;

                const defaultMsg = `${phaseId}/${task.id}: ${task.name}`;
                const msg = (args.commitMessage && args.commitMessage.trim().length > 0)
                    ? args.commitMessage.trim()
                    : defaultMsg;

                const commitRes = await commitStagedChanges(basePath, msg);
                const commitOutput = [commitRes.stdout, commitRes.stderr].filter(Boolean).join('\n').trim();

                commitBlock = [
                    secretWarning ? secretWarning : '',
                    '✅ Commit created.',
                    commitOutput ? ['```', commitOutput, '```'].join('\n') : '',
                ].filter(Boolean).join('\n');
            } catch (e) {
                const msg = e instanceof Error ? e.message : String(e);
                await manager.updateTaskStatus(phaseId, task.id, 'failed', {
                    lastError: `Commit failed: ${msg}`,
                });
                return {
                    ok: false,
                    reason: 'commit_failed' as const,
                    body: [
                        verificationReport,
                        '',
                        `❌ Commit failed: ${msg}`,
                    ].filter(Boolean).join('\n'),
                };
            }
        }

        await manager.updateTaskStatus(phaseId, task.id, 'passed');
        taskStartSnapshots.delete(snapshotKey);

        return {
            ok: true,
            body: [
                shouldVerify ? verificationReport : '',
                shouldVerify ? '' : '',
                `✅ Task passed: ${task.id} — ${task.name}`,
                commitBlock ? '' : '',
                commitBlock ? commitBlock : '',
            ].filter(Boolean).join('\n'),
        };
    };

    switch (action) {
        case 'list': {
            const lines = [formatTasksTable()];
            const next = nextActionable();
            if (next) {
                lines.push('');
                lines.push(`Next: \`${next.id}\` (${next.status}) — ${next.name}`);
                lines.push(`Continue: \`weave command=craft phaseId="${phaseId}" taskId="${next.id}"\``);
            }
            return lines.join('\n');
        }

        case 'next': {
            const next = nextActionable();
            if (!next) {
                return `All tasks are done for ${phaseId}. If ready, run: weave command=approve phaseId="${phaseId}"`;
            }
            return [
                `## Next Task for ${phaseId}`,
                '',
                `- ID: \`${next.id}\``,
                `- Status: \`${next.status}\``,
                `- Task: ${next.name}`,
                '',
                `Continue: \`weave command=craft phaseId="${phaseId}" taskId="${next.id}"\``,
            ].join('\n');
        }

        case 'start': {
            const task = findTask(args.taskId);
            if (!task) {
                return 'Error: taskId is required and must exist in this phase.';
            }
            await manager.updateTaskStatus(phaseId, task.id, 'in_progress');
            await captureTaskSnapshot(basePath, phaseId, task.id);
            return finalize([
                `✅ Task started: ${task.id} — ${task.name}`,
                'Note: start only updates task state. Code changes are done by implementation work (you/agent), then pass/auto verifies.',
            ].join('\n'), [
                `Task started: ${task.id}`,
            ]);
        }

        case 'retry': {
            const task = findTask(args.taskId);
            if (!task) {
                return 'Error: taskId is required and must exist in this phase.';
            }
            await manager.updateTaskStatus(phaseId, task.id, 'in_progress', { lastError: undefined });
            await captureTaskSnapshot(basePath, phaseId, task.id);
            return finalize(`🔄 Task retry: ${task.id} — ${task.name}`, [
                `Task retried: ${task.id}`,
            ]);
        }

        case 'fail': {
            const task = findTask(args.taskId);
            if (!task) {
                return 'Error: taskId is required and must exist in this phase.';
            }
            const err = (args.taskError || '').trim();
            await manager.updateTaskStatus(phaseId, task.id, 'failed', { lastError: err || 'failed' });

            const lines: string[] = [];
            lines.push(`❌ Task failed: ${task.id} — ${task.name}`);
            if (err) {
                lines.push('');
                lines.push('Error:');
                lines.push('```');
                lines.push(err.slice(0, 2000));
                lines.push('```');
            }

            if (err) {
                try {
                    const orch = getOrchestrator();
                    const suggestedMask = orch.selectMaskForError(err);
                    lines.push('');
                    lines.push(`Suggested mask: \`${suggestedMask}\``);
                } catch {
                    // ignore
                }

                try {
                    const solutions = await searchTroubleshooting(err, {
                        projectType: args.projectType,
                        limit: 3,
                    });
                    if (solutions.length > 0) {
                        lines.push('');
                        lines.push('Hints (Global Knowledge):');
                        for (const s of solutions) {
                            lines.push(`- ${s.entry.solution}`);
                        }
                    }
                } catch {
                    // ignore
                }
            }

            lines.push('');
            lines.push(`Retry: \`weave command=craft phaseId="${phaseId}" taskId="${task.id}"\``);

            if (err) {
                await appendWorkflowLesson(basePath, {
                    trigger: `task_fail:${task.id}`,
                    pattern: sanitizeLessonText(err),
                    rule: 'Capture concrete failure context, then retry only after implementation changes.',
                });
            }

            return finalize(lines.join('\n'), [
                `Task failed: ${task.id}`,
                err ? `Error captured for ${task.id}.` : `Failure recorded without error details for ${task.id}.`,
            ]);
        }

        case 'pass': {
            const task = findTask(args.taskId);
            if (!task) {
                return 'Error: taskId is required and must exist in this phase.';
            }
            const result = await passTask(task);
            if (!result.ok) {
                if ((result as any).reason === 'verification_failed') {
                    await appendWorkflowLesson(basePath, {
                        trigger: `task_pass_verification_failed:${task.id}`,
                        pattern: sanitizeLessonText(result.body),
                        rule: 'Do not mark task done until verification passes. Fix root cause and rerun pass.',
                    });
                }
                return finalize(result.body, [
                    `Task pass blocked: ${task.id} (${(result as any).reason || 'unknown'}).`,
                ]);
            }
            const next = nextActionable();
            return finalize([
                result.body,
                next ? '' : '',
                next ? `Next: \`${next.id}\` (${next.status}) — ${next.name}` : `All tasks done for ${phaseId}. Run: weave command=approve phaseId="${phaseId}"`,
            ].filter(Boolean).join('\n'), [
                `Task passed: ${task.id}`,
                next ? `Next actionable task: ${next.id}.` : `All tasks passed for ${phaseId}.`,
            ]);
        }

        case 'auto': {
            if (currentPhase().tasks.length === 0) {
                return finalize(`No tasks found for ${phaseId}. Run \`weave craft ${phaseId}\` to seed/generate tasks.`, [
                    `Auto loop paused: no tasks in ${phaseId}.`,
                ]);
            }

            const lines: string[] = [];
            lines.push(`## Auto Task Loop: ${phaseId}`);
            lines.push('');

            const maxSteps = Math.max(10, currentPhase().tasks.length * 3);
            let steps = 0;

            let preferredTaskId = args.taskId;
            while (steps < maxSteps) {
                const preferred = preferredTaskId ? findTask(preferredTaskId) : null;
                preferredTaskId = undefined;
                const next = (preferred && preferred.status !== 'passed') ? preferred : nextActionable();
                if (!next) {
                    lines.push(`✅ All tasks done for ${phaseId}.`);
                    lines.push(`Next: \`weave command=approve phaseId="${phaseId}"\``);
                    return finalize(lines.join('\n'), [
                        `Auto loop completed: all tasks done for ${phaseId}.`,
                    ]);
                }

                steps += 1;

                const previousStatus = next.status;
                if (previousStatus !== 'in_progress') {
                    const patch = next.status === 'failed' ? { lastError: undefined } : undefined;
                    await manager.updateTaskStatus(phaseId, next.id, 'in_progress', patch);
                    await captureTaskSnapshot(basePath, phaseId, next.id);
                    if (previousStatus === 'failed') {
                        lines.push(`🔄 Retrying: ${next.id} — ${next.name}`);
                    } else {
                        lines.push(`▶ Started: ${next.id} — ${next.name}`);
                    }
                    lines.push('Implement/delegate this task first, then rerun `weave craft`.');
                    lines.push(`Continue: \`weave command=craft phaseId="${phaseId}" taskId="${next.id}"\``);
                    return finalize(lines.join('\n'), [
                        `Auto loop waiting for implementation on ${next.id}.`,
                    ]);
                }

                lines.push(`▶ Verifying: ${next.id} — ${next.name}`);

                const task = findTask(next.id);
                if (!task) {
                    lines.push(`❌ Task disappeared: ${next.id}`);
                    return finalize(lines.join('\n'), [
                        `Auto loop error: task disappeared (${next.id}).`,
                    ]);
                }

                const result = await passTask(task);
                lines.push(result.body);
                lines.push('');

                if (!result.ok) {
                    if ((result as any).reason === 'no_changes') {
                        lines.push(`⏸ Waiting for implementation changes on: ${task.id}`);
                        lines.push(`Resume after code changes: \`weave command=craft phaseId="${phaseId}" taskId="${task.id}"\``);
                        return finalize(lines.join('\n'), [
                            `Auto loop waiting for code changes on ${task.id}.`,
                        ]);
                    }

                    const failedTask = findTask(task.id);
                    const retries = failedTask?.retryCount || 0;
                    const maxRetries = failedTask?.maxRetries || 5;
                    const replanThreshold = Math.min(maxRetries, DEFAULT_REPLAN_THRESHOLD);
                    if (retries >= replanThreshold) {
                        const replan = await autoReplanFailedTask(manager, phaseId, task.id, {
                            reason: failedTask?.lastError || result.body,
                        });

                        if (replan && replan.newTaskIds.length > 0) {
                            lines.push(`🧭 Auto re-plan created ${replan.newTaskIds.length} subtasks from ${task.id}.`);
                            lines.push(`Subtasks: ${replan.newTaskIds.map(id => `\`${id}\``).join(', ')}`);
                            lines.push('Continuing auto loop with the first replanned subtask.');

                            await appendWorkflowLesson(basePath, {
                                trigger: `task_auto_replan:${task.id}`,
                                pattern: `Task ${task.id} hit ${retries} failures in auto loop.`,
                                rule: 'When repeated failures occur, split the task into smaller subtasks and continue iteratively.',
                            });

                            preferredTaskId = replan.newTaskIds[0];
                            continue;
                        }

                        lines.push(`🛑 Re-plan triggered: ${task.id} failed ${retries} times, but subtask generation failed.`);
                        lines.push('Stop and refine the plan before retrying the same implementation path.');
                        lines.push(`Inspect: \`weave command=status\``);
                        lines.push(`Refresh strategy: \`weave command=craft phaseId="${phaseId}"\``);

                        await appendWorkflowLesson(basePath, {
                            trigger: `task_auto_replan_failed:${task.id}`,
                            pattern: `Task ${task.id} failed ${retries} times and automatic re-plan generation failed.`,
                            rule: 'If automatic re-plan fails, perform manual plan refinement before retry.',
                        });

                        return finalize(lines.join('\n'), [
                            `Auto loop re-plan fallback for ${task.id} after ${retries} failures.`,
                        ]);
                    }

                    lines.push(`⏸ Stopped at failed task: ${task.id}`);
                    lines.push(`Fix code, then rerun: \`weave command=craft phaseId="${phaseId}" taskId="${task.id}"\``);
                    return finalize(lines.join('\n'), [
                        `Auto loop stopped at failed task ${task.id}.`,
                    ]);
                }
            }

            lines.push('⚠️ Auto loop stopped at safety limit.');
            lines.push(`Inspect with: \`weave command=craft phaseId="${phaseId}"\``);
            return finalize(lines.join('\n'), [
                `Auto loop safety stop in ${phaseId}.`,
            ]);
        }
    }
}

async function handleVerify(
    args: { projectType?: string; verifyMode?: 'quick' | 'full' },
    basePath: string
): Promise<string> {
    const projectType = args.projectType || 'unknown';
    const mode = args.verifyMode || 'full';

    const verification = await runAIVerification({
        projectType,
        projectPath: basePath,
        enablePlaywright: false,
        enableScreenshots: false,
        mode,
    });

    const report = generateVerificationReport(verification.results);

    if (verification.results.length === 0) {
        return [
            report,
            '',
            '> No verification commands detected for this project.',
            '> Provide scripts/tools (package.json, go.mod, Cargo.toml, pyproject.toml, *.sln) or pass projectType hint.',
        ].join('\n');
    }

    if (!verification.passed) {
        return [
            report,
            '',
            `❌ Verification failed at: ${verification.failedAt || 'unknown'}`,
        ].join('\n');
    }

    return [
        report,
        '',
        '✅ Verification passed.',
    ].join('\n');
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

async function handleApprove(
    args: {
        phaseId?: string;
        projectType?: string;
        skipVerify?: boolean;
        verifyMode?: 'quick' | 'full';
        commit?: boolean;
        stageAll?: boolean;
        commitMessage?: string;
    },
    basePath: string
): Promise<string> {
    const { phaseId: requestedPhaseId, projectType, skipVerify, verifyMode, commit, stageAll, commitMessage } = args;

    const phaseManager = getPhaseManager(basePath);
    const loadedPlan = await phaseManager.loadPlan();
    const resolvedPhaseId = requestedPhaseId
        || loadedPlan?.currentPhase
        || loadedPlan?.phases.find(p => p.status === 'in_progress')?.id
        || loadedPlan?.phases.find(p => p.status !== 'completed')?.id;

    if (!resolvedPhaseId) {
        return 'Error: No phase found to approve. Run `weave craft` first.';
    }

    const finalizeApprove = async (message: string, reviewLines: string[]): Promise<string> => {
        await syncWorkflowArtifacts(basePath, phaseManager, {
            phaseId: resolvedPhaseId,
            reviewLines,
        });
        return message;
    };

    if (!skipVerify) {
        const verification = await runAIVerification({
            projectType: projectType || 'unknown',
            projectPath: basePath,
            enablePlaywright: false,
            enableScreenshots: false,
            mode: verifyMode || 'full',
        });

        const report = generateVerificationReport(verification.results);

        if (!verification.passed) {
            return finalizeApprove([
                report,
                '',
                `❌ Verification failed at: ${verification.failedAt || 'unknown'}`,
                '',
                'Fix the failures and re-run approve.',
                'You can also run: `weave command=verify`',
            ].join('\n'), [
                `Approve blocked: verification failed for ${resolvedPhaseId}.`,
            ]);
        }

        // If no commands detected, allow approve but make it explicit.
        if (verification.results.length === 0) {
            await phaseManager.markAllTasksPassed(resolvedPhaseId);
            const result = await handleUserResponse(resolvedPhaseId, 'approve', undefined, basePath);
            return finalizeApprove([
                report,
                '',
                '> No verification commands detected; approved without automated checks.',
                '',
                result.message,
            ].join('\n'), [
                `Approved ${resolvedPhaseId} without automated verification commands.`,
            ]);
        }

        // Optional: commit on approve
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
                            'Stage files first, or run approve with `stageAll=true`.',
                            'Example:',
                            '```txt',
                            `weave command=approve phaseId="${resolvedPhaseId}" commit=true stageAll=true`,
                            '```',
                        ].join('\n'), [
                            `Approve commit blocked: no staged changes for ${resolvedPhaseId}.`,
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
                        `Approve commit blocked by secret scan in ${resolvedPhaseId}.`,
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
                return finalizeApprove([
                    report,
                    '',
                    secretWarning ? secretWarning : '',
                    '✅ Commit created.',
                    commitOutput ? ['```', commitOutput, '```'].join('\n') : '',
                    '',
                    result.message,
                ].filter(Boolean).join('\n'), [
                    `Approved ${resolvedPhaseId} with commit.`,
                ]);
            } catch (e) {
                const msg = e instanceof Error ? e.message : String(e);
                return finalizeApprove([
                    report,
                    '',
                    `❌ Commit failed: ${msg}`,
                ].join('\n'), [
                    `Approve commit failed for ${resolvedPhaseId}: ${sanitizeLessonText(msg)}`,
                ]);
            }
        }

        // Passed with results: include report in approval output.
        {
            await phaseManager.markAllTasksPassed(resolvedPhaseId);
        }
        const result = await handleUserResponse(resolvedPhaseId, 'approve', undefined, basePath);
        return finalizeApprove([
            report,
            '',
            result.message,
        ].join('\n'), [
            `Approved ${resolvedPhaseId} after verification pass.`,
        ]);
    }

    const result = await handleUserResponse(resolvedPhaseId, 'approve', undefined, basePath);
    return finalizeApprove(result.message, [
        `Approved ${resolvedPhaseId} with skipVerify=true.`,
    ]);
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
  | \`weave research [docs]\` | Deep-read docs and write persistent research.md |
  | \`weave spec [docs]\` | Generate baseline spec (requirements + AC) |
  | \`weave prepare [docs]\` | Create spec + phase plan (vNext happy path) |
  | \`weave refine-plan\` | Apply structured plan-note directives to active plan |
  | \`weave approve-plan\` | Mark plan approved before implementation |
  | \`weave flow [docs]\` | One-command path (prepare -> approve-plan gate -> craft auto-loop) |
  | \`weave design [docs]\` | Analyze requirements and create phase plan |
  | \`weave craft [id]\` | Execute a phase with automatic task loop (auto-select next if omitted) |
  | \`weave status\` | View progress |
  | \`weave worktree ...\` | Manage git worktrees for parallel work |
  | \`weave verify\` | Run build/test verification for current worktree |
  | \`weave approve [id]\` | Mark phase complete (auto phase + verification) |
  | \`weave repair\` | Scan and auto-repair corrupted plan YAML files |
  | \`weave troubleshoot [error]\` | Search global knowledge for solutions |
  | \`weave record [solution]\` | Record a new solution |
  | \`weave help\` | Show this help |

### Key Features

- **Mask Auto-Selection**: Automatically applies expert masks per task
- **Global Knowledge Sharing**: Cross-project troubleshooting experience
- **Auto-Verification**: Build + Self-Verify Loop
- **YAML Auto-Repair**: Automatically detects and fixes corrupted plan files

### Quick Start

\`\`\`
weave prepare docs/                                      # Research + spec + plan
weave refine-plan                                        # Apply plan-notes directives (optional)
weave approve-plan                                       # Explicit approval gate
weave flow                                               # Continue active plan with craft auto-loop
weave flow autoApprove=true                              # Auto-run full verify + approve when tasks finish
weave approve                                            # Auto-select current phase + full verify
\`\`\`
`;
}

const DEFAULT_REPLAN_THRESHOLD = 2;

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
                ? 'Task granularity (>=3 executable tasks for non-trivial work)'
                : 'Task granularity (>=1 executable task)',
            passed: tasks.length >= (nonTrivial ? 3 : 1),
        },
        {
            label: 'Test coverage task exists',
            passed: /\btest\b|테스트/.test(taskText),
        },
        {
            label: 'Verification/build task exists',
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

type AutoReplanResult = {
    sourceTaskId: string;
    newTaskIds: string[];
};

async function autoReplanFailedTask(
    manager: ReturnType<typeof getPhaseManager>,
    phaseId: string,
    taskId: string,
    options: {
        reason?: string;
    }
): Promise<AutoReplanResult | null> {
    const plan = await manager.loadPlan();
    if (!plan) return null;

    const phase = plan.phases.find(p => p.id === phaseId);
    if (!phase || !phase.tasks || phase.tasks.length === 0) return null;

    const taskIndex = phase.tasks.findIndex(task => task.id === taskId);
    if (taskIndex < 0) return null;

    const sourceTask = phase.tasks[taskIndex];
    const retryCount = sourceTask.retryCount || 0;
    if (retryCount <= 0) return null;

    // Freeze the repeatedly failing task so craft auto-loop can move on to replanned subtasks.
    sourceTask.status = 'failed';
    sourceTask.maxRetries = Math.max(1, retryCount);
    sourceTask.retryCount = Math.max(retryCount, sourceTask.maxRetries);
    sourceTask.lastError = mergeTaskError(sourceTask.lastError, options.reason);

    const reasonSummary = sanitizeLessonText(options.reason || sourceTask.lastError || 'unknown failure', 120);
    const baseTaskName = sourceTask.name;

    const firstIdNumber = getNextTaskNumber(phase.tasks);
    const subtasks = [
        {
            id: `${phaseId}-T${firstIdNumber}`,
            name: `${baseTaskName} [re-plan] 원인 분해`,
            status: 'pending' as const,
            retryCount: 0,
            maxRetries: 2,
            testCase: `반복 실패 원인을 좁힌다: ${reasonSummary}`,
            lastError: undefined,
            maskUsed: undefined,
        },
        {
            id: `${phaseId}-T${firstIdNumber + 1}`,
            name: `${baseTaskName} [re-plan] 최소 수정 구현`,
            status: 'pending' as const,
            retryCount: 0,
            maxRetries: 3,
            testCase: sourceTask.testCase || '핵심 동작이 정상 동작한다',
            lastError: undefined,
            maskUsed: undefined,
        },
        {
            id: `${phaseId}-T${firstIdNumber + 2}`,
            name: `${baseTaskName} [re-plan] 검증 및 회귀 확인`,
            status: 'pending' as const,
            retryCount: 0,
            maxRetries: 2,
            testCase: '관련 테스트와 검증이 통과한다',
            lastError: undefined,
            maskUsed: undefined,
        },
    ];

    phase.tasks.splice(taskIndex + 1, 0, ...subtasks);
    await manager.savePlan(plan);

    return {
        sourceTaskId: sourceTask.id,
        newTaskIds: subtasks.map(task => task.id),
    };
}

function getNextTaskNumber(tasks: Array<{ id: string }>): number {
    let max = 0;
    for (const task of tasks) {
        const match = /-T(\d+)$/i.exec(task.id);
        if (!match) continue;
        const value = Number.parseInt(match[1], 10);
        if (Number.isFinite(value) && value > max) {
            max = value;
        }
    }
    return max + 1;
}

function mergeTaskError(existing: string | undefined, reason: string | undefined): string | undefined {
    const normalizedReason = reason ? sanitizeLessonText(reason, 180) : '';
    const base = existing ? existing.trim() : '';

    if (!normalizedReason) return base || undefined;
    if (!base) return `Auto re-plan reason: ${normalizedReason}`;
    if (base.includes(normalizedReason)) return base;
    return `${base} | Auto re-plan reason: ${normalizedReason}`;
}

async function syncWorkflowArtifacts(
    basePath: string,
    manager: ReturnType<typeof getPhaseManager>,
    options: {
        phaseId?: string;
        reviewLines?: string[];
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
            const tasks = phase.tasks || [];
            if (tasks.length === 0) {
                lines.push('  - [ ] (no tasks)');
                continue;
            }

            for (const task of tasks) {
                const taskDone = task.status === 'passed';
                const retries = `${task.retryCount || 0}/${task.maxRetries || 5}`;
                lines.push(`  - [${taskDone ? 'x' : ' '}] ${task.id} ${task.name} (${task.status}, retries ${retries})`);
            }
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
                '- Stop and re-plan when the same task fails repeatedly.',
                '- Verify behavior before marking work done.',
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
        // Non-fatal: lesson capture should not block task execution.
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

