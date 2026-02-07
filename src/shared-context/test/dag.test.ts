// src/shared-context/test/dag.test.ts

import { describe, test, expect } from 'bun:test';
import {
  buildDAG,
  getReadyTasks,
  areDependenciesMet,
  validateDependencies,
} from '../dag.js';
import { ValidationError } from '../../shared/errors.js';
import type { DAGAnalysis, ExecutionWave } from '../dag.js';
import type { TaskState, Status, Priority } from '../types.js';

// Helper to create a TaskState object for tests
const createTask = (
  taskId: string,
  dependencies: string[] = [],
  status: Status = 'pending',
  priority: Priority = 'medium'
): TaskState => ({
  taskId,
  assignee: 'test-assignee',
  status,
  priority,
  description: `Task ${taskId}`,
  dependencies,
  createdAt: new Date().toISOString(),
});

describe('DAG Module', () => {
  describe('buildDAG', () => {
    test('should correctly build DAG for independent tasks (all in wave 0)', () => {
      const tasks = [
        createTask('A'),
        createTask('B'),
        createTask('C'),
      ];
      const dag = buildDAG(tasks);
      expect(dag.hasCycle).toBe(false);
      expect(dag.waves).toEqual([
        { waveIndex: 0, taskIds: ['A', 'B', 'C'].sort() },
      ]);
      expect(dag.criticalPath.length).toBe(1); // Any single task is critical path
      expect(dag.parallelismFactor).toBeCloseTo(3);
    });

    test('should correctly build DAG for linear dependencies (A->B->C)', () => {
      const tasks = [
        createTask('A'),
        createTask('B', ['A']),
        createTask('C', ['B']),
      ];
      const dag = buildDAG(tasks);
      expect(dag.hasCycle).toBe(false);
      expect(dag.waves).toEqual([
        { waveIndex: 0, taskIds: ['A'] },
        { waveIndex: 1, taskIds: ['B'] },
        { waveIndex: 2, taskIds: ['C'] },
      ]);
      expect(dag.criticalPath).toEqual(['A', 'B', 'C']);
      expect(dag.parallelismFactor).toBeCloseTo(1);
    });

    test('should correctly build DAG for diamond dependencies (A->B, A->C, B+C->D)', () => {
      const tasks = [
        createTask('A'),
        createTask('B', ['A']),
        createTask('C', ['A']),
        createTask('D', ['B', 'C']),
      ];
      const dag = buildDAG(tasks);
      expect(dag.hasCycle).toBe(false);
      expect(dag.waves).toEqual([
        { waveIndex: 0, taskIds: ['A'] },
        { waveIndex: 1, taskIds: ['B', 'C'].sort() },
        { waveIndex: 2, taskIds: ['D'] },
      ]);
      // Critical path can be A->B->D or A->C->D, both have length 3
      expect(dag.criticalPath.length).toBe(3);
      expect(dag.criticalPath[0]).toBe('A');
      expect(['B', 'C']).toContain(dag.criticalPath[1]);
      expect(dag.criticalPath[2]).toBe('D');
      expect(dag.parallelismFactor).toBeCloseTo(4 / 3); // 4 tasks / 3 waves
    });

    test('should detect a cycle and throw ValidationError (A->B->C->A)', () => {
      const tasks = [
        createTask('A', ['C']), // A depends on C
        createTask('B', ['A']),
        createTask('C', ['B']),
      ];
      expect(() => buildDAG(tasks)).toThrow(ValidationError);
      expect(() => buildDAG(tasks)).toThrow("Cycle detected in task dependencies.");
    });

    test('should detect a self-cycle and throw ValidationError (A->A)', () => {
      const tasks = [
        createTask('A', ['A']),
      ];
      expect(() => buildDAG(tasks)).toThrow(ValidationError);
      expect(() => buildDAG(tasks)).toThrow("Invalid dependencies: Task A depends on itself");
    });

    test('should handle empty task list', () => {
      const tasks: TaskState[] = [];
      const dag = buildDAG(tasks);
      expect(dag.hasCycle).toBe(false);
      expect(dag.waves).toEqual([]);
      expect(dag.criticalPath).toEqual([]);
      expect(dag.parallelismFactor).toBe(0);
    });

    test('should handle single task', () => {
      const tasks = [createTask('A')];
      const dag = buildDAG(tasks);
      expect(dag.hasCycle).toBe(false);
      expect(dag.waves).toEqual([{ waveIndex: 0, taskIds: ['A'] }]);
      expect(dag.criticalPath).toEqual(['A']);
      expect(dag.parallelismFactor).toBe(1);
    });

    test('should throw ValidationError for dangling dependencies', () => {
      const tasks = [
        createTask('A'),
        createTask('B', ['X']), // X does not exist
      ];
      expect(() => buildDAG(tasks)).toThrow(ValidationError);
      expect(() => buildDAG(tasks)).toThrow("Invalid dependencies: Task B depends on non-existent task X");
    });

    test('should correctly build DAG with multiple independent paths', () => {
      const tasks = [
        createTask('A'),
        createTask('B', ['A']),
        createTask('C'),
        createTask('D', ['C']),
        createTask('E', ['B', 'D']),
      ];
      const dag = buildDAG(tasks);
      expect(dag.hasCycle).toBe(false);
      expect(dag.waves).toEqual([
        { waveIndex: 0, taskIds: ['A', 'C'].sort() },
        { waveIndex: 1, taskIds: ['B', 'D'].sort() },
        { waveIndex: 2, taskIds: ['E'] },
      ]);
      expect(dag.criticalPath.length).toBe(3); // A->B->E or C->D->E
      expect(dag.criticalPath[0]).toBe('A'); // or C
      expect(['B', 'D']).toContain(dag.criticalPath[1]);
      expect(dag.criticalPath[2]).toBe('E');
      expect(dag.parallelismFactor).toBeCloseTo(5 / 3);
    });
  });

  describe('getReadyTasks', () => {
    test('should return tasks with no dependencies and pending status', () => {
      const tasks = [
        createTask('A', []),
        createTask('B', ['A']),
        createTask('C', []),
        createTask('D', ['C'], 'completed'),
      ];
      const readyTasks = getReadyTasks(tasks);
      expect(readyTasks.map(t => t.taskId).sort()).toEqual(['A', 'C'].sort());
    });

    test('should return tasks whose dependencies are completed', () => {
      const tasks = [
        createTask('A', [], 'completed'),
        createTask('B', ['A']),
        createTask('C', [], 'pending'),
      ];
      const readyTasks = getReadyTasks(tasks);
      expect(readyTasks.map(t => t.taskId).sort()).toEqual(['B', 'C'].sort());
    });

    test('should not return tasks with uncompleted dependencies', () => {
      const tasks = [
        createTask('A', [], 'pending'),
        createTask('B', ['A']),
      ];
      const readyTasks = getReadyTasks(tasks);
      expect(readyTasks.map(t => t.taskId)).toEqual(['A']);
    });

    test('should not return completed tasks', () => {
      const tasks = [
        createTask('A', [], 'completed'),
        createTask('B', ['A'], 'completed'),
      ];
      const readyTasks = getReadyTasks(tasks);
      expect(readyTasks).toEqual([]);
    });

    test('should return empty array if no tasks are ready', () => {
      const tasks = [
        createTask('A', [], 'active'),
        createTask('B', ['A']),
      ];
      const readyTasks = getReadyTasks(tasks);
      expect(readyTasks).toEqual([]);
    });
  });

  describe('areDependenciesMet', () => {
    test('should return true for tasks with no dependencies', () => {
      const task = createTask('A');
      expect(areDependenciesMet(task, [])).toBe(true);
    });

    test('should return true if all dependencies are completed', () => {
      const tasks = [
        createTask('A', [], 'completed'),
        createTask('B', [], 'completed'),
        createTask('C', ['A', 'B']),
      ];
      const taskC = tasks[2];
      expect(areDependenciesMet(taskC, tasks)).toBe(true);
    });

    test('should return false if any dependency is pending', () => {
      const tasks = [
        createTask('A', [], 'pending'),
        createTask('B', [], 'completed'),
        createTask('C', ['A', 'B']),
      ];
      const taskC = tasks[2];
      expect(areDependenciesMet(taskC, tasks)).toBe(false);
    });

    test('should return false if any dependency is active', () => {
      const tasks = [
        createTask('A', [], 'active'),
        createTask('B', [], 'completed'),
        createTask('C', ['A', 'B']),
      ];
      const taskC = tasks[2];
      expect(areDependenciesMet(taskC, tasks)).toBe(false);
    });

    test('should return false if any dependency is failed', () => {
      const tasks = [
        createTask('A', [], 'failed'),
        createTask('B', [], 'completed'),
        createTask('C', ['A', 'B']),
      ];
      const taskC = tasks[2];
      expect(areDependenciesMet(taskC, tasks)).toBe(false);
    });

    test('should return false if a dependency does not exist (handled by validateDependencies)', () => {
      const tasks = [
        createTask('A', [], 'completed'),
        createTask('C', ['A', 'X']), // X does not exist
      ];
      const taskC = tasks[1];
      // This function assumes valid dependencies. If a dependency is missing,
      // find will return undefined, and (undefined && undefined.status === 'completed') will be false.
      expect(areDependenciesMet(taskC, tasks)).toBe(false);
    });
  });

  describe('validateDependencies', () => {
    test('should return valid true for tasks with no dependencies', () => {
      const tasks = [
        createTask('A'),
        createTask('B'),
      ];
      const result = validateDependencies(tasks);
      expect(result.valid).toBe(true);
      expect(result.errors).toEqual([]);
    });

    test('should return valid true for tasks with valid dependencies', () => {
      const tasks = [
        createTask('A'),
        createTask('B', ['A']),
        createTask('C', ['A', 'B']),
      ];
      const result = validateDependencies(tasks);
      expect(result.valid).toBe(true);
      expect(result.errors).toEqual([]);
    });

    test('should return valid false and errors for tasks with non-existent dependencies', () => {
      const tasks = [
        createTask('A'),
        createTask('B', ['A', 'X']), // X does not exist
        createTask('C', ['Y']), // Y does not exist
      ];
      const result = validateDependencies(tasks);
      expect(result.valid).toBe(false);
      expect(result.errors.sort()).toEqual([
        'Task B depends on non-existent task X',
        'Task C depends on non-existent task Y',
      ].sort());
    });

    test('should handle empty dependencies array gracefully', () => {
      const tasks = [
        createTask('A', []),
        createTask('B', []),
      ];
      const result = validateDependencies(tasks);
      expect(result.valid).toBe(true);
      expect(result.errors).toEqual([]);
    });
  });
});
