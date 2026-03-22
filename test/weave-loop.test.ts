import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { createWeaveTool } from '../src/plugin/tools/weave.js';
import * as sharedContext from '../src/shared-context/index.js';

function createTempDir(): string {
  const root = join(process.cwd(), 'test-temp');
  mkdirSync(root, { recursive: true });
  const dir = join(root, `weave-loop-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
  mkdirSync(dir, { recursive: true });
  return dir;
}

function cleanupTempDir(dir: string): void {
  if (existsSync(dir)) {
    rmSync(dir, { recursive: true, force: true });
  }
}

function seedDocs(worktree: string): void {
  const docsDir = join(worktree, 'docs');
  mkdirSync(docsDir, { recursive: true });
  writeFileSync(
    join(docsDir, 'requirements.md'),
    ['# Requirements', '', '- 로그인 기능을 구현한다.', '- 검증을 통과해야 한다.'].join('\n'),
    'utf-8',
  );
}

function seedPassingNodeProject(worktree: string): void {
  writeFileSync(
    join(worktree, 'package.json'),
    JSON.stringify({
      name: 'weave-loop-fixture',
      version: '1.0.0',
      scripts: {
        build: 'node -e "process.exit(0)"',
        test: 'node -e "process.exit(0)"',
      },
    }, null, 2),
    'utf-8',
  );
}

function seedFailingNodeProject(worktree: string): void {
  writeFileSync(
    join(worktree, 'package.json'),
    JSON.stringify({
      name: 'weave-loop-failing-fixture',
      version: '1.0.0',
      scripts: {
        build: 'node -e "process.exit(1)"',
        test: 'node -e "process.exit(1)"',
      },
    }, null, 2),
    'utf-8',
  );
}

function seedFixableNodeProject(worktree: string): void {
  writeFileSync(
    join(worktree, 'package.json'),
    JSON.stringify({
      name: 'weave-loop-fixable-fixture',
      version: '1.0.0',
      scripts: {
        build: 'node -e "process.exit(require(\'fs\').existsSync(\'worker-fixed.flag\') ? 0 : 1)"',
        test: 'node -e "process.exit(require(\'fs\').existsSync(\'worker-fixed.flag\') ? 0 : 1)"',
      },
    }, null, 2),
    'utf-8',
  );
}

describe('Weave bounded loop commands', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = createTempDir();
    seedDocs(tempDir);
    seedPassingNodeProject(tempDir);
  });

  afterEach(() => {
    cleanupTempDir(tempDir);
  });

  test('loop-run creates a readable loopId and loop artifacts', async () => {
    const tool = createWeaveTool();

    await tool.execute(
      { command: 'prepare', docsPath: 'docs' },
      { worktree: tempDir },
    );
    await tool.execute(
      { command: 'approve-plan' },
      { worktree: tempDir },
    );

    const output = await tool.execute(
      { command: 'loop-run' as any, verifyMode: 'quick' },
      { worktree: tempDir },
    );

    expect(output).toContain('Loop ID: `docs-p1-loop-r1`');
    expect(output).toContain('Status: verified');

    const runPath = join(tempDir, '.opencode', 'weave', 'loops', 'docs-p1-loop-r1', 'run.yaml');
    const eventsPath = join(tempDir, '.opencode', 'weave', 'loops', 'docs-p1-loop-r1', 'events.jsonl');
    const attemptPath = join(tempDir, '.opencode', 'weave', 'changes', 'docs', 'attempts', 'docs-p1-loop-r1', 'attempt-001', 'verify.md');
    const loopContractPath = join(tempDir, '.opencode', 'weave', 'changes', 'docs', 'loops', 'docs-p1-loop-r1.md');

    expect(existsSync(runPath)).toBe(true);
    expect(existsSync(eventsPath)).toBe(true);
    expect(existsSync(attemptPath)).toBe(true);
    expect(existsSync(loopContractPath)).toBe(true);

    const runYaml = readFileSync(runPath, 'utf-8');
    expect(runYaml).toContain('loop_id: docs-p1-loop-r1');
    expect(runYaml).toContain('status: verified');
  }, 30000);

  test('loop-start, loop-status, and loop-stop use explicit loopId', async () => {
    const tool = createWeaveTool();

    await tool.execute(
      { command: 'prepare', docsPath: 'docs' },
      { worktree: tempDir },
    );
    await tool.execute(
      { command: 'approve-plan' },
      { worktree: tempDir },
    );

    const startOutput = await tool.execute(
      { command: 'loop-start' as any, loopId: 'docs-p1-manual-r1' as any },
      { worktree: tempDir },
    );

    expect(startOutput).toContain('Loop ID: `docs-p1-manual-r1`');
    expect(startOutput).toContain('Status: running');

    const statusOutput = await tool.execute(
      { command: 'loop-status' as any, loopId: 'docs-p1-manual-r1' as any },
      { worktree: tempDir },
    );

    expect(statusOutput).toContain('Loop ID: `docs-p1-manual-r1`');
    expect(statusOutput).toContain('Status: running');

    const stopOutput = await tool.execute(
      { command: 'loop-stop' as any, loopId: 'docs-p1-manual-r1' as any, context: 'manual stop' },
      { worktree: tempDir },
    );

    expect(stopOutput).toContain('Stop requested for loop `docs-p1-manual-r1`');

    const runYaml = readFileSync(
      join(tempDir, '.opencode', 'weave', 'loops', 'docs-p1-manual-r1', 'run.yaml'),
      'utf-8',
    );
    expect(runYaml).toContain('status: stopping');

    const stopJson = readFileSync(
      join(tempDir, '.opencode', 'weave', 'loops', 'docs-p1-manual-r1', 'stop.json'),
      'utf-8',
    );
    expect(stopJson).toContain('manual stop');
  }, 30000);

  test('loop-list shows known loop runs', async () => {
    const tool = createWeaveTool();

    await tool.execute(
      { command: 'prepare', docsPath: 'docs' },
      { worktree: tempDir },
    );
    await tool.execute(
      { command: 'approve-plan' },
      { worktree: tempDir },
    );
    await tool.execute(
      { command: 'loop-start' as any, loopId: 'docs-p1-manual-r1' as any },
      { worktree: tempDir },
    );

    const output = await tool.execute(
      { command: 'loop-list' as any },
      { worktree: tempDir },
    );

    expect(output).toContain('docs-p1-manual-r1');
    expect(output).toContain('running');
  }, 30000);

  test('loop-run blocks on repeated no-progress failures and writes controller notes', async () => {
    cleanupTempDir(tempDir);
    tempDir = createTempDir();
    seedDocs(tempDir);
    seedFailingNodeProject(tempDir);

    const tool = createWeaveTool();

    await tool.execute(
      { command: 'prepare', docsPath: 'docs' },
      { worktree: tempDir },
    );
    await tool.execute(
      { command: 'approve-plan' },
      { worktree: tempDir },
    );

    const output = await tool.execute(
      { command: 'loop-run' as any, verifyMode: 'quick', maxIterations: 3 as any, maxNoProgress: 1 as any },
      { worktree: tempDir },
    );

    expect(output).toContain('Status: blocked');
    expect(output).toContain('No-progress budget exhausted');

    const attemptSummaryPath = join(
      tempDir,
      '.opencode',
      'weave',
      'changes',
      'docs',
      'attempts',
      'docs-p1-loop-r1',
      'attempt-002',
      'summary.md',
    );
    const attemptNextActionPath = join(
      tempDir,
      '.opencode',
      'weave',
      'changes',
      'docs',
      'attempts',
      'docs-p1-loop-r1',
      'attempt-002',
      'next-action.md',
    );
    const attemptWorkerBriefPath = join(
      tempDir,
      '.opencode',
      'weave',
      'changes',
      'docs',
      'attempts',
      'docs-p1-loop-r1',
      'attempt-002',
      'worker-brief.md',
    );
    const attemptTaskBundlePath = join(
      tempDir,
      '.opencode',
      'weave',
      'changes',
      'docs',
      'attempts',
      'docs-p1-loop-r1',
      'attempt-002',
      'task-bundle.json',
    );

    expect(existsSync(attemptSummaryPath)).toBe(true);
    expect(existsSync(attemptNextActionPath)).toBe(true);
    expect(existsSync(attemptWorkerBriefPath)).toBe(true);
    expect(existsSync(attemptTaskBundlePath)).toBe(true);

    const summary = readFileSync(attemptSummaryPath, 'utf-8');
    const nextAction = readFileSync(attemptNextActionPath, 'utf-8');
    const workerBrief = readFileSync(attemptWorkerBriefPath, 'utf-8');
    const taskBundle = readFileSync(attemptTaskBundlePath, 'utf-8');
    const parsedTaskBundle = JSON.parse(taskBundle) as {
      sessionId?: string;
      squadId?: string;
      assignedTasks?: Array<{ taskId: string }>;
    };
    expect(summary).toContain('Failure Summary');
    expect(summary).toContain('No progress');
    expect(nextAction).toContain('Next Action');
    expect(nextAction).toContain('loop-step');
    expect(workerBrief).toContain('Worker Brief');
    expect(workerBrief).toContain('Fix the failing verifier target');
    expect(taskBundle).toContain('"assignee"');
    expect(taskBundle).toContain('"briefPath"');
    expect(parsedTaskBundle.sessionId).toBeTruthy();
    expect(parsedTaskBundle.squadId).toBeTruthy();
    expect(Array.isArray(parsedTaskBundle.assignedTasks)).toBe(true);
    expect((parsedTaskBundle.assignedTasks || []).length).toBeGreaterThan(0);
    expect(existsSync(join(tempDir, '.opencode', 'shared', String(parsedTaskBundle.sessionId), 'manifest.json'))).toBe(true);
    expect(existsSync(join(tempDir, '.opencode', 'shared', String(parsedTaskBundle.sessionId), 'squads', String(parsedTaskBundle.squadId), 'spec.json'))).toBe(true);
  }, 30000);

  test('loop-sync auto-resumes after delegated tasks complete successfully', async () => {
    cleanupTempDir(tempDir);
    tempDir = createTempDir();
    seedDocs(tempDir);
    seedFixableNodeProject(tempDir);

    const tool = createWeaveTool();

    await tool.execute(
      { command: 'prepare', docsPath: 'docs' },
      { worktree: tempDir },
    );
    await tool.execute(
      { command: 'approve-plan' },
      { worktree: tempDir },
    );

    const firstOutput = await tool.execute(
      { command: 'loop-run' as any, verifyMode: 'quick', maxIterations: 3 as any, maxNoProgress: 1 as any },
      { worktree: tempDir },
    );
    expect(firstOutput).toContain('Status: blocked');

    const taskBundle = JSON.parse(
      readFileSync(
        join(
          tempDir,
          '.opencode',
          'weave',
          'changes',
          'docs',
          'attempts',
          'docs-p1-loop-r1',
          'attempt-002',
          'task-bundle.json',
        ),
        'utf-8',
      ),
    ) as {
      sessionId: string;
      squadId: string;
      assignedTasks: Array<{ taskId: string }>;
    };

    const storage = new sharedContext.FileStorageAdapter(join(tempDir, '.opencode'));
    const session = await sharedContext.loadSession(storage, taskBundle.sessionId);
    expect(session).toBeTruthy();

    for (const task of taskBundle.assignedTasks) {
      await sharedContext.completeTask(session!, taskBundle.squadId, task.taskId, {
        success: true,
        output: { note: 'worker finished' },
      });
    }

    writeFileSync(join(tempDir, 'worker-fixed.flag'), 'ok', 'utf-8');

    const syncOutput = await tool.execute(
      { command: 'loop-sync' as any, loopId: 'docs-p1-loop-r1' as any, verifyMode: 'quick' },
      { worktree: tempDir },
    );

    expect(syncOutput).toContain('Delegated work completed');
    expect(syncOutput).toContain('Status: verified');

    const runYaml = readFileSync(
      join(tempDir, '.opencode', 'weave', 'loops', 'docs-p1-loop-r1', 'run.yaml'),
      'utf-8',
    );
    expect(runYaml).toContain('status: verified');
  }, 30000);

  test('loop-watchdog auto-syncs completed delegated loops', async () => {
    cleanupTempDir(tempDir);
    tempDir = createTempDir();
    seedDocs(tempDir);
    seedFixableNodeProject(tempDir);

    const tool = createWeaveTool();

    await tool.execute(
      { command: 'prepare', docsPath: 'docs' },
      { worktree: tempDir },
    );
    await tool.execute(
      { command: 'approve-plan' },
      { worktree: tempDir },
    );

    await tool.execute(
      { command: 'loop-run' as any, verifyMode: 'quick', maxIterations: 3 as any, maxNoProgress: 1 as any },
      { worktree: tempDir },
    );

    const taskBundle = JSON.parse(
      readFileSync(
        join(
          tempDir,
          '.opencode',
          'weave',
          'changes',
          'docs',
          'attempts',
          'docs-p1-loop-r1',
          'attempt-002',
          'task-bundle.json',
        ),
        'utf-8',
      ),
    ) as {
      sessionId: string;
      squadId: string;
      assignedTasks: Array<{ taskId: string }>;
    };

    const storage = new sharedContext.FileStorageAdapter(join(tempDir, '.opencode'));
    const session = await sharedContext.loadSession(storage, taskBundle.sessionId);
    expect(session).toBeTruthy();

    for (const task of taskBundle.assignedTasks) {
      await sharedContext.completeTask(session!, taskBundle.squadId, task.taskId, {
        success: true,
        output: { note: 'worker finished' },
      });
    }

    writeFileSync(join(tempDir, 'worker-fixed.flag'), 'ok', 'utf-8');

    const watchdogOutput = await tool.execute(
      { command: 'loop-watchdog' as any, verifyMode: 'quick' },
      { worktree: tempDir },
    );

    expect(watchdogOutput).toContain('## Loop Watchdog');
    expect(watchdogOutput).toContain('Synced: 1');
    expect(watchdogOutput).toContain('Delegated work completed');

    const runYaml = readFileSync(
      join(tempDir, '.opencode', 'weave', 'loops', 'docs-p1-loop-r1', 'run.yaml'),
      'utf-8',
    );
    expect(runYaml).toContain('status: verified');
  }, 30000);

  test('loop-poll waits for delegated completion and auto-resumes without manual watchdog call', async () => {
    cleanupTempDir(tempDir);
    tempDir = createTempDir();
    seedDocs(tempDir);
    seedFixableNodeProject(tempDir);

    const tool = createWeaveTool();

    await tool.execute(
      { command: 'prepare', docsPath: 'docs' },
      { worktree: tempDir },
    );
    await tool.execute(
      { command: 'approve-plan' },
      { worktree: tempDir },
    );

    await tool.execute(
      { command: 'loop-run' as any, verifyMode: 'quick', maxIterations: 3 as any, maxNoProgress: 1 as any },
      { worktree: tempDir },
    );

    const taskBundle = JSON.parse(
      readFileSync(
        join(
          tempDir,
          '.opencode',
          'weave',
          'changes',
          'docs',
          'attempts',
          'docs-p1-loop-r1',
          'attempt-002',
          'task-bundle.json',
        ),
        'utf-8',
      ),
    ) as {
      sessionId: string;
      squadId: string;
      assignedTasks: Array<{ taskId: string }>;
    };

    const storage = new sharedContext.FileStorageAdapter(join(tempDir, '.opencode'));
    const session = await sharedContext.loadSession(storage, taskBundle.sessionId);
    expect(session).toBeTruthy();

    const pollPromise = tool.execute(
      { command: 'loop-poll' as any, loopId: 'docs-p1-loop-r1' as any, verifyMode: 'quick', pollIntervalMs: 50 as any, pollCycles: 20 as any },
      { worktree: tempDir },
    );

    await new Promise(resolve => setTimeout(resolve, 120));
    for (const task of taskBundle.assignedTasks) {
      await sharedContext.completeTask(session!, taskBundle.squadId, task.taskId, {
        success: true,
        output: { note: 'worker finished' },
      });
    }
    writeFileSync(join(tempDir, 'worker-fixed.flag'), 'ok', 'utf-8');

    const pollOutput = await pollPromise;

    expect(pollOutput).toContain('Loop poll completed');
    expect(pollOutput).toContain('Delegated work completed');
    expect(pollOutput).toContain('Status: verified');
  }, 30000);

  test('loop-operator writes operator state and auto-resumes delegated loops', async () => {
    cleanupTempDir(tempDir);
    tempDir = createTempDir();
    seedDocs(tempDir);
    seedFixableNodeProject(tempDir);

    const tool = createWeaveTool();

    await tool.execute(
      { command: 'prepare', docsPath: 'docs' },
      { worktree: tempDir },
    );
    await tool.execute(
      { command: 'approve-plan' },
      { worktree: tempDir },
    );

    await tool.execute(
      { command: 'loop-run' as any, verifyMode: 'quick', maxIterations: 3 as any, maxNoProgress: 1 as any },
      { worktree: tempDir },
    );

    const taskBundle = JSON.parse(
      readFileSync(
        join(
          tempDir,
          '.opencode',
          'weave',
          'changes',
          'docs',
          'attempts',
          'docs-p1-loop-r1',
          'attempt-002',
          'task-bundle.json',
        ),
        'utf-8',
      ),
    ) as {
      sessionId: string;
      squadId: string;
      assignedTasks: Array<{ taskId: string }>;
    };

    const storage = new sharedContext.FileStorageAdapter(join(tempDir, '.opencode'));
    const session = await sharedContext.loadSession(storage, taskBundle.sessionId);
    expect(session).toBeTruthy();

    const operatorPromise = tool.execute(
      { command: 'loop-operator' as any, verifyMode: 'quick', pollIntervalMs: 50 as any, pollCycles: 20 as any },
      { worktree: tempDir },
    );

    await new Promise(resolve => setTimeout(resolve, 120));
    for (const task of taskBundle.assignedTasks) {
      await sharedContext.completeTask(session!, taskBundle.squadId, task.taskId, {
        success: true,
        output: { note: 'worker finished' },
      });
    }
    writeFileSync(join(tempDir, 'worker-fixed.flag'), 'ok', 'utf-8');

    const operatorOutput = await operatorPromise;

    expect(operatorOutput).toContain('## Loop Operator');
    expect(operatorOutput).toContain('Status: completed');
    expect(operatorOutput).toContain('Synced: 1');
    expect(operatorOutput).toContain('Delegated work completed');

    const operatorState = readFileSync(
      join(tempDir, '.opencode', 'weave', 'loops', 'operator-state.yaml'),
      'utf-8',
    );
    expect(operatorState).toContain('status: completed');
    expect(operatorState).toContain('synced_count: 1');

    const runYaml = readFileSync(
      join(tempDir, '.opencode', 'weave', 'loops', 'docs-p1-loop-r1', 'run.yaml'),
      'utf-8',
    );
    expect(runYaml).toContain('status: verified');
  }, 30000);

  test('loop-operator refuses to start when another operator lock is active', async () => {
    const tool = createWeaveTool();

    await tool.execute(
      { command: 'prepare', docsPath: 'docs' },
      { worktree: tempDir },
    );
    await tool.execute(
      { command: 'approve-plan' },
      { worktree: tempDir },
    );

    mkdirSync(join(tempDir, '.opencode', 'weave', 'loops'), { recursive: true });
    writeFileSync(
      join(tempDir, '.opencode', 'weave', 'loops', 'operator-lock.json'),
      JSON.stringify({
        operatorId: 'loop-operator-fixture',
        startedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        ttlMs: 300000,
      }, null, 2),
      'utf-8',
    );

    const output = await tool.execute(
      { command: 'loop-operator' as any, verifyMode: 'quick', pollIntervalMs: 50 as any, pollCycles: 2 as any },
      { worktree: tempDir },
    );

    expect(output).toContain('Loop operator is already active.');
    expect(output).toContain('loop-operator-fixture');
  }, 30000);
});
