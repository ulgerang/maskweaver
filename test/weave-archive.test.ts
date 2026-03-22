import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { createWeaveTool } from '../src/plugin/tools/weave.js';

function createTempDir(): string {
  const root = join(process.cwd(), 'test-temp');
  mkdirSync(root, { recursive: true });
  const dir = join(root, `weave-archive-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
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
    ['# Requirements', '', '- 로그인 기능을 구현한다.', '- 입력 검증을 제공한다.'].join('\n'),
    'utf-8',
  );
}

function seedPassingNodeProject(worktree: string): void {
  writeFileSync(
    join(worktree, 'package.json'),
    JSON.stringify({
      name: 'weave-archive-fixture',
      version: '1.0.0',
      scripts: {
        build: 'node -e "process.exit(0)"',
        test: 'node -e "process.exit(0)"',
      },
    }, null, 2),
    'utf-8',
  );
}

describe('Weave archive command', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = createTempDir();
    seedDocs(tempDir);
    seedPassingNodeProject(tempDir);
  });

  afterEach(() => {
    cleanupTempDir(tempDir);
  });

  test('archive records archive report and marks active change archived', async () => {
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
      { command: 'craft', phaseId: 'P1' },
      { worktree: tempDir },
    );
    await tool.execute(
      { command: 'verify', verifyMode: 'quick' },
      { worktree: tempDir },
    );

    const output = await tool.execute(
      { command: 'archive' as any },
      { worktree: tempDir },
    );

    expect(output).toContain('Change archived');
    expect(output).toContain('.opencode/weave/changes/docs/archive.md');

    const archiveReport = readFileSync(
      join(tempDir, '.opencode', 'weave', 'changes', 'docs', 'archive.md'),
      'utf-8',
    );
    expect(archiveReport).toContain('# Archive');
    expect(archiveReport).toContain('Status: archived');

    const metadata = readFileSync(
      join(tempDir, '.opencode', 'weave', 'changes', 'docs', 'metadata.yaml'),
      'utf-8',
    );
    expect(metadata).toContain('status: archived');

    const status = await tool.execute(
      { command: 'status' },
      { worktree: tempDir },
    );
    expect(status).toContain('Change status: archived');
  }, 30000);
});
