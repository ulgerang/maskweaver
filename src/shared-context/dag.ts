/**
 * DAG (Directed Acyclic Graph) Dependency Analysis
 *
 * Analyzes task dependencies to enable parallel execution.
 * Uses Kahn's algorithm for topological sorting and wave grouping.
 *
 * "Make the implicit explicit" - Eric Evans
 * Task dependencies are the implicit structure; DAG makes it explicit.
 *
 * @author Jeff Dean's Dummy Human
 */

import type { TaskState } from "./types.js";
import { ValidationError } from "../shared/errors.js";

/**
 * DAG node representation
 */
export interface DAGNode {
  taskId: string;
  dependencies: string[];  // upstream task IDs
  dependents: string[];    // downstream task IDs (reverse edges)
  inDegree: number;        // number of unresolved dependencies
}

/**
 * Execution wave — tasks in same wave can run in parallel
 */
export interface ExecutionWave {
  waveIndex: number;
  taskIds: string[];
}

/**
 * DAG analysis result
 */
export interface DAGAnalysis {
  nodes: Map<string, DAGNode>;
  waves: ExecutionWave[];
  criticalPath: string[];        // longest dependency chain
  hasCycle: boolean;
  parallelismFactor: number;     // average tasks per wave
}

/**
 * Build DAG from task list
 * - Validates no cycles exist (throws if cycle detected)
 * - Computes topological sort
 * - Groups into parallel execution waves (Kahn's algorithm)
 * - Identifies critical path
 * @param tasks - List of tasks to build the DAG from.
 * @returns An object containing the DAG analysis result.
 * @throws {ValidationError} If a cycle is detected or dependencies are invalid.
 * @example
 * import { buildDAG } from './dag.js';
 * import { TaskState } from './types.js';
 *
 * const tasks: TaskState[] = [
 *   { taskId: "A", dependencies: [], status: "pending", assignee: "worker-1", priority: "medium", description: "Task A", createdAt: new Date().toISOString() },
 *   { taskId: "B", dependencies: ["A"], status: "pending", assignee: "worker-1", priority: "medium", description: "Task B", createdAt: new Date().toISOString() },
 *   { taskId: "C", dependencies: ["A"], status: "pending", assignee: "worker-2", priority: "medium", description: "Task C", createdAt: new Date().toISOString() },
 *   { taskId: "D", dependencies: ["B", "C"], status: "pending", assignee: "worker-3", priority: "medium", description: "Task D", createdAt: new Date().toISOString() },
 * ];
 * try {
 *   const dag = buildDAG(tasks);
 *   console.log(dag.waves);
 *   // Expected:
 *   // [
 *   //   { waveIndex: 0, taskIds: ["A"] },
 *   //   { waveIndex: 1, taskIds: ["B", "C"] },
 *   //   { waveIndex: 2, taskIds: ["D"] }
 *   // ]
 *   console.log(dag.criticalPath); // Expected: ["A", "B", "D"] or ["A", "C", "D"]
 * } catch (error) {
 *   if (error instanceof ValidationError) {
 *     console.error("DAG Error:", error.message);
 *   }
 * }
 */
