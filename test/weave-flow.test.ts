import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
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

function seedLargeDocs(worktree: string): string {
  const docsDir = join(worktree, 'docs-large');
  mkdirSync(docsDir, { recursive: true });
  writeFileSync(
    join(docsDir, 'requirements.md'),
    [
      '# Large Requirements',
      '',
      '- 사용자 가입 기능을 구현한다.',
      '- 로그인 기능을 구현한다.',
      '- 비밀번호 재설정 기능을 구현한다.',
      '- 이메일 인증 흐름을 구현한다.',
      '- 프로필 편집 화면을 구현한다.',
      '- 알림 설정 기능을 구현한다.',
      '- 관리자 대시보드 기능을 구현한다.',
      '- 통계 리포트 화면을 구현한다.',
      '- 감사 로그 조회 기능을 구현한다.',
      '',
    ].join('\n'),
    'utf-8',
  );

  return 'docs-large';
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

  test('flow with docs runs prepare->approval->craft->verify->finalize in one shot', async () => {
    const tool = createWeaveTool();
    const output = await tool.execute(
      { command: 'flow', docsPath: 'docs' },
      { worktree: tempDir },
    );

    expect(output).toContain('## ▶ Weave Flow');
    expect(output).toContain('### 1) Prepare');
    expect(output).toContain('### Plan Gate');
    expect(output).toContain('### Plan Approval');
    expect(output).toContain('## ✅ Plan Approved');
    expect(output).toContain('### 2) Craft');
    expect(output).toContain('### 3) Verify');
    expect(output).toContain('### 4) Finalize');
    expect(existsSync(join(tempDir, 'tasks', 'research.md'))).toBe(true);

    const manager = getPhaseManager(tempDir);
    const plan = await manager.loadPlan();
    expect(plan).not.toBeNull();
    expect(plan?.planApproved).toBe(true);
    expect(plan?.researchPath).toBe('tasks/research.md');

    const p1 = manager.getPhase('P1');
    expect(p1).not.toBeNull();
    expect(p1?.status).toBe('completed');
    expect(p1?.tasks.length).toBeGreaterThan(0);
    expect(existsSync(join(tempDir, 'tasks', 'todo.md'))).toBe(true);
  }, 20000);

  test('flow continues in one-shot mode even when plan gate fails', async () => {
    const tool = createWeaveTool();

    await tool.execute(
      { command: 'prepare', docsPath: 'docs' },
      { worktree: tempDir },
    );

    const manager = getPhaseManager(tempDir);
    const plan = await manager.loadPlan();
    expect(plan).not.toBeNull();

    if (!plan || plan.phases.length === 0) {
      throw new Error('plan setup failed');
    }

    const phase = plan.phases[0];
    phase.doneWhen = '';
    phase.tasks = [
      {
        id: `${phase.id}-T1`,
        name: `${phase.name} 구현`,
        status: 'pending',
        retryCount: 0,
        maxRetries: 1,
      },
    ];
    await manager.savePlan(plan);

    const output = await tool.execute(
      { command: 'flow' },
      { worktree: tempDir },
    );

    expect(output).toContain('⚠️ Plan gate failed, but flow continues in one-shot mode.');
    expect(output).toContain('### 2) Craft');
    expect(output).toContain('### 3) Verify');
    expect(output).toContain('### 4) Finalize');
  }, 20000);

  test('research command writes persistent artifact', async () => {
    const tool = createWeaveTool();

    const output = await tool.execute(
      { command: 'research', docsPath: 'docs' },
      { worktree: tempDir },
    );

    expect(output).toContain('## ✅ Weave Research 완료');
    expect(output).toContain('Artifact: `tasks/research.md`');
    expect(existsSync(join(tempDir, 'tasks', 'research.md'))).toBe(true);

    const report = readFileSync(join(tempDir, 'tasks', 'research.md'), 'utf-8');
    expect(report).toContain('## Existing Implementations & Reuse Candidates');
    expect(report).toContain('## Duplicate Implementation Signals');
    expect(report).toContain('## Problem Reproduction Flow');
    expect(report).toContain('## Before Context (Current State)');
    expect(report).toContain('## After Context (Target Intent)');
  }, 20000);

  test('prepare auto-splits oversized plans into shard plan files', async () => {
    const tool = createWeaveTool();
    const largeDocs = seedLargeDocs(tempDir);

    const output = await tool.execute(
      { command: 'prepare', docsPath: largeDocs, planName: 'mega-app' },
      { worktree: tempDir },
    );

    expect(output).toContain('Auto-Split');
    expect(output).toContain('mega-app-s1');

    const plansDir = join(tempDir, '.opencode', 'weave', 'plans');
    const shardFiles = readdirSync(plansDir).filter(name => /^mega-app-s\d+\.yaml$/.test(name));
    expect(shardFiles.length).toBeGreaterThan(1);

    const manager = getPhaseManager(tempDir);
    const activePlan = await manager.loadPlan();
    expect(activePlan).not.toBeNull();
    expect(activePlan?.planRole).toBe('shard');
    expect(activePlan?.planName).toBe('mega-app-s1');
    expect(activePlan?.shardTotal).toBeGreaterThan(1);

    const allPlans = await manager.loadAllPlans();
    const shards = allPlans.filter(plan => plan.planName?.startsWith('mega-app-s'));
    expect(shards.length).toBeGreaterThan(1);
    for (const shard of shards) {
      expect(shard.phases.length).toBeLessThanOrEqual(3);
      for (const phase of shard.phases) {
        expect(phase.tasks.length).toBeGreaterThan(0);
      }
    }
  }, 20000);

  test('refine-plan applies plan-notes directives and resets approval', async () => {
    const tool = createWeaveTool();

    await tool.execute(
      { command: 'flow', docsPath: 'docs' },
      { worktree: tempDir },
    );

    const notesDir = join(tempDir, 'tasks');
    mkdirSync(notesDir, { recursive: true });
    writeFileSync(
      join(notesDir, 'plan-notes.md'),
      [
        '@phase P1 done_when: 유저가 이메일/비밀번호로 로그인할 수 있다',
        '@phase P1 add_task: 로그인 API 구현 | test=로그인 성공 시 200 반환 | retries=2',
      ].join('\n'),
      'utf-8',
    );

    const output = await tool.execute(
      { command: 'refine-plan' },
      { worktree: tempDir },
    );

    expect(output).toContain('## 📝 Plan Refined From Notes');
    expect(output).toContain('Applied changes:');

    const manager = getPhaseManager(tempDir);
    const plan = await manager.loadPlan();
    expect(plan).not.toBeNull();
    expect(plan?.planApproved).toBe(false);

    const p1 = manager.getPhase('P1');
    expect(p1).not.toBeNull();
    expect(p1?.doneWhen).toContain('이메일/비밀번호');
    expect(p1?.tasks.some(t => t.name.includes('로그인 API 구현'))).toBe(true);
  }, 20000);

  test('approve-plan auto-applies notes and requires re-run for final approval', async () => {
    const tool = createWeaveTool();

    await tool.execute(
      { command: 'flow', docsPath: 'docs' },
      { worktree: tempDir },
    );

    const notesDir = join(tempDir, 'tasks');
    mkdirSync(notesDir, { recursive: true });
    writeFileSync(
      join(notesDir, 'plan-notes.md'),
      '@phase P1 add_checklist: 로그인 실패 메시지가 명확히 보인다\n',
      'utf-8',
    );

    const firstApprove = await tool.execute(
      { command: 'approve-plan' },
      { worktree: tempDir },
    );

    expect(firstApprove).toContain('## 📝 Plan Refined During Approve');
    expect(firstApprove).toContain('Approval paused after applying note directives.');

    const manager = getPhaseManager(tempDir);
    const midPlan = await manager.loadPlan();
    expect(midPlan).not.toBeNull();
    expect(midPlan?.planApproved).toBe(false);

    const secondApprove = await tool.execute(
      { command: 'approve-plan' },
      { worktree: tempDir },
    );

    expect(secondApprove).toContain('## ✅ Plan Approved');

    const finalPlan = await manager.loadPlan();
    expect(finalPlan).not.toBeNull();
    expect(finalPlan?.planApproved).toBe(true);
  }, 20000);

  test('flow without docs reuses active plan and prepares execution context', async () => {
    const tool = createWeaveTool();

    await tool.execute(
      { command: 'flow', docsPath: 'docs' },
      { worktree: tempDir },
    );

    await tool.execute(
      { command: 'approve-plan' },
      { worktree: tempDir },
    );

    await tool.execute(
      { command: 'flow' },
      { worktree: tempDir },
    );

    const output = await tool.execute(
      { command: 'flow' },
      { worktree: tempDir },
    );

    expect(output).toContain('Skipped (existing active plan reused).');
    expect(output).toContain('### Plan Gate');
    expect(output).toContain('### Next Steps');

    const manager = getPhaseManager(tempDir);
    await manager.loadPlan();
    const p1 = manager.getPhase('P1');
    expect(p1).not.toBeNull();
    expect(p1?.tasks[0]?.status).toBe('pending');
    expect(p1?.tasks[1]?.status).toBe('pending');
    expect(existsSync(join(tempDir, 'tasks', 'todo.md'))).toBe(true);
  }, 20000);

  test('craft is blocked until plan approval', async () => {
    const tool = createWeaveTool();

    await tool.execute(
      { command: 'prepare', docsPath: 'docs' },
      { worktree: tempDir },
    );

    const output = await tool.execute(
      { command: 'craft', phaseId: 'P1' },
      { worktree: tempDir },
    );

    expect(output).toContain('Plan approval required before implementation.');
    expect(output).toContain('weave command=approve-plan');
  }, 20000);

  test('craft prepares execution context after approval', async () => {
    const tool = createWeaveTool();

    await tool.execute(
      { command: 'flow', docsPath: 'docs' },
      { worktree: tempDir },
    );

    await tool.execute(
      { command: 'approve-plan' },
      { worktree: tempDir },
    );

    const output = await tool.execute(
      { command: 'craft', phaseId: 'P1' },
      { worktree: tempDir },
    );

    expect(output).toContain('## Phase P1:');
    expect(output).toContain('### Next Steps');

    const manager = getPhaseManager(tempDir);
    await manager.loadPlan();
    const phase = manager.getPhase('P1');
    expect(phase).not.toBeNull();
    expect(phase?.status).toBe('in_progress');
    expect(existsSync(join(tempDir, 'tasks', 'todo.md'))).toBe(true);
  }, 30000);
});
