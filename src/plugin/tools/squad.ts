/**
 * Squad Management Tool
 * 
 * Multi-agent collaboration session and squad management
 * 
 * Design Principles:
 * - Intention-Revealing Code
 * - Clear error messages
 * - Consistent JSON response format (following context.ts pattern)
 * 
 * @author Martin Fowler's Dummy Human
 */

import { z } from "zod";
import type { ToolFactory, ToolContext } from '../types.js';
import * as shared from '../../shared-context/index.js';
import { join } from "path";

// ============================================================================
// Schema Definition
// ============================================================================

export const squadSchema = z.object({
  action: z.enum([
    "start",      // Start new session (goal required)
    "squad",      // Create squad (mission required)
    "assign",     // Assign task (squadId, description, assignee required)
    "update",     // Update task (squadId, taskId, status required)
    "complete",   // Complete task (squadId, taskId, result required)
    "status",     // View session/squad status
    "watchdog",   // Run watchdog (dryRun optional)
    "list",       // List all squads
    "plan"        // Analyze task dependencies and create parallel execution plan
  ]).describe("Action to execute"),
  
  // start action params
  goal: z.string().optional().describe("Session goal (for start action)"),
  createdBy: z.string().optional().describe("Agent ID creating the session"),
  
  // squad action params
  mission: z.string().optional().describe("Squad mission (for squad action)"),
  operator: z.string().optional().describe("Squad operator agent ID"),
  scope: z.object({
    files: z.array(z.string()).optional(),
    directories: z.array(z.string()).optional(),
  }).optional().describe("Squad file/directory scope"),
  constraints: z.object({
    timeout: z.string().optional(),
    tokenBudget: z.number().optional(),
    maxWorkers: z.number().optional(),
  }).optional().describe("Squad resource constraints"),
  
  // assign action params
  squadId: z.string().optional().describe("Target squad ID"),
  assignee: z.string().optional().describe("Agent to assign task to"),
  description: z.string().optional().describe("Task description"),
  priority: z.enum(["low", "medium", "high", "critical"]).optional()
    .describe("Task priority"),
  
  // update action params
  taskId: z.string().optional().describe("Task ID to update"),
  status: z.enum(["pending", "active", "paused", "completed", "failed"]).optional()
    .describe("New task status"),
  startedAt: z.string().optional().describe("Task start timestamp"),
  
  // complete action params
  success: z.boolean().optional().describe("Whether task succeeded"),
  output: z.unknown().optional().describe("Task output data"),
  error: z.object({
    code: z.string(),
    message: z.string(),
  }).optional().describe("Task error info"),
  
  // watchdog action params
  dryRun: z.boolean().optional().describe("Run watchdog without side effects"),
});

export type SquadArgs = z.infer<typeof squadSchema>;

// ============================================================================
// Response Helpers
// ============================================================================

interface SquadResponse {
  success: boolean;
  action: string;
  message: string;
  data?: unknown;
}

function createResponse(
  success: boolean,
  action: string,
  message: string,
  data?: unknown
): string {
  const response: SquadResponse = { success, action, message };
  if (data !== undefined) {
    response.data = data;
  }
  return JSON.stringify(response, null, 2);
}

function successResponse(action: string, message: string, data?: unknown): string {
  return createResponse(true, action, message, data);
}

function errorResponse(action: string, message: string): string {
  return createResponse(false, action, message);
}

// ============================================================================
// Active Session Management
// ============================================================================

const ACTIVE_SESSION_FILE = "shared/active.json";

interface ActiveSessionInfo {
  sessionId: string;
  goal: string;
  createdAt: string;
}

async function getActiveSessionId(basePath: string): Promise<string | null> {
  const storage = new shared.FileStorageAdapter(join(basePath, ".opencode"));
  const info = await storage.read<ActiveSessionInfo>(ACTIVE_SESSION_FILE);
  return info?.sessionId ?? null;
}

