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

import { VERSION } from '../../version.js';
import { intake } from '../../weave/stages/intake.js';
import { spec as createSpec } from '../../weave/stages/spec.js';
import { plan } from '../../weave/stages/plan.js';
import { execute, preparePhaseExecution, formatExecutionPlan, runAIVerification, generateVerificationReport } from '../../weave/stages/execute.js';
import { handoff, generateStatusReport, handleUserResponse } from '../../weave/stages/handoff.js';
import { getPhaseManager } from '../../weave/phase-manager.js';
import { recommendVerificationCommands, formatRecommendedCommandsAsBash } from '../../weave/verification/index.js';
import { createWeaveWorktree, listWeaveWorktrees, resolveWeaveWorktree, removeWeaveWorktree } from '../../weave/worktree.js';
import { ensureGitRepo, stageAllChanges, listStagedFiles, hasStagedChanges, commitStagedChanges } from '../../weave/git.js';
import { scanFilesForSecrets, loadSecretScanConfig, shouldBlockOnFindings, formatSecretScanReport } from '../../weave/security/secret-scan.js';
import { searchTroubleshooting, recordTroubleshooting, GlobalKnowledge } from '../../weave/knowledge/global.js';
import { getOrchestrator } from '../../weave/orchestrator.js';

// ============================================================================
// Tool Factory
// ============================================================================

