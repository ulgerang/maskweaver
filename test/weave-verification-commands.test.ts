import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { formatRecommendedCommandsAsBash, recommendVerificationCommands } from '../src/weave/verification/commands.js';

function createTempDir(): string {
  const root = join(process.cwd(), 'test-temp');
  mkdirSync(root, { recursive: true });
  const dir = join(root, `weave-verify-cmds-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
  mkdirSync(dir, { recursive: true });
  return dir;
}

function cleanupTempDir(dir: string): void {
  if (existsSync(dir)) {
    rmSync(dir, { recursive: true, force: true });
  }
}

function seedNodeProject(worktree: string): void {
  writeFileSync(
    join(worktree, 'package.json'),
    JSON.stringify({
      name: 'verify-fixture',
      version: '1.0.0',
      scripts: {
        build: 'tsc --noEmit',
        test: 'vitest run',
      },
    }, null, 2),
    'utf-8',
  );
}

function seedGdcWorkspace(worktree: string): void {
  const gdcDir = join(worktree, '.gdc');
  mkdirSync(join(gdcDir, 'nodes'), { recursive: true });
  writeFileSync(join(gdcDir, 'config.yaml'), 'language: ts\n', 'utf-8');
}

describe('Weave verification command recommendations', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = createTempDir();
    seedNodeProject(tempDir);
  });

  afterEach(() => {
    cleanupTempDir(tempDir);
  });

  test('adds strict GDC preflight before build/test commands', () => {
    seedGdcWorkspace(tempDir);
    writeFileSync(
      join(tempDir, 'maskweaver.config.json'),
      JSON.stringify({ gdc: { enabled: true, strictVerify: true } }, null, 2),
      'utf-8',
    );

    const rec = recommendVerificationCommands({ projectPath: tempDir });
    expect(rec.preflightSteps.map(step => step.name)).toEqual(['GdcSync', 'GdcCheck']);
    expect(rec.preflightSteps[0]?.required).toBe(true);
    expect(rec.preflightSteps[1]?.required).toBe(true);

    const commandText = formatRecommendedCommandsAsBash(rec);
    const commands = commandText.split(/\r?\n/).filter(Boolean);
    expect(commands[0]).toBe('gdc sync --machine');
    expect(commands[1]).toBe('gdc check --machine');
    expect(commands).toContain('npm run build');
    expect(commands).toContain('npm run test');
  });

  test('marks GDC sync optional in lenient mode', () => {
    seedGdcWorkspace(tempDir);
    writeFileSync(
      join(tempDir, 'maskweaver.config.json'),
      JSON.stringify({ gdc: { enabled: true, strictVerify: false } }, null, 2),
      'utf-8',
    );

    const rec = recommendVerificationCommands({ projectPath: tempDir });
    expect(rec.preflightSteps.length).toBe(2);
    expect(rec.preflightSteps[0]?.name).toBe('GdcSync');
    expect(rec.preflightSteps[0]?.required).toBe(false);
    expect(rec.preflightSteps[1]?.name).toBe('GdcCheck');
    expect(rec.preflightSteps[1]?.required).toBe(true);
  });

  test('does not add GDC preflight when integration is disabled', () => {
    seedGdcWorkspace(tempDir);
    writeFileSync(
      join(tempDir, 'maskweaver.config.json'),
      JSON.stringify({ gdc: { enabled: false, strictVerify: true } }, null, 2),
      'utf-8',
    );

    const rec = recommendVerificationCommands({ projectPath: tempDir });
    expect(rec.preflightSteps.length).toBe(0);
  });
});