async function setActiveSession(
  basePath: string, 
  sessionId: string, 
  goal: string
): Promise<void> {
  const storage = new shared.FileStorageAdapter(join(basePath, ".opencode"));
  await storage.ensureDir("shared");
  await storage.write<ActiveSessionInfo>(ACTIVE_SESSION_FILE, {
    sessionId,
    goal,
    createdAt: new Date().toISOString(),
  });
}

async function loadActiveSession(basePath: string): Promise<shared.Session | null> {
  const sessionId = await getActiveSessionId(basePath);
  if (!sessionId) return null;
  
  const storage = new shared.FileStorageAdapter(join(basePath, ".opencode"));
  return shared.loadSession(storage, sessionId);
}

// ============================================================================
// Tool Factory
// ============================================================================

/**
 * Analyze task dependencies and create parallel execution plan
 */
async function handlePlan(basePath: string, squadId: string | undefined): Promise<string> {
  if (!squadId || squadId.trim().length === 0) {
    return errorResponse("plan", 'Squad ID is required. Example: squadId="squad-abc123"');
  }

  const session = await loadActiveSession(basePath);
  if (!session) {
    return errorResponse("plan", 'No active session. Start a session first with action="start"');
  }

  try {
    const plan = await shared.createExecutionPlan(session, squadId);

    let planOutput = `Execution Plan for Squad ${squadId} (Mission: ${plan.squadId})\n`;
    planOutput += `Total tasks: ${plan.dag.nodes.size}\n`;
    planOutput += `Total waves: ${plan.waves.length}\n`;
    planOutput += `Estimated parallelism factor: ${plan.estimatedParallelism.toFixed(2)}x\n`;
    planOutput += `Critical path length: ${plan.dag.criticalPath.length} tasks (${plan.dag.criticalPath.join(' -> ')})\n`;
    planOutput += `Has cycle: ${plan.dag.hasCycle}\n\n`;

    planOutput += "Waves:\n";
    plan.waves.forEach((wave: shared.ExecutionWave) => {
      planOutput += `  Wave ${wave.waveIndex}: [${wave.taskIds.join(', ')}]\n`;
    });

    return successResponse("plan", "Execution plan generated", {
      squadId: plan.squadId,
      totalTasks: plan.dag.nodes.size,
      totalWaves: plan.waves.length,
      estimatedParallelism: plan.estimatedParallelism,
      criticalPath: plan.dag.criticalPath,
      hasCycle: plan.dag.hasCycle,
      waves: plan.waves,
      rawOutput: planOutput, // Include a raw string for easier display
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return errorResponse("plan", `Failed to generate execution plan: ${message}`);
  }
}

export function createSquadTool(): ToolFactory {
  return {
    description: `Multi-agent collaboration management.

**⚠️ DELEGATION PRINCIPLE:**
Primary agent (가면술사) should delegate tactical operations to Squad Operator.
Direct use of assign/update/complete by primary agent pollutes strategic context.

**Role-based Action Guide:**
| Action | Primary Agent | Operator | Notes |
|--------|---------------|----------|-------|
| start | ✅ OK | ❌ | Session setup |
| squad | ✅ OK | ❌ | Squad creation |
| assign | ⚠️ Delegate | ✅ OK | Task assignment |
| update | ⚠️ Delegate | ✅ OK | Status updates |
| complete | ⚠️ Delegate | ✅ OK | Task completion |
| status | ✅ OK | ✅ OK | Read-only |
| watchdog | ✅ OK | ✅ OK | Health check |
| list | ✅ OK | ✅ OK | Read-only |

**Correct Workflow:**
1. Primary agent: start → squad → Task(squad-operator)
2. Operator (in separate session): assign → update → complete
3. Primary agent: receives summary only

**Actions:**
- \`start\`: Start new session (goal required)
- \`squad\`: Create new squad (mission, operator required)
- \`assign\`: Assign task to agent (squadId, assignee, description required)
- \`update\`: Update task status (squadId, taskId, status required)
- \`complete\`: Complete task (squadId, taskId, success required)
- \`status\`: View session or squad status (squadId optional)
- \`watchdog\`: Run timeout watchdog (dryRun optional)
    - \`list\`: List all squads in session
    - \`plan\`: Analyze task dependencies and create parallel execution plan (squadId required)

**Examples:**
- Start session: action="start", goal="Implement OAuth login"
- Create squad: action="squad", mission="Auth module", operator="auth-agent"
- Assign task: action="assign", squadId="squad-abc", assignee="worker-1", description="Login form"
- Complete task: action="complete", squadId="squad-abc", taskId="task-123", success=true`,

    args: squadSchema,

    async execute(args: SquadArgs, context: ToolContext) {
      const basePath = context.worktree;

      try {
        switch (args.action) {
          case "start":
            return await handleStart(basePath, args.goal, args.createdBy);

          case "squad":
            return await handleSquad(basePath, args.mission, args.operator, args.scope, args.constraints);

          case "assign":
            return await handleAssign(basePath, args.squadId, args.assignee, args.description, args.priority);

          case "update":
            return await handleUpdate(basePath, args.squadId, args.taskId, args.status, args.startedAt);

          case "complete":
            return await handleComplete(basePath, args.squadId, args.taskId, args.success, args.output, args.error);

          case "status":
            return await handleStatus(basePath, args.squadId);

          case "watchdog":
            return await handleWatchdog(basePath, args.dryRun);

          case "list":
            return await handleList(basePath);

          case "plan":
            return await handlePlan(basePath, args.squadId);

          default:
            return errorResponse(
              args.action,
              `Unknown action. Available: start, squad, assign, update, complete, status, watchdog, list`
            );
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return errorResponse(args.action, `Unexpected error: ${message}`);
      }
    }
  };
}

// ============================================================================
// Action Handlers
// ============================================================================

/**
 * Start a new collaboration session
 * 
 * Creates a session and sets it as the active session.
 */
async function handleStart(
  basePath: string,
  goal: string | undefined,
  createdBy: string | undefined
): Promise<string> {
  if (!goal || goal.trim().length === 0) {
    return errorResponse("start", 'Session goal (goal) is required. Example: goal="Implement OAuth login"');
  }

  const agentId = createdBy ?? "operator";
  const storage = new shared.FileStorageAdapter(join(basePath, ".opencode"));

  const session = await shared.createSession(storage, {
    goal,
    createdBy: agentId,
  });

  // Set as active session
  await setActiveSession(basePath, session.manifest.sessionId, goal);

  return successResponse("start", `Session started: ${goal}`, {
    sessionId: session.manifest.sessionId,
    goal: session.manifest.goal,
    createdBy: session.manifest.createdBy,
    createdAt: session.manifest.createdAt,
    basePath: session.sessionPath,
  });
}

/**
 * Create a new squad within the active session
 */
async function handleSquad(
  basePath: string,
  mission: string | undefined,
  operator: string | undefined,
  scope: { files?: string[]; directories?: string[] } | undefined,
  constraints: { timeout?: string; tokenBudget?: number; maxWorkers?: number } | undefined
): Promise<string> {
  if (!mission || mission.trim().length === 0) {
    return errorResponse("squad", 'Squad mission is required. Example: mission="Implement user authentication"');
  }

  if (!operator || operator.trim().length === 0) {
    return errorResponse("squad", 'Squad operator is required. Example: operator="auth-agent"');
  }

  const session = await loadActiveSession(basePath);
  if (!session) {
    return errorResponse("squad", 'No active session. Start a session first with action="start"');
  }

  const { spec, state } = await shared.createSquad(session, {
    mission,
    operator,
    scope,
    constraints,
  });

  return successResponse("squad", `Squad created: ${mission}`, {
    squadId: spec.squadId,
    mission: spec.mission,
    operator: spec.operator,
    status: state.status,
    scope: spec.scope,
    constraints: spec.constraints,
    createdAt: spec.createdAt,
  });
}

/**
 * Assign a task to an agent within a squad
 */
async function handleAssign(
  basePath: string,
  squadId: string | undefined,
  assignee: string | undefined,
  description: string | undefined,
  priority: "low" | "medium" | "high" | "critical" | undefined
): Promise<string> {
  if (!squadId || squadId.trim().length === 0) {
    return errorResponse("assign", 'Squad ID is required. Example: squadId="squad-abc123"');
  }

  if (!assignee || assignee.trim().length === 0) {
    return errorResponse("assign", 'Assignee is required. Example: assignee="worker-1"');
  }

  if (!description || description.trim().length === 0) {
    return errorResponse("assign", 'Task description is required. Example: description="Implement login form"');
  }

  const session = await loadActiveSession(basePath);
  if (!session) {
    return errorResponse("assign", 'No active session. Start a session first with action="start"');
  }

  const task = await shared.assignTask(session, squadId, {
    assignee,
    description,
    priority,
  });

  return successResponse("assign", `Task assigned to ${assignee}`, {
    taskId: task.taskId,
    assignee: task.assignee,
    description: task.description,
    priority: task.priority,
    status: task.status,
    createdAt: task.createdAt,
  });
}

/**
 * Update a task's status
 */
async function handleUpdate(
  basePath: string,
  squadId: string | undefined,
  taskId: string | undefined,
  status: "pending" | "active" | "paused" | "completed" | "failed" | undefined,
  startedAt: string | undefined
): Promise<string> {
  if (!squadId || squadId.trim().length === 0) {
    return errorResponse("update", 'Squad ID is required. Example: squadId="squad-abc123"');
  }

  if (!taskId || taskId.trim().length === 0) {
    return errorResponse("update", 'Task ID is required. Example: taskId="task-xyz789"');
  }

  if (!status && !startedAt) {
    return errorResponse("update", 'At least one update field is required: status or startedAt');
  }

  const session = await loadActiveSession(basePath);
  if (!session) {
    return errorResponse("update", 'No active session. Start a session first with action="start"');
  }

  const updates: { status?: typeof status; startedAt?: string } = {};
  if (status) updates.status = status;
  if (startedAt) updates.startedAt = startedAt;

  const updatedTask = await shared.updateTask(session, squadId, taskId, updates);

  return successResponse("update", `Task ${taskId} updated`, {
    taskId: updatedTask.taskId,
    status: updatedTask.status,
    assignee: updatedTask.assignee,
    startedAt: updatedTask.startedAt,
  });
}

/**
 * Complete a task with result
 */
async function handleComplete(
  basePath: string,
  squadId: string | undefined,
  taskId: string | undefined,
  success: boolean | undefined,
  output: unknown,
  error: { code: string; message: string } | undefined
): Promise<string> {
  if (!squadId || squadId.trim().length === 0) {
    return errorResponse("complete", 'Squad ID is required. Example: squadId="squad-abc123"');
  }

  if (!taskId || taskId.trim().length === 0) {
    return errorResponse("complete", 'Task ID is required. Example: taskId="task-xyz789"');
  }

  if (success === undefined) {
    return errorResponse("complete", 'Success flag is required. Example: success=true or success=false');
  }

  const session = await loadActiveSession(basePath);
  if (!session) {
    return errorResponse("complete", 'No active session. Start a session first with action="start"');
  }

  // Build TaskResult
  const result: shared.TaskResult = success
    ? { success: true, output }
    : { success: false, error: error ?? { code: "UNKNOWN", message: "Task failed" } };

  const completedTask = await shared.completeTask(session, squadId, taskId, result);

  return successResponse(
    "complete",
    success ? `Task ${taskId} completed successfully` : `Task ${taskId} failed`,
    {
      taskId: completedTask.taskId,
      status: completedTask.status,
      assignee: completedTask.assignee,
      completedAt: completedTask.completedAt,
      result: completedTask.result,
    }
  );
}

/**
 * View session or squad status
 */
async function handleStatus(
  basePath: string,
  squadId: string | undefined
): Promise<string> {
  const session = await loadActiveSession(basePath);
  if (!session) {
    return successResponse("status", "No active session. Start a session with action=\"start\"", {
      hasActiveSession: false,
    });
  }

  // If squadId provided, show squad details
  if (squadId && squadId.trim().length > 0) {
    const squad = await shared.getSquad(session, squadId);
    if (!squad) {
      return errorResponse("status", `Squad not found: ${squadId}`);
    }

    const taskSummary = {
      total: squad.state.tasks.length,
      pending: squad.state.tasks.filter(t => t.status === "pending").length,
      active: squad.state.tasks.filter(t => t.status === "active").length,
      completed: squad.state.tasks.filter(t => t.status === "completed").length,
      failed: squad.state.tasks.filter(t => t.status === "failed").length,
    };

    return successResponse("status", `Squad: ${squad.spec.mission}`, {
      squadId: squad.spec.squadId,
      mission: squad.spec.mission,
      operator: squad.spec.operator,
      status: squad.state.status,
      progress: squad.state.progress,
      tasks: squad.state.tasks,
      taskSummary,
      sharedContext: squad.state.sharedContext,
      createdAt: squad.spec.createdAt,
      updatedAt: squad.state.updatedAt,
    });
  }

  // Show session overview
  const squads: Array<{ squadId: string; mission: string; status: string; taskCount: number }> = [];

  for (const sid of session.manifest.squads) {
    const squad = await shared.getSquad(session, sid);
    if (squad) {
      squads.push({
        squadId: squad.spec.squadId,
        mission: squad.spec.mission,
        status: squad.state.status,
        taskCount: squad.state.tasks.length,
      });
    }
  }

  return successResponse("status", `Session: ${session.manifest.goal}`, {
    sessionId: session.manifest.sessionId,
    goal: session.manifest.goal,
    createdBy: session.manifest.createdBy,
    createdAt: session.manifest.createdAt,
    squadCount: squads.length,
    squads,
  });
}

/**
 * Run watchdog to detect stuck squads/tasks
 */
async function handleWatchdog(
  basePath: string,
  dryRun: boolean | undefined
): Promise<string> {
  const session = await loadActiveSession(basePath);
  if (!session) {
    return errorResponse("watchdog", 'No active session. Start a session first with action="start"');
  }

  const summary = await shared.runWatchdog(session, {
    dryRun: dryRun ?? false,
  });

  const mode = dryRun ? "(dry run)" : "";
  const hasExpired = summary.expiredSquads.length > 0 || summary.expiredTasks.length > 0;
  const message = hasExpired
    ? `Watchdog found issues ${mode}`
    : `Watchdog check passed ${mode}`;

  return successResponse("watchdog", message, {
    checkedSquads: summary.checkedSquads,
    checkedTasks: summary.checkedTasks,
    expiredSquads: summary.expiredSquads,
    expiredTasks: summary.expiredTasks,
    dryRun: dryRun ?? false,
  });
}

/**
 * List all squads in the active session
 */
async function handleList(basePath: string): Promise<string> {
  const session = await loadActiveSession(basePath);
  if (!session) {
    return successResponse("list", "No active session. Start a session with action=\"start\"", {
      hasActiveSession: false,
      squads: [],
    });
  }

  const squads: Array<{
    squadId: string;
    mission: string;
    operator: string;
    status: string;
    progress: number;
    taskCount: number;
    createdAt: string;
    updatedAt: string;
  }> = [];

  for (const squadId of session.manifest.squads) {
    const squad = await shared.getSquad(session, squadId);
    if (squad) {
      squads.push({
        squadId: squad.spec.squadId,
        mission: squad.spec.mission,
        operator: squad.spec.operator,
        status: squad.state.status,
        progress: squad.state.progress,
        taskCount: squad.state.tasks.length,
        createdAt: squad.spec.createdAt,
        updatedAt: squad.state.updatedAt,
      });
    }
  }

  // Group by status
  const counts = {
    pending: squads.filter(s => s.status === "pending").length,
    active: squads.filter(s => s.status === "active").length,
    completed: squads.filter(s => s.status === "completed").length,
    failed: squads.filter(s => s.status === "failed").length,
  };

  return successResponse("list", `${squads.length} squad(s) in session`, {
    sessionId: session.manifest.sessionId,
    goal: session.manifest.goal,
    total: squads.length,
    counts,
    squads,
  });
}
