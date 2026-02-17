import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { createWeaveTool } from '../src/plugin/tools/weave.js';
import { getPhaseManager } from '../src/weave/phase-manager.js';

function createTempDir(): string {
  const root = join(process.cwd(), 'test-temp');
  mkdirSync(root, { recursive: true });
  const dir = join(root, `weave-flow-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
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
    [
      '# Requirements',
      '',
      '- 사용자 로그인 기능을 구현한다.',
      '- 로그인 입력 검증을 제공한다.',
      '- 로그인 성공 후 대시보드로 이동한다.',
      '',
    ].join('\n'),
    'utf-8',
  );
}

describe('Weave Flow Command', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = createTempDir();
    seedDocs(tempDir);
  });

  afterEach(() => {
    cleanupTempDir(tempDir);
  });

  test('flow with docs runs prepare -> craft -> task auto', async () => {
    const tool = createWeaveTool();
    const output = await tool.execute(
      { command: 'flow', docsPath: 'docs' },
      { worktree: tempDir },
    );

    expect(output).toContain('## ▶ Weave Flow');
    expect(output).toContain('### 1) Prepare');
    expect(output).toContain('### 2) Craft');
    expect(output).toContain('### 3) Task Auto');

    const manager = getPhaseManager(tempDir);
    const plan = await manager.loadPlan();
    expect(plan).not.toBeNull();

    const p1 = manager.getPhase('P1');
    expect(p1).not.toBeNull();
    expect(p1?.status).toBe('in_progress');
    expect(p1?.tasks.length).toBeGreaterThan(0);
    expect(p1?.tasks[0]?.status).toBe('in_progress');
  });

  test('flow without docs reuses active plan and keeps waiting when no implementation delta', async () => {
    const tool = createWeaveTool();

    await tool.execute(
      { command: 'flow', docsPath: 'docs' },
      { worktree: tempDir },
    );

    const output = await tool.execute(
      { command: 'flow' },
      { worktree: tempDir },
    );

    expect(output).toContain('Skipped (existing active plan reused).');
    expect(output).toContain('No implementation delta');

    const manager = getPhaseManager(tempDir);
    await manager.loadPlan();
    const p1 = manager.getPhase('P1');
    expect(p1).not.toBeNull();
    expect(p1?.tasks[0]?.status).toBe('in_progress');
    expect(p1?.tasks[1]?.status).toBe('pending');
  });
});
