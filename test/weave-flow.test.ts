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

function seedPassingNodeProject(worktree: string): void {
  writeFileSync(
    join(worktree, 'package.json'),
    JSON.stringify({
      name: 'weave-verify-fixture',
      version: '1.0.0',
      scripts: {
        build: 'node -e "process.exit(0)"',
        test: 'node -e "process.exit(0)"',
      },
    }, null, 2),
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

function seedGdcWorkspace(worktree: string): void {
  const gdcDir = join(worktree, '.gdc');
  const nodesDir = join(gdcDir, 'nodes');
  mkdirSync(nodesDir, { recursive: true });
  writeFileSync(join(gdcDir, 'config.yaml'), 'language: ts\n', 'utf-8');
  writeFileSync(
    join(nodesDir, 'AuthService.yaml'),
    ['id: AuthService', 'kind: service'].join('\n'),
    'utf-8',
  );
}

function quoteCommandArg(input: string): string {
  return input.includes(' ') ? `"${input}"` : input;
}

function seedMockGdcConfig(
  worktree: string,
  mode: 'clean' | 'error',
  gdcOverrides: Record<string, unknown> = {},
): void {
  seedGdcWorkspace(worktree);

  const scriptPath = join(worktree, `mock-gdc-${mode}.js`);
  writeFileSync(
    scriptPath,
    [
      "import fs from 'node:fs';",
      "import path from 'node:path';",
      "const cmd = process.argv[2];",
      "const machine = process.argv.includes('--machine');",
      "if (!machine) { console.error('machine flag required'); process.exit(3); }",
      `const mode = '${mode}';`,
      "const emit = (command, data, exitCode = 0) => {",
      "  const payload = { ok: true, contractVersion: '1.0', command, data, warnings: [], errors: [] };",
      "  process.stdout.write(JSON.stringify(payload));",
      "  process.exit(exitCode);",
      "};",
      "switch (cmd) {",
      "  case 'sync':",
      "    emit('sync', { direction: 'yaml', created: 0, updated: 1, deleted: 0, dryRun: false });",
      "    break;",
      "  case 'stats':",
      "    emit('stats', { nodes: { total: 3, byStatus: { implemented: 2, tested: 1 } } });",
      "    break;",
      "  case 'graph':",
      "    emit('graph', {",
      "      nodes: [{ id: 'AuthService' }, { id: 'LoginController' }, { id: 'UserRepository' }],",
      "      edges: [{ from: 'LoginController', to: 'AuthService' }, { from: 'AuthService', to: 'UserRepository' }]",
      "    });",
      "    break;",
      "  case 'check':",
      "    if (mode === 'error') {",
      "      emit('check', { summary: { error: 1, warning: 0, info: 0 }, issues: [{ severity: 'error', message: 'missing spec' }] }, 2);",
      "    }",
      "    emit('check', { summary: { error: 0, warning: 1, info: 2 }, issues: [{ severity: 'warning', message: 'minor drift' }] });",
      "    break;",
      "  case 'extract': {",
      "    const node = process.argv[3] || 'unknown';",
      "    const outputIdx = process.argv.indexOf('--output');",
      "    const outputRel = outputIdx >= 0 ? process.argv[outputIdx + 1] : `tasks/context/${node}.md`;",
      "    const outputAbs = path.resolve(process.cwd(), outputRel);",
      "    fs.mkdirSync(path.dirname(outputAbs), { recursive: true });",
      "    fs.writeFileSync(outputAbs, `# Context for ${node}\\n`, 'utf-8');",
      "    emit('extract', { node, output: { path: outputRel, bytes: fs.statSync(outputAbs).size } });",
      "    break;",
      "  }",
      "  default:",
      "    emit(cmd || 'unknown', {});",
      "}",
    ].join('\n'),
    'utf-8',
  );

  const binPath = `${quoteCommandArg(process.execPath)} ${quoteCommandArg(scriptPath)}`;
  const gdcConfig = {
    enabled: true,
    strictVerify: true,
    autoSyncOnPrepare: true,
    binPath,
    ...gdcOverrides,
  };

  writeFileSync(
    join(worktree, 'maskweaver.config.json'),
    JSON.stringify({ gdc: gdcConfig }, null, 2),
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
    expect(p1?.tasks.every(task => task.status === 'passed')).toBe(true);
    expect(existsSync(join(tempDir, 'tasks', 'todo.md'))).toBe(true);
  }, 20000);

  test('flow finalization advances todo focus to the next incomplete phase', async () => {
    const tool = createWeaveTool();

    await tool.execute(
      { command: 'flow', docsPath: 'docs' },
      { worktree: tempDir },
    );

    const todo = readFileSync(join(tempDir, 'tasks', 'todo.md'), 'utf-8');
    expect(todo).toContain('- Focus phase: `P2`');
    expect(todo).not.toContain('- Focus phase: `P1`');
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
    expect(report).toContain('## GDC Node Coverage');
    expect(report).toContain('## Dependency Blast Radius');
    expect(report).toContain('## Existing Spec vs Implementation Drift');
    expect(report).toContain('## Candidate Reuse Nodes');
  }, 20000);

  test('init bootstraps weave files and shows GDC guidance when missing', async () => {
    const tool = createWeaveTool();

    const output = await tool.execute(
      { command: 'init' },
      { worktree: tempDir },
    );

    expect(output).toContain('## ✅ Weave 초기화 완료!');
    expect(output).toContain('### GDC Integration');
    expect(output).toContain('GDC workspace was not detected');

    expect(existsSync(join(tempDir, '.ignore'))).toBe(true);
    expect(existsSync(join(tempDir, '.opencode', 'weave', 'state.yaml'))).toBe(true);
    expect(existsSync(join(tempDir, '.opencode', 'weave', 'plans'))).toBe(true);
  }, 20000);

  test('init probes gdc and runs sync/check when workspace is detected', async () => {
    seedMockGdcConfig(tempDir, 'clean');

    const tool = createWeaveTool();
    const output = await tool.execute(
      { command: 'init' },
      { worktree: tempDir },
    );

    expect(output).toContain('### GDC Integration');
    expect(output).toContain('- version: PASS');
    expect(output).toContain('- sync: PASS');
    expect(output).toContain('- check: PASS');
    expect(output).toContain('node stats: total=3');
  }, 20000);

  test('verify runs GDC pre-gate when GDC config is enabled', async () => {
    seedMockGdcConfig(tempDir, 'clean');

    const tool = createWeaveTool();
    const output = await tool.execute(
      { command: 'verify' },
      { worktree: tempDir },
    );

    expect(output).toContain('### GDC Pre-Verify Gate');
    expect(output).toContain('✅ GDC gate passed.');
  }, 20000);

  test('verify skips GDC gate when workspace is not detected', async () => {
    const tool = createWeaveTool();
    const output = await tool.execute(
      { command: 'verify' },
      { worktree: tempDir },
    );

    expect(output).not.toContain('### GDC Pre-Verify Gate');
  }, 20000);

  test('verify skips GDC gate when integration is disabled', async () => {
    seedMockGdcConfig(tempDir, 'clean', { enabled: false, strictVerify: true });

    const tool = createWeaveTool();
    const output = await tool.execute(
      { command: 'verify' },
      { worktree: tempDir },
    );

    expect(output).not.toContain('### GDC Pre-Verify Gate');
  }, 20000);

  test('verify blocks when GDC check returns blocking errors', async () => {
    seedMockGdcConfig(tempDir, 'error');

    const tool = createWeaveTool();
    const output = await tool.execute(
      { command: 'verify' },
      { worktree: tempDir },
    );

    expect(output).toContain('### GDC Pre-Verify Gate');
    expect(output).toContain('❌ Verification failed at: GDC Check');
  }, 20000);

  test('verify continues in lenient mode when GDC sync command is unavailable', async () => {
    seedGdcWorkspace(tempDir);
    writeFileSync(
      join(tempDir, 'maskweaver.config.json'),
      JSON.stringify({
        gdc: {
          enabled: true,
          strictVerify: false,
          autoSyncOnPrepare: true,
          binPath: 'definitely-missing-gdc-binary',
        },
      }, null, 2),
      'utf-8',
    );

    const tool = createWeaveTool();
    const output = await tool.execute(
      { command: 'verify' },
      { worktree: tempDir },
    );

    expect(output).toContain('### GDC Pre-Verify Gate');
    expect(output).toContain('⚠️ Proceeding without strict GDC sync gate (lenient mode).');
    expect(output).not.toContain('❌ Verification failed at: GDC Sync');
  }, 20000);

  test('status includes gdc dashboard section', async () => {
    seedMockGdcConfig(tempDir, 'clean');

    const tool = createWeaveTool();
    await tool.execute(
      { command: 'prepare', docsPath: 'docs' },
      { worktree: tempDir },
    );

    const output = await tool.execute(
      { command: 'status' },
      { worktree: tempDir },
    );

    expect(output).toContain('### GDC Status');
    expect(output).toContain('Detected: yes');
    expect(output).toContain('Node specs:');
    expect(output).toContain('- Active change: `docs`');
    expect(output).toContain('- Known changes: `docs`');
  }, 20000);

  test('prepare runs GDC sync when autoSyncOnPrepare is enabled', async () => {
    seedMockGdcConfig(tempDir, 'clean', { autoSyncOnPrepare: true });

    const tool = createWeaveTool();
    const output = await tool.execute(
      { command: 'prepare', docsPath: 'docs' },
      { worktree: tempDir },
    );

    expect(output).toContain('### GDC Prepare Sync');
    expect(output).toContain('- sync: PASS');
  }, 20000);

  test('prepare creates an active change artifact linked to the plan', async () => {
    const tool = createWeaveTool();

    await tool.execute(
      { command: 'prepare', docsPath: 'docs' },
      { worktree: tempDir },
    );

    const manager = getPhaseManager(tempDir);
    const plan = await manager.loadPlan();
    expect(plan).not.toBeNull();
    expect(plan?.activeChangeId).toBe('docs');
    expect(plan?.changeIds).toContain('docs');

    const changeDir = join(tempDir, '.opencode', 'weave', 'changes', 'docs');
    expect(existsSync(changeDir)).toBe(true);

    const metadataPath = join(changeDir, 'metadata.yaml');
    expect(existsSync(metadataPath)).toBe(true);

    const metadata = readFileSync(metadataPath, 'utf-8');
    expect(metadata).toContain('change_id: docs');
    expect(metadata).toContain('status: active');
    expect(metadata).toContain('plan_name: docs');

    expect(existsSync(join(changeDir, 'proposal.md'))).toBe(true);
    expect(existsSync(join(changeDir, 'design.md'))).toBe(true);
    expect(existsSync(join(changeDir, 'tasks.md'))).toBe(true);
    expect(existsSync(join(changeDir, 'verify.md'))).toBe(true);
    expect(existsSync(join(changeDir, 'archive.md'))).toBe(true);
  }, 20000);

  test('prepare creates gdc-aware task metadata when graph is available', async () => {
    seedMockGdcConfig(tempDir, 'clean', { autoSyncOnPrepare: true });

    const tool = createWeaveTool();
    await tool.execute(
      { command: 'prepare', docsPath: 'docs' },
      { worktree: tempDir },
    );

    const manager = getPhaseManager(tempDir);
    const plan = await manager.loadPlan();
    expect(plan).not.toBeNull();

    const p1 = manager.getPhase('P1');
    expect(p1).not.toBeNull();
    expect(p1?.tasks.length).toBeGreaterThan(0);
    expect((p1?.tasks[0]?.nodeIds || []).length).toBeGreaterThan(0);
    expect(p1?.tasks.every(task => (task.changeRefs || []).includes('docs'))).toBe(true);
    expect((p1?.tasks[1]?.dependsOn || [])[0]).toBe('P1-T1');
    expect((p1?.tasks[2]?.dependsOn || [])[0]).toBe('P1-T2');
    expect((p1?.tasks[0]?.verify || []).length).toBeGreaterThan(0);
  }, 20000);

  test('prepare skips GDC sync when autoSyncOnPrepare is disabled', async () => {
    seedMockGdcConfig(tempDir, 'clean', { autoSyncOnPrepare: false });

    const tool = createWeaveTool();
    const output = await tool.execute(
      { command: 'prepare', docsPath: 'docs' },
      { worktree: tempDir },
    );

    expect(output).not.toContain('### GDC Prepare Sync');
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
    expect(p1?.tasks[0]?.status).toBe('passed');
    expect(p1?.tasks[1]?.status).toBe('passed');
    expect(existsSync(join(tempDir, 'tasks', 'todo.md'))).toBe(true);
  }, 20000);

  test('flow stops before finalize when GDC gate fails', async () => {
    seedMockGdcConfig(tempDir, 'error');

    const tool = createWeaveTool();
    const output = await tool.execute(
      { command: 'flow', docsPath: 'docs' },
      { worktree: tempDir },
    );

    expect(output).toContain('### 3) Verify');
    expect(output).toContain('❌ Verification failed at: GDC Check');
    expect(output).not.toContain('### 4) Finalize');
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

  test('approve-plan with phaseId finalizes the crafted phase', async () => {
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

    const output = await tool.execute(
      { command: 'approve-plan', phaseId: 'P1' },
      { worktree: tempDir },
    );

    expect(output).toContain('AI Verification Results');
    expect(output).toContain('Phase P1');

    const manager = getPhaseManager(tempDir);
    await manager.loadPlan();
    const phase = manager.getPhase('P1');
    expect(phase).not.toBeNull();
    expect(phase?.status).toBe('completed');
    expect(phase?.tasks.every(task => task.status === 'passed')).toBe(true);
  }, 30000);

  test('craft generates gdc extract context files for linked nodes', async () => {
    seedMockGdcConfig(tempDir, 'clean', { autoSyncOnPrepare: true });

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
      { command: 'craft', phaseId: 'P1' },
      { worktree: tempDir },
    );

    expect(output).toContain('### GDC Context Files');
    expect(output).toContain('### GDC Extract Context');
    expect(output).toContain('.opencode/weave/changes/docs/context/');

    const contextDir = join(tempDir, 'tasks', 'context');
    expect(existsSync(contextDir)).toBe(true);
    const contextFiles = readdirSync(contextDir).filter(name => name.endsWith('.md'));
    expect(contextFiles.length).toBeGreaterThan(0);

    const changeContextDir = join(tempDir, '.opencode', 'weave', 'changes', 'docs', 'context');
    expect(existsSync(changeContextDir)).toBe(true);
    const changeContextFiles = readdirSync(changeContextDir).filter(name => name.endsWith('.md'));
    expect(changeContextFiles.length).toBeGreaterThan(0);

    const todo = readFileSync(join(tempDir, 'tasks', 'todo.md'), 'utf-8');
    expect(todo).toContain('## GDC Context');
  }, 30000);

  test('verify records report into the active change and marks it verified', async () => {
    seedPassingNodeProject(tempDir);

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

    const output = await tool.execute(
      { command: 'verify', verifyMode: 'quick' },
      { worktree: tempDir },
    );

    expect(output).toContain('Verification passed');

    const verifyReport = readFileSync(
      join(tempDir, '.opencode', 'weave', 'changes', 'docs', 'verify.md'),
      'utf-8',
    );
    expect(verifyReport).toContain('# Verify');
    expect(verifyReport).toContain('## Report');
    expect(verifyReport).toContain('## AI Verification Results');
    expect(verifyReport).toContain('Verification passed');

    const metadata = readFileSync(
      join(tempDir, '.opencode', 'weave', 'changes', 'docs', 'metadata.yaml'),
      'utf-8',
    );
    expect(metadata).toContain('status: verified');
  }, 30000);
});