export function buildDAG(tasks: TaskState[]): DAGAnalysis {
  // Handle empty input
  if (tasks.length === 0) {
    return {
      nodes: new Map(),
      waves: [],
      criticalPath: [],
      hasCycle: false,
      parallelismFactor: 0,
    };
  }

  const nodes = new Map<string, DAGNode>();
  const taskMap = new Map<string, TaskState>();

  // Initialize nodes and taskMap
  for (const task of tasks) {
    taskMap.set(task.taskId, task);
    nodes.set(task.taskId, {
      taskId: task.taskId,
      dependencies: task.dependencies || [],
      dependents: [],
      inDegree: 0,
    });
  }

  // Validate dependencies and build graph (dependents, inDegree)
  const validationResult = validateDependencies(tasks);
  if (!validationResult.valid) {
    throw new ValidationError(`Invalid dependencies: ${validationResult.errors.join(", ")}`);
  }

  for (const task of tasks) {
    const taskNode = nodes.get(task.taskId)!;
    for (const depId of task.dependencies || []) {
      const depNode = nodes.get(depId)!;
      depNode.dependents.push(task.taskId);
      taskNode.inDegree++;
    }
  }

  // Kahn's algorithm for topological sort and wave grouping
  const q: string[] = []; // Queue for nodes with inDegree 0
  const inDegreeCopy = new Map<string, number>(); // Copy for Kahn's algorithm
  for (const [taskId, node] of nodes) {
    inDegreeCopy.set(taskId, node.inDegree);
    if (node.inDegree === 0) {
      q.push(taskId);
    }
  }

  const waves: ExecutionWave[] = [];
  let topologicalOrder: string[] = [];
  let currentWaveIndex = 0;

  while (q.length > 0) {
    const currentWaveTaskIds: string[] = [];
    const nextQ: string[] = [];

    while (q.length > 0) {
      const taskId = q.shift()!;
      currentWaveTaskIds.push(taskId);
      topologicalOrder.push(taskId);

      const node = nodes.get(taskId)!;
      for (const dependentId of node.dependents) {
        const dependentInDegree = inDegreeCopy.get(dependentId)! - 1;
        inDegreeCopy.set(dependentId, dependentInDegree);
        if (dependentInDegree === 0) {
          nextQ.push(dependentId);
        }
      }
    }

    if (currentWaveTaskIds.length > 0) {
      waves.push({ waveIndex: currentWaveIndex, taskIds: currentWaveTaskIds.sort() }); // Sort for deterministic output
      currentWaveIndex++;
    }
    q.push(...nextQ);
  }

  // Cycle detection
  const hasCycle = topologicalOrder.length !== tasks.length;
  if (hasCycle) {
    throw new ValidationError("Cycle detected in task dependencies.");
  }

  // Critical Path (simple longest path by number of tasks)
  // This is a simplified critical path calculation, assuming all tasks take equal "time".
  // For more complex scenarios, task durations would be needed.
  const distances = new Map<string, number>();
  for (const task of tasks) {
    distances.set(task.taskId, 0);
  }

  for (const taskId of topologicalOrder) {
    const node = nodes.get(taskId)!;
    const currentDistance = distances.get(taskId)!;
    for (const dependentId of node.dependents) {
      const dependentDistance = distances.get(dependentId)!;
      distances.set(dependentId, Math.max(dependentDistance, currentDistance + 1));
    }
  }

  let criticalPath: string[] = [];
  let maxDistance = 0;
  let endNodeId: string | null = null;

  for (const [taskId, distance] of distances) {
    if (distance > maxDistance) {
      maxDistance = distance;
      endNodeId = taskId;
    }
  }

  // Reconstruct critical path by backtracking
  if (endNodeId) {
    criticalPath.unshift(endNodeId);
    let currentTaskId = endNodeId;
    while (distances.get(currentTaskId)! > 0) {
      const currentNode = nodes.get(currentTaskId)!;
      let foundPrev = false;
      for (const depId of currentNode.dependencies) {
        if (distances.get(depId)! === distances.get(currentTaskId)! - 1) {
          criticalPath.unshift(depId);
          currentTaskId = depId;
          foundPrev = true;
          break;
        }
      }
      if (!foundPrev) {
        // This should not happen if distances are calculated correctly for a DAG
        // Fallback to just the current task if no predecessor is found (e.g., start of path)
        break;
      }
    }
  } else if (tasks.length > 0) {
    // If there's only one task or all tasks have distance 0 (no dependencies),
    // the critical path is just the task itself.
    // Find a task with 0 dependencies to be the start of a critical path if no endNodeId was found.
    const startTask = tasks.find(t => (t.dependencies || []).length === 0);
    if (startTask) {
        criticalPath = [startTask.taskId];
    }
  }


  // Parallelism Factor
  const totalTasks = tasks.length;
  const totalWaves = waves.length;
  const parallelismFactor = totalWaves > 0 ? totalTasks / totalWaves : 0;

  return {
    nodes,
    waves,
    criticalPath,
    hasCycle,
    parallelismFactor,
  };
}

