import { afterEach, describe, expect, test } from 'vitest';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { bootstrapWeaveArtifacts } from '../src/weave/worktree.js';

function createTempPair(): { fromRoot: string; toRoot: string; cleanupRoot: string } {
  const root = join(process.cwd(), 'test-temp');
  mkdirSync(root, { recursive: true });
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const cleanupRoot = join(root, `worktree-changes-${suffix}`);
  const fromRoot = join(cleanupRoot, 'from');
  const toRoot = join(cleanupRoot, 'to');
  mkdirSync(fromRoot, { recursive: true });
  mkdirSync(toRoot, { recursive: true });
  return { fromRoot, toRoot, cleanupRoot };
}

describe('Weave Worktree change bootstrap', () => {
  const cleanupTargets: string[] = [];

  afterEach(() => {
    for (const target of cleanupTargets.splice(0, cleanupTargets.length)) {
      if (existsSync(target)) {
        rmSync(target, { recursive: true, force: true });
      }
    }
  });

  test('copies weave plans, state, and change artifacts into the new worktree', () => {
    const { fromRoot, toRoot, cleanupRoot } = createTempPair();
    cleanupTargets.push(cleanupRoot);

    const weaveRoot = join(fromRoot, '.opencode', 'weave');
    mkdirSync(join(weaveRoot, 'plans'), { recursive: true });
    mkdirSync(join(weaveRoot, 'changes', 'docs', 'context'), { recursive: true });

    writeFileSync(join(weaveRoot, 'state.yaml'), 'active_plan: docs\n', 'utf-8');
    writeFileSync(join(weaveRoot, 'plans', 'docs.yaml'), 'plan_name: docs\n', 'utf-8');
    writeFileSync(join(weaveRoot, 'changes', 'docs', 'metadata.yaml'), 'change_id: docs\nstatus: verified\n', 'utf-8');
    writeFileSync(join(weaveRoot, 'changes', 'docs', 'verify.md'), '# Verify\n', 'utf-8');
    writeFileSync(join(weaveRoot, 'changes', 'docs', 'context', 'P1-T1-auth.md'), '# Context\n', 'utf-8');

    bootstrapWeaveArtifacts(fromRoot, toRoot);

    expect(existsSync(join(toRoot, '.opencode', 'weave', 'state.yaml'))).toBe(true);
    expect(existsSync(join(toRoot, '.opencode', 'weave', 'plans', 'docs.yaml'))).toBe(true);
    expect(existsSync(join(toRoot, '.opencode', 'weave', 'changes', 'docs', 'metadata.yaml'))).toBe(true);
    expect(existsSync(join(toRoot, '.opencode', 'weave', 'changes', 'docs', 'verify.md'))).toBe(true);
    expect(existsSync(join(toRoot, '.opencode', 'weave', 'changes', 'docs', 'context', 'P1-T1-auth.md'))).toBe(true);

    const copiedMetadata = readFileSync(join(toRoot, '.opencode', 'weave', 'changes', 'docs', 'metadata.yaml'), 'utf-8');
    expect(copiedMetadata).toContain('status: verified');
  });
});
