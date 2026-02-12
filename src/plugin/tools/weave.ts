/**
 * Weave Tool for OpenCode Plugin
 * 
 * Integrates Weave workflow into OpenCode as a tool.
 * Commands: design, craft, status
 */

import { tool } from '@opencode-ai/plugin/tool';
const z = tool.schema;

import { VERSION } from '../../version.js';
import { intake } from '../../weave/stages/intake.js';
import { plan } from '../../weave/stages/plan.js';
import { execute, preparePhaseExecution, formatExecutionPlan } from '../../weave/stages/execute.js';
import { handoff, generateStatusReport, handleUserResponse } from '../../weave/stages/handoff.js';
import { getPhaseManager } from '../../weave/phase-manager.js';
import { searchTroubleshooting, recordTroubleshooting, GlobalKnowledge } from '../../weave/knowledge/global.js';
import { getOrchestrator } from '../../weave/orchestrator.js';

// ============================================================================
// Tool Factory
// ============================================================================

export function createWeaveTool() {
    return {
        description: `Weave: Phase-driven development workflow with expert mask auto-selection and cross-project knowledge sharing.

Commands:
- design [docsPath]: Analyze requirements and create phase-based plan
- craft [phaseId]: Execute a phase with Build + Self-Verify Loop
- status: View overall progress
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
            command: z.enum(['design', 'craft', 'status', 'troubleshoot', 'record', 'approve', 'help', 'repair'])
                .describe('Weave command to execute'),
            docsPath: z.string().optional()
                .describe('Path to requirements documents (for design command)'),
            phaseId: z.string().optional()
                .describe('Phase ID to execute (for craft command)'),
            projectName: z.string().optional()
                .describe('Project name (for design command)'),
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
                command: 'design' | 'craft' | 'status' | 'troubleshoot' | 'record' | 'approve' | 'help' | 'repair';
                docsPath?: string;
                phaseId?: string;
                projectName?: string;
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
                    case 'design':
                        return await handleDesign(args, basePath);

                    case 'craft':
                        return await handleCraft(args, basePath);

                    case 'status':
                        return await handleStatus(basePath);

                    case 'troubleshoot':
                        return await handleTroubleshoot(args);

                    case 'record':
                        return await handleRecord(args);

                    case 'approve':
                        return await handleApprove(args);

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
    args: { docsPath?: string; projectName?: string },
    basePath: string
): Promise<string> {
    const { docsPath, projectName } = args;

    if (!docsPath) {
        return 'Error: docsPath is required for design command. Example: weave design docs/';
    }

    // Step 1: Intake
    const intakeResult = await intake({ docsPath });

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
    });

    return planResult.summary;
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

async function handleApprove(args: { phaseId?: string }): Promise<string> {
    const { phaseId } = args;

    if (!phaseId) {
        return 'Error: phaseId is required for approve command';
    }

    const result = await handleUserResponse(phaseId, 'approve');
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
| \`weave design [docs]\` | Analyze requirements and create phase plan |
| \`weave craft [id]\` | Execute a phase (with auto-verification) |
| \`weave status\` | View progress |
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