export function createWeaveTool() {
    return {
        description: `Weave: Phase-driven development workflow with expert mask auto-selection and cross-project knowledge sharing.

Commands:
- spec [docsPath]: Generate baseline spec (requirements + AC)
- design [docsPath]: Analyze requirements and create phase-based plan
- prepare [docsPath]: Create spec + plan with defaults (vNext happy path)
- craft [phaseId]: Execute a phase with Build + Self-Verify Loop
- status: View overall progress
 - worktree: Manage git worktrees for parallel work
 - task: Update task status (optional verify/commit)
 - verify: Run build/test verification for current worktree
- approve: Mark phase complete (runs verification by default; optional commit)
- troubleshoot [error]: Search global knowledge for solutions
- record [solution]: Record a troubleshooting solution
- repair: Scan and auto-repair corrupted plan YAML files

Examples:
- weave design docs/
- weave craft P1
- weave status
- weave repair
- weave troubleshoot "Cannot find module 'xyz'"`,

        args: {
            command: z.enum(['spec', 'design', 'prepare', 'craft', 'status', 'worktree', 'task', 'verify', 'troubleshoot', 'record', 'approve', 'help', 'repair'])
                .describe('Weave command to execute'),
            docsPath: z.string().optional()
                .describe('Path to requirements documents (for design command)'),
            phaseId: z.string().optional()
                .describe('Phase ID to execute (for craft command)'),
            projectName: z.string().optional()
                .describe('Project name (for design command)'),
            planName: z.string().optional()
                .describe('Plan name (kebab-case) used for plan filename (optional)'),
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
            commit: z.boolean().optional()
                .describe('Create a git commit on approve (default: false)'),
            stageAll: z.boolean().optional()
                .describe('Stage all changes before commit (default: false)'),
            commitMessage: z.string().optional()
                .describe('Commit message (optional)'),
            taskAction: z.enum(['list', 'next', 'start', 'pass', 'fail', 'retry']).optional()
                .describe('Task action (for task command)'),
            taskId: z.string().optional()
                .describe('Task ID (for task command)'),
            taskError: z.string().optional()
                .describe('Failure reason (for task fail)'),
            verify: z.boolean().optional()
                .describe('Run verification as part of task pass (default: true)'),
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
                command: 'spec' | 'design' | 'prepare' | 'craft' | 'status' | 'worktree' | 'task' | 'verify' | 'troubleshoot' | 'record' | 'approve' | 'help' | 'repair';
                docsPath?: string;
                phaseId?: string;
                projectName?: string;
                planName?: string;
                worktreeAction?: 'create' | 'list' | 'open' | 'remove' | 'merge';
                name?: string;
                fromRef?: string;
                deleteBranch?: boolean;
                bootstrapWeave?: boolean;
                skipVerify?: boolean;
                verifyMode?: 'quick' | 'full';
                commit?: boolean;
                stageAll?: boolean;
                commitMessage?: string;
                taskAction?: 'list' | 'next' | 'start' | 'pass' | 'fail' | 'retry';
                taskId?: string;
                taskError?: string;
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
                    case 'spec':
                        return await handleSpec(args, basePath);

                    case 'design':
                        return await handleDesign(args, basePath);

                    case 'prepare':
                        return await handlePrepare(args, basePath);

                    case 'craft':
                        return await handleCraft(args, basePath);

                    case 'status':
                        return await handleStatus(basePath);

                    case 'worktree':
                        return await handleWorktree(args, basePath);

                    case 'task':
                        return await handleTask(args, basePath);

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

    // Check if there are questions
    if (intakeResult.questions.length > 0) {
        const lines: string[] = [];
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

    return planResult.summary;
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

    const lines: string[] = [];
    lines.push('## ✅ Weave Prepare 완료\n');
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
    lines.push('다음 단계:');
    lines.push('`weave craft P1`');

    return lines.join('\n');
}

async function handleCraft(
    args: { phaseId?: string; projectType?: string },
    basePath: string
): Promise<string> {
    const { phaseId, projectType } = args;

    if (!phaseId) {
        // Get next phase
        const manager = getPhaseManager(basePath);
        await manager.loadPlan();
        
        // Show any recovery messages from auto-repair during load
        const recoveryMsgs = manager.getRecoveryMessages();
        const recoveryPrefix = recoveryMsgs.length > 0
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

        return recoveryPrefix + `Next Phase: ${nextPhase.id} - ${nextPhase.name}\n\nRun: weave craft ${nextPhase.id}`;
    }

    // Prepare execution plan (validates, marks in_progress, generates plan)
    const events: any[] = [];
    const { plan: executionPlan, phase } = await preparePhaseExecution({
        phaseId,
        projectType,
        onEvent: (event) => events.push(event),
        basePath,
    });

    // Format the execution plan as markdown for the Mask Weaver
    const planMarkdown = formatExecutionPlan(executionPlan);

    // Return the plan — the Mask Weaver will delegate tasks via Task tool
    return planMarkdown;
}

async function handleStatus(basePath: string): Promise<string> {
    const manager = getPhaseManager(basePath);
    await manager.loadPlan();
    
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
        taskAction?: 'list' | 'next' | 'start' | 'pass' | 'fail' | 'retry';
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

    const phaseId = args.phaseId || plan.currentPhase;
    if (!phaseId) {
        return 'Error: phaseId is required (or start a phase with `weave craft P1`).';
    }

    const phase = manager.getPhase(phaseId);
    if (!phase) {
        return `Error: Phase not found: ${phaseId}`;
    }

    const action = args.taskAction || 'list';

    const findTask = (taskId: string | undefined) => {
        if (!taskId) return null;
        return phase.tasks.find(t => t.id === taskId) || null;
    };

    const nextActionable = () => {
        const failed = phase.tasks.find(t => t.status === 'failed' && (t.retryCount || 0) < (t.maxRetries || 5));
        if (failed) return failed;
        const pending = phase.tasks.find(t => t.status === 'pending');
        if (pending) return pending;
        const inProgress = phase.tasks.find(t => t.status === 'in_progress');
        if (inProgress) return inProgress;
        return null;
    };

    const formatTasksTable = () => {
        const lines: string[] = [];
        lines.push(`## Phase ${phase.id}: Tasks`);
        lines.push('');
        if (phase.tasks.length === 0) {
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
    };

    switch (action) {
        case 'list': {
            const lines = [formatTasksTable()];
            const next = nextActionable();
            if (next) {
                lines.push('');
                lines.push(`Next: \`${next.id}\` (${next.status}) — ${next.name}`);
                lines.push(`Run: \`weave command=task taskAction=start phaseId="${phaseId}" taskId="${next.id}"\``);
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
                `Start: \`weave command=task taskAction=start phaseId="${phaseId}" taskId="${next.id}"\``,
            ].join('\n');
        }

        case 'start': {
            const task = findTask(args.taskId);
            if (!task) {
                return 'Error: taskId is required and must exist in this phase.';
            }
            await manager.updateTaskStatus(phaseId, task.id, 'in_progress');
            return `✅ Task started: ${task.id} — ${task.name}`;
        }

        case 'retry': {
            const task = findTask(args.taskId);
            if (!task) {
                return 'Error: taskId is required and must exist in this phase.';
            }
            await manager.updateTaskStatus(phaseId, task.id, 'in_progress', { lastError: undefined });
            return `🔄 Task retry: ${task.id} — ${task.name}`;
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
            lines.push(`Retry: \`weave command=task taskAction=retry phaseId="${phaseId}" taskId="${task.id}"\``);
            return lines.join('\n');
        }

        case 'pass': {
            const task = findTask(args.taskId);
            if (!task) {
                return 'Error: taskId is required and must exist in this phase.';
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

                    return [
                        verificationReport,
                        '',
                        `❌ Verification failed at: ${verification.failedAt || 'unknown'}`,
                        '',
                        `Task marked failed: ${task.id}`,
                    ].join('\n');
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
                            return [
                                verificationReport,
                                '',
                                '❌ No staged changes to commit.',
                                'Stage files first, or use `stageAll=true`.',
                            ].filter(Boolean).join('\n');
                        }
                    }

                    const stagedFiles = await listStagedFiles(basePath);
                    const secretCfg = loadSecretScanConfig(basePath);
                    const findings = scanFilesForSecrets({ projectPath: basePath, files: stagedFiles, config: secretCfg });
                    if (findings.length > 0 && shouldBlockOnFindings(findings, secretCfg)) {
                        await manager.updateTaskStatus(phaseId, task.id, 'failed', {
                            lastError: 'Secret scan blocked commit',
                        });
                        return [
                            verificationReport,
                            '',
                            formatSecretScanReport(findings),
                        ].filter(Boolean).join('\n');
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
                    return [
                        verificationReport,
                        '',
                        `❌ Commit failed: ${msg}`,
                    ].filter(Boolean).join('\n');
                }
            }

            await manager.updateTaskStatus(phaseId, task.id, 'passed');

            const next = nextActionable();
            return [
                shouldVerify ? verificationReport : '',
                shouldVerify ? '' : '',
                `✅ Task passed: ${task.id} — ${task.name}`,
                commitBlock ? '' : '',
                commitBlock ? commitBlock : '',
                next ? '' : '',
                next ? `Next: \`${next.id}\` (${next.status}) — ${next.name}` : `All tasks done for ${phaseId}. Run: weave command=approve phaseId="${phaseId}"`,
            ].filter(Boolean).join('\n');
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
    const { phaseId, projectType, skipVerify, verifyMode, commit, stageAll, commitMessage } = args;

    if (!phaseId) {
        return 'Error: phaseId is required for approve command';
    }

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
            return [
                report,
                '',
                `❌ Verification failed at: ${verification.failedAt || 'unknown'}`,
                '',
                'Fix the failures and re-run approve.',
                'You can also run: `weave command=verify`',
            ].join('\n');
        }

        // If no commands detected, allow approve but make it explicit.
        if (verification.results.length === 0) {
            const manager = getPhaseManager(basePath);
            await manager.loadPlan();
            await manager.markAllTasksPassed(phaseId);
            const result = await handleUserResponse(phaseId, 'approve', undefined, basePath);
            return [
                report,
                '',
                '> No verification commands detected; approved without automated checks.',
                '',
                result.message,
            ].join('\n');
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
                        return [
                            report,
                            '',
                            '❌ No staged changes to commit.',
                            'Stage files first, or run approve with `stageAll=true`.',
                            'Example:',
                            '```txt',
                            `weave command=approve phaseId="${phaseId}" commit=true stageAll=true`,
                            '```',
                        ].join('\n');
                    }
                }

                const stagedFiles = await listStagedFiles(basePath);
                const secretCfg = loadSecretScanConfig(basePath);
                const findings = scanFilesForSecrets({ projectPath: basePath, files: stagedFiles, config: secretCfg });
                if (findings.length > 0 && shouldBlockOnFindings(findings, secretCfg)) {
                    return [
                        report,
                        '',
                        formatSecretScanReport(findings),
                    ].join('\n');
                }

                const secretWarning = findings.length > 0
                    ? formatSecretScanReport(findings)
                    : null;

                // Commit message fallback: Pn: Phase Name
                const manager = getPhaseManager(basePath);
                await manager.loadPlan();
                const phase = manager.getPhase(phaseId);
                const defaultMsg = phase ? `${phase.id}: ${phase.name}` : `${phaseId}: complete`;
                const msg = (commitMessage && commitMessage.trim().length > 0)
                    ? commitMessage.trim()
                    : defaultMsg;

                const commitRes = await commitStagedChanges(basePath, msg);
                const commitOutput = [commitRes.stdout, commitRes.stderr].filter(Boolean).join('\n').trim();

                await manager.markAllTasksPassed(phaseId);
                const result = await handleUserResponse(phaseId, 'approve', undefined, basePath);
                return [
                    report,
                    '',
                    secretWarning ? secretWarning : '',
                    '✅ Commit created.',
                    commitOutput ? ['```', commitOutput, '```'].join('\n') : '',
                    '',
                    result.message,
                ].filter(Boolean).join('\n');
            } catch (e) {
                const msg = e instanceof Error ? e.message : String(e);
                return [
                    report,
                    '',
                    `❌ Commit failed: ${msg}`,
                ].join('\n');
            }
        }

        // Passed with results: include report in approval output.
        {
            const manager = getPhaseManager(basePath);
            await manager.loadPlan();
            await manager.markAllTasksPassed(phaseId);
        }
        const result = await handleUserResponse(phaseId, 'approve', undefined, basePath);
        return [
            report,
            '',
            result.message,
        ].join('\n');
    }

    const result = await handleUserResponse(phaseId, 'approve', undefined, basePath);
    return result.message;
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
  | \`weave spec [docs]\` | Generate baseline spec (requirements + AC) |
  | \`weave prepare [docs]\` | Create spec + phase plan (vNext happy path) |
 | \`weave design [docs]\` | Analyze requirements and create phase plan |
  | \`weave craft [id]\` | Execute a phase (with auto-verification) |
  | \`weave status\` | View progress |
  | \`weave worktree ...\` | Manage git worktrees for parallel work |
 | \`weave task ...\` | Update task status (optional verify/commit) |
  | \`weave verify\` | Run build/test verification for current worktree |
  | \`weave approve [id]\` | Mark phase complete (runs verification by default; can commit) |
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
weave design docs/   # Plan
weave craft P1       # Execute Phase 1
weave status         # Check progress
weave repair         # Fix corrupted YAML
\`\`\`
`;
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

