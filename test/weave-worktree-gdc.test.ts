import { afterEach, describe, expect, test } from 'vitest';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { bootstrapGdcArtifacts } from '../src/weave/worktree.js';

function createTempPair(): { fromRoot: string; toRoot: string; cleanupRoot: string } {
  const root = join(process.cwd(), 'test-temp');
  mkdirSync(root, { recursive: true });
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const cleanupRoot = join(root, `worktree-gdc-${suffix}`);
  const fromRoot = join(cleanupRoot, 'from');
  const toRoot = join(cleanupRoot, 'to');
  mkdirSync(fromRoot, { recursive: true });
  mkdirSync(toRoot, { recursive: true });
  return { fromRoot, toRoot, cleanupRoot };
}

describe('Weave Worktree GDC bootstrap', () => {
  const cleanupTargets: string[] = [];

  afterEach(() => {
    for (const target of cleanupTargets.splice(0, cleanupTargets.length)) {
      if (existsSync(target)) {
        rmSync(target, { recursive: true, force: true });
      }
    }
  });

  test('copies .gdc config and node specs only', () => {
    const { fromRoot, toRoot, cleanupRoot } = createTempPair();
    cleanupTargets.push(cleanupRoot);

    const fromGdc = join(fromRoot, '.gdc');
    mkdirSync(join(fromGdc, 'nodes', 'domain'), { recursive: true });
    writeFileSync(join(fromGdc, 'config.yaml'), 'language: ts\n', 'utf-8');
    writeFileSync(join(fromGdc, 'nodes', 'AuthService.yaml'), 'id: AuthService\n', 'utf-8');
    writeFileSync(join(fromGdc, 'nodes', 'domain', 'User.yaml'), 'id: User\n', 'utf-8');
    writeFileSync(join(fromGdc, 'graph.db'), 'should-not-copy', 'utf-8');

    bootstrapGdcArtifacts(fromRoot, toRoot);

    expect(existsSync(join(toRoot, '.gdc', 'config.yaml'))).toBe(true);
    expect(existsSync(join(toRoot, '.gdc', 'nodes', 'AuthService.yaml'))).toBe(true);
    expect(existsSync(join(toRoot, '.gdc', 'nodes', 'domain', 'User.yaml'))).toBe(true);
    expect(existsSync(join(toRoot, '.gdc', 'graph.db'))).toBe(false);

    const copiedConfig = readFileSync(join(toRoot, '.gdc', 'config.yaml'), 'utf-8');
    expect(copiedConfig).toContain('language: ts');
  });
});