/**
 * Get next executable tasks (all dependencies completed)
 * Used at runtime to determine what can be dispatched now
 * @param tasks - All tasks in the squad.
 * @returns An array of TaskState objects that are ready to be executed.
 * @example
 * import { getReadyTasks } from './dag.js';
 * import { TaskState } from './types.js';
 *
 * const tasks: TaskState[] = [
 *   { taskId: "A", dependencies: [], status: "completed", assignee: "worker-1", priority: "medium", description: "Task A", createdAt: new Date().toISOString() },
 *   { taskId: "B", dependencies: ["A"], status: "pending", assignee: "worker-1", priority: "medium", description: "Task B", createdAt: new Date().toISOString() },
 *   { taskId: "C", dependencies: [], status: "pending", assignee: "worker-2", priority: "medium", description: "Task C", createdAt: new Date().toISOString() },
 * ];
 * const ready = getReadyTasks(tasks);
 * console.log(ready.map(t => t.taskId)); // Expected: ["B", "C"]
 */
export function getReadyTasks(tasks: TaskState[]): TaskState[] {
  return tasks.filter(task =>
    task.status === "pending" && areDependenciesMet(task, tasks)
  );
}

/**
 * Check if a task's dependencies are all satisfied
 * @param task - The task to check.
 * @param allTasks - All tasks in the squad.
 * @returns True if all dependencies are completed, false otherwise.
 * @example
 * import { areDependenciesMet } from './dag.js';
 * import { TaskState } from './types.js';
 *
 * const tasks: TaskState[] = [
 *   { taskId: "A", dependencies: [], status: "completed", assignee: "worker-1", priority: "medium", description: "Task A", createdAt: new Date().toISOString() },
 *   { taskId: "B", dependencies: ["A"], status: "pending", assignee: "worker-1", priority: "medium", description: "Task B", createdAt: new Date().toISOString() },
 * ];
 * const taskB = tasks[1];
 * const met = areDependenciesMet(taskB, tasks);
 * console.log(met); // Expected: true
 */
export function areDependenciesMet(task: TaskState, allTasks: TaskState[]): boolean {
  if (!task.dependencies || task.dependencies.length === 0) {
    return true;
  }
  return task.dependencies.every(depId => {
    const depTask = allTasks.find(t => t.taskId === depId);
    return depTask && depTask.status === "completed";
  });
}

/**
 * Validate that dependencies reference valid task IDs (no dangling refs)
 * @param tasks - List of tasks to validate.
 * @returns An object indicating validity and a list of errors if any.
 * @example
 * import { validateDependencies } from './dag.js';
 * import { TaskState } from './types.js';
 *
 * const tasks: TaskState[] = [
 *   { taskId: "A", dependencies: [], status: "pending", assignee: "worker-1", priority: "medium", description: "Task A", createdAt: new Date().toISOString() },
 *   { taskId: "B", dependencies: ["A", "X"], status: "pending", assignee: "worker-1", priority: "medium", description: "Task B", createdAt: new Date().toISOString() }, // X is invalid
 * ];
 * const validation = validateDependencies(tasks);
 * console.log(validation.valid); // Expected: false
 * console.log(validation.errors); // Expected: ["Task B depends on non-existent task X"]
 */
export function validateDependencies(tasks: TaskState[]): { valid: boolean; errors: string[] } {
  const taskIds = new Set(tasks.map(t => t.taskId));
  const errors: string[] = [];

  for (const task of tasks) {
    for (const depId of task.dependencies || []) {
      if (depId === task.taskId) {
        errors.push(`Task ${task.taskId} depends on itself`);
      } else if (!taskIds.has(depId)) {
        errors.push(`Task ${task.taskId} depends on non-existent task ${depId}`);
      }
    }
  }

  return { valid: errors.length === 0, errors };
}
