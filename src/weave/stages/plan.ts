/**
 * Weave Plan Stage
 * 
 * Create phase-based execution plan from analyzed requirements.
 * Generates testable MVPs per phase with clear completion criteria.
 */

import type { WeavePhase, WeavePlan } from '../types.js';
import type { IntakeResult } from './intake.js';
import { getPhaseManager } from '../phase-manager.js';
import {
    getEffectiveGdcConfig,
    runGdcMachineCommand,
    getGraphNodeIds,
    getGraphEdges,
    countGdcCheckIssues,
} from '../gdc.js';

// ============================================================================
// Types
// ============================================================================

export interface PlanOptions {
    intake: IntakeResult;
    projectName: string;
    /** Optional stable identifier used for plan filename/state.yaml */
    planName?: string;
    /** Base path for .opencode/weave (defaults to process.cwd()) */
    basePath?: string;
    userAnswers?: Record<string, string>;  // Answers to intake questions
    /** Auto-split oversized plans into multiple shard plan files (default: true). */
    splitPlans?: boolean;
    /** Max phases per shard plan when splitting (default: 3). */
    splitMaxPhases?: number;
    /** Max estimated hours per shard plan when splitting (default: 10). */
    splitMaxHours?: number;
}

export interface PlanResult {
    plan: WeavePlan;
    summary: string;
    estimatedTotalHours: number;
    splitApplied?: boolean;
    createdPlanNames?: string[];
}

// ============================================================================
// Phase Size Estimation
// ============================================================================

const PHASE_SIZE_GUIDE = {
    tooSmall: ['변수명 변경', '오타 수정'],
    justRight: ['UI 컴포넌트 하나', '저장 기능', 'API 엔드포인트 하나'],
    tooBig: ['전체 인증 시스템', '전체 CRUD', '전체 UI'],
    targetHours: { min: 2, max: 6 },
};

const SPLIT_DEFAULTS = {
    enabled: true,
    maxPhasesPerShard: 3,
    maxHoursPerShard: 10,
    triggerMinPhases: 6,
    triggerMinHours: 18,
};

type GeneratedPhase = Omit<WeavePhase, 'tasks'>;

type SplitConfig = {
    enabled: boolean;
    maxPhasesPerShard: number;
    maxHoursPerShard: number;
    triggerMinPhases: number;
    triggerMinHours: number;
};

function resolveSplitConfig(options: PlanOptions): SplitConfig {
    const enabled = options.splitPlans ?? SPLIT_DEFAULTS.enabled;
    const maxPhasesPerShard = Math.max(2, Math.min(8, Math.floor(options.splitMaxPhases ?? SPLIT_DEFAULTS.maxPhasesPerShard)));
    const maxHoursPerShard = Math.max(4, Math.min(40, Math.floor(options.splitMaxHours ?? SPLIT_DEFAULTS.maxHoursPerShard)));

    return {
        enabled,
        maxPhasesPerShard,
        maxHoursPerShard,
        triggerMinPhases: Math.max(maxPhasesPerShard + 1, SPLIT_DEFAULTS.triggerMinPhases),
        triggerMinHours: Math.max(maxHoursPerShard + 4, SPLIT_DEFAULTS.triggerMinHours),
    };
}

function shouldSplitPlan(phases: GeneratedPhase[], totalHours: number, config: SplitConfig): boolean {
    if (!config.enabled) return false;
    if (phases.length <= 1) return false;

    if (phases.length >= config.triggerMinPhases) return true;
    if (totalHours >= config.triggerMinHours) return true;
    if (phases.length > config.maxPhasesPerShard) return true;
    if (totalHours > config.maxHoursPerShard) return true;

    return false;
}

function normalizePlanName(base: string): string {
    return base.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'weave-plan';
}

function createShardPlanName(rootPlanName: string, shardIndex: number): string {
    return `${rootPlanName}-s${shardIndex}`;
}

function partitionPhases(phases: GeneratedPhase[], config: SplitConfig): GeneratedPhase[][] {
    const groups: GeneratedPhase[][] = [];
    let current: GeneratedPhase[] = [];
    let currentHours = 0;

    for (const phase of phases) {
        const phaseHours = phase.estimatedHours || 3;
        const shouldFlush = current.length > 0 && (
            current.length >= config.maxPhasesPerShard
            || (currentHours + phaseHours > config.maxHoursPerShard)
        );

        if (shouldFlush) {
            groups.push(current);
            current = [];
            currentHours = 0;
        }

        current.push(phase);
        currentHours += phaseHours;
    }

    if (current.length > 0) {
        groups.push(current);
    }

    return groups;
}

function remapShardPhases(phases: GeneratedPhase[]): GeneratedPhase[] {
    const idMap = new Map<string, string>();
    phases.forEach((phase, idx) => {
        idMap.set(phase.id, `P${idx + 1}`);
    });

    return phases.map((phase, idx) => {
        const remappedId = idMap.get(phase.id) || `P${idx + 1}`;
        const remappedDeps = (phase.dependsOn || [])
            .map(dep => idMap.get(dep) || '')
            .filter(Boolean);

        return {
            ...phase,
            id: remappedId,
            status: 'pending',
            dependsOn: remappedDeps.length > 0
                ? Array.from(new Set(remappedDeps))
                : (idx > 0 ? [`P${idx}`] : undefined),
        };
    });
}

function appendShardNote(baseNotes: string | undefined, shardIndex: number, shardTotal: number, shardScope: string): string {
    const notes: string[] = [];
    if (baseNotes && baseNotes.trim().length > 0) {
        notes.push(baseNotes.trim());
    }
    notes.push(`Shard ${shardIndex}/${shardTotal} scope: ${shardScope}`);
    notes.push('This shard is part of an auto-split oversized plan.');
    return notes.join(' | ');
}

function buildSplitSummary(
    rootPlanName: string,
    shards: Array<{ plan: WeavePlan; hours: number; scope: string }>,
    totalHours: number
): string {
    const lines: string[] = [];
    lines.push('## 📋 실행 계획서 (Auto-Split)');
    lines.push('');
    lines.push(`Oversized plan detected. Split into ${shards.length} shard plans for focused execution.`);
    lines.push(`Root name: \`${rootPlanName}\``);
    lines.push('');
    lines.push('| Shard | Plan | Scope | Est. Hours |');
    lines.push('|-------|------|-------|------------|');

    for (let i = 0; i < shards.length; i += 1) {
        const shard = shards[i];
        lines.push(`| ${i + 1}/${shards.length} | \`${shard.plan.planName}\` | ${shard.scope} | ${shard.hours}h |`);
    }

    lines.push('');
    lines.push(`**총 예상 시간**: ${totalHours}시간`);
    lines.push(`**활성 플랜**: \`${shards[0]?.plan.planName || rootPlanName}\``);
    lines.push('');
    lines.push('Next: approve current shard, then run craft. Next shard is auto-activated when current shard is completed.');
    return lines.join('\n');
}

// ============================================================================
// Architecture Inference
// ============================================================================

function inferArchitecture(
    intake: IntakeResult,
    userAnswers?: Record<string, string>
): WeavePlan['architecture'] {
    const arch: WeavePlan['architecture'] = {
        notes: '아키텍처는 진행하면서 조정될 수 있습니다',
    };

    // From detected requirements
    if (intake.technicalRequirements.frontend?.length) {
        arch.frontend = intake.technicalRequirements.frontend.join(' + ');
    }
    if (intake.technicalRequirements.backend?.length) {
        arch.backend = intake.technicalRequirements.backend.join(' + ');
    }
    if (intake.technicalRequirements.database?.length) {
        arch.database = intake.technicalRequirements.database.join(' + ');
    }

    // From user answers
    if (userAnswers) {
        for (const [key, value] of Object.entries(userAnswers)) {
            if (key.includes('프론트엔드') || key.includes('frontend')) {
                arch.frontend = value;
            }
            if (key.includes('데이터') || key.includes('database') || key.includes('저장')) {
                arch.database = value;
            }
        }
    }

    // Defaults
    if (!arch.frontend) arch.frontend = 'React + Vite';
    if (!arch.database) arch.database = 'LocalStorage (Phase 1-3)';

    return arch;
}

// ============================================================================
// Phase Generation
// ============================================================================

function generatePhases(
    intake: IntakeResult,
    userAnswers?: Record<string, string>
): Omit<WeavePhase, 'tasks'>[] {
    const phases: Omit<WeavePhase, 'tasks'>[] = [];
    const features = intake.features;

    // Determine priority order
    let prioritizedFeatures = [...features];
    if (userAnswers) {
        const priorityAnswer = Object.entries(userAnswers).find(([k]) =>
            k.includes('우선순위') || k.includes('priority')
        );
        if (priorityAnswer) {
            const priority = priorityAnswer[1];
            // Move priority feature to front
            prioritizedFeatures = [
                priority,
                ...features.filter(f => f !== priority)
            ];
        }
    }

    // Generate phases from features
    let phaseNum = 1;
    for (const feature of prioritizedFeatures.slice(0, 8)) {
        const phaseId = `P${phaseNum}`;

        // Create completion criteria
        const doneWhen = `유저가 ${feature.toLowerCase().replace(/[을를이가은는]/g, '')}할 수 있다`;

        // Create checklist items
        const checklist = [
            `${feature} 관련 UI가 표시되는가?`,
            `기능이 정상 동작하는가?`,
            `에러 없이 작동하는가?`,
        ];

        phases.push({
            id: phaseId,
            name: feature.length > 30 ? feature.slice(0, 27) + '...' : feature,
            status: 'pending',
            doneWhen,
            checklist,
            estimatedHours: 3,  // Default estimate
            dependsOn: phaseNum > 1 ? [`P${phaseNum - 1}`] : undefined,
        });

        phaseNum++;
    }

    return phases;
}

type GdcPlanningSignals = {
    enabled: boolean;
    notes: string[];
    nodeIds: string[];
    edges: Array<{ from: string; to: string }>;
    nodeFileMap: Map<string, string[]>;
};

function asObject(value: unknown): Record<string, unknown> | null {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    return value as Record<string, unknown>;
}

function asArray(value: unknown): unknown[] {
    return Array.isArray(value) ? value : [];
}

function tokenizeNeedles(input: string): string[] {
    const lower = input.toLowerCase();
    const parts = lower.split(/[^a-z0-9가-힣]+/g).map(p => p.trim()).filter(Boolean);
    const tokens = new Set<string>();
    for (const part of parts) {
        if (part.length >= 3) tokens.add(part);
    }
    if (lower.trim().length >= 3) tokens.add(lower.trim());
    return Array.from(tokens);
}

function buildNeedlesFromIntake(intake: IntakeResult): string[] {
    const tokens = new Set<string>();
    for (const feature of intake.features.slice(0, 20)) {
        for (const token of tokenizeNeedles(feature)) tokens.add(token);
    }
    return Array.from(tokens);
}

function extractGraphNodeFileMap(data: unknown): Map<string, string[]> {
    const payload = asObject(data);
    const nodes = asArray(payload?.nodes);
    const nodeFileMap = new Map<string, string[]>();

    for (const node of nodes) {
        const item = asObject(node);
        const nodeId = typeof item?.id === 'string' ? item.id : '';
        if (!nodeId) continue;

        const files = new Set<string>();
        const directFile = typeof item?.file === 'string' ? item.file : '';
        const directPath = typeof item?.path === 'string' ? item.path : '';
        const implPath = typeof item?.implPath === 'string' ? item.implPath : '';
        if (directFile) files.add(directFile);
        if (directPath) files.add(directPath);
        if (implPath) files.add(implPath);

        const sourceFiles = asArray(item?.sourceFiles);
        for (const source of sourceFiles) {
            if (typeof source === 'string' && source.trim()) files.add(source.trim());
        }

        if (files.size > 0) {
            nodeFileMap.set(nodeId, Array.from(files));
        }
    }

    return nodeFileMap;
}

async function collectGdcPlanningSignals(basePath: string | undefined, intake: IntakeResult): Promise<GdcPlanningSignals> {
    const notes: string[] = [];
    const runtimeBase = basePath || process.cwd();
    const gdc = getEffectiveGdcConfig(runtimeBase);
    if (!gdc.enabled) {
        return {
            enabled: false,
            notes,
            nodeIds: [],
            edges: [],
            nodeFileMap: new Map<string, string[]>(),
        };
    }

    const [graphResult, checkResult] = await Promise.all([
        runGdcMachineCommand({
            basePath: runtimeBase,
            command: 'graph',
            args: ['--format', 'json'],
            config: gdc,
            timeoutMs: 45_000,
        }),
        runGdcMachineCommand({
            basePath: runtimeBase,
            command: 'check',
            config: gdc,
            timeoutMs: 45_000,
        }),
    ]);

    if (graphResult.exitCode !== 0) {
        notes.push(`GDC graph command failed (exit=${graphResult.exitCode}). Falling back to sequential planning.`);
        return {
            enabled: false,
            notes,
            nodeIds: [],
            edges: [],
            nodeFileMap: new Map<string, string[]>(),
        };
    }

    const checkCounts = countGdcCheckIssues(checkResult.data);
    if (checkResult.exitCode === 2 || checkCounts.errors > 0) {
        notes.push(`GDC check reports drift/issues (errors=${checkCounts.errors}, warnings=${checkCounts.warnings}).`);
    }

    const nodeIds = getGraphNodeIds(graphResult.data);
    const edges = getGraphEdges(graphResult.data);
    const nodeFileMap = extractGraphNodeFileMap(graphResult.data);
    const featureNeedles = buildNeedlesFromIntake(intake);
    const featureMatched = nodeIds.filter(nodeId => {
        const lower = nodeId.toLowerCase();
        return featureNeedles.some(needle => lower.includes(needle));
    });

    if (featureMatched.length > 0) {
        notes.push(`GDC feature-matched nodes: ${featureMatched.slice(0, 6).join(', ')}`);
    } else if (nodeIds.length > 0) {
        notes.push(`GDC graph loaded (${nodeIds.length} nodes), but no direct feature-name matches were found.`);
    }

    return {
        enabled: nodeIds.length > 0,
        notes,
        nodeIds,
        edges,
        nodeFileMap,
    };
}

function selectPhaseNodeIds(
    phase: Omit<WeavePhase, 'tasks'>,
    intakeNeedles: string[],
    nodeIds: string[]
): string[] {
    if (nodeIds.length === 0) return [];

    const phaseNeedles = new Set<string>([
        ...intakeNeedles,
        ...tokenizeNeedles(phase.name),
        ...tokenizeNeedles(phase.doneWhen),
    ]);

    const scored = nodeIds
        .map(nodeId => {
            const lower = nodeId.toLowerCase();
            let score = 0;
            for (const needle of phaseNeedles) {
                if (needle && lower.includes(needle)) score += needle.length >= 6 ? 2 : 1;
            }
            return { nodeId, score };
        })
        .filter(item => item.score > 0)
        .sort((a, b) => b.score - a.score || a.nodeId.localeCompare(b.nodeId));

    if (scored.length === 0) {
        const phaseIndex = Number((phase.id || '').replace(/[^0-9]/g, ''));
        const offset = Number.isFinite(phaseIndex) && phaseIndex > 0
            ? (phaseIndex - 1) % nodeIds.length
            : 0;
        const rotated = [...nodeIds.slice(offset), ...nodeIds.slice(0, offset)];
        return rotated.slice(0, Math.min(3, nodeIds.length));
    }

    return scored.slice(0, 4).map(item => item.nodeId);
}

function inferPhaseDependenciesFromGraph(
    phases: Array<Omit<WeavePhase, 'tasks'>>,
    phaseNodeMap: Map<string, string[]>,
    edges: Array<{ from: string; to: string }>
): Array<Omit<WeavePhase, 'tasks'>> {
    const edgeSet = new Set<string>(edges.map(edge => `${edge.from}->${edge.to}`));

    return phases.map((phase, idx) => {
        if (idx === 0) {
            return { ...phase, dependsOn: undefined };
        }

        const currentNodes = new Set(phaseNodeMap.get(phase.name) || []);
        const deps = new Set<string>();

        for (let prevIdx = 0; prevIdx < idx; prevIdx += 1) {
            const prev = phases[prevIdx];
            const prevNodes = phaseNodeMap.get(prev.name) || [];
            const related = prevNodes.some(prevNode => {
                for (const current of currentNodes) {
                    if (edgeSet.has(`${current}->${prevNode}`)) {
                        return true;
                    }
                }
                return false;
            });

            if (related) deps.add(prev.id);
        }

        if (deps.size === 0) {
            deps.add(phases[idx - 1].id);
        }

        return {
            ...phase,
            dependsOn: Array.from(deps),
        };
    });
}

// ============================================================================
// Main Plan Function
// ============================================================================

export async function plan(options: PlanOptions): Promise<PlanResult> {
    const { intake, projectName, userAnswers, planName, basePath } = options;

    // Infer architecture
    const architecture = inferArchitecture(intake, userAnswers);

    // Generate phases
    let phases = generatePhases(intake, userAnswers);
    const gdcSignals = await collectGdcPlanningSignals(basePath, intake);
    const intakeNeedles = buildNeedlesFromIntake(intake);
    const phaseNodeMap = new Map<string, string[]>();

    if (gdcSignals.enabled) {
        for (const phase of phases) {
            phaseNodeMap.set(phase.name, selectPhaseNodeIds(phase, intakeNeedles, gdcSignals.nodeIds));
        }
        phases = inferPhaseDependenciesFromGraph(phases, phaseNodeMap, gdcSignals.edges);

        const gdcNote = gdcSignals.notes.join(' | ').trim();
        if (gdcNote) {
            architecture.notes = architecture.notes
                ? `${architecture.notes} | ${gdcNote}`
                : gdcNote;
        }
    }

    // Create vision summary
    const vision = intake.features.length > 0
        ? `${projectName}: ${intake.features.slice(0, 3).join(', ')} 등의 기능을 제공하는 애플리케이션`
        : `${projectName} 애플리케이션`;

    // Calculate total estimated hours
    const estimatedTotalHours = phases.reduce((sum, p) => sum + (p.estimatedHours || 3), 0);

    const normalizedPlanName = normalizePlanName(planName || toKebabCase(projectName) || 'weave-plan');
    const splitConfig = resolveSplitConfig(options);
    const manager = getPhaseManager(basePath);

    if (shouldSplitPlan(phases, estimatedTotalHours, splitConfig)) {
        const groups = partitionPhases(phases, splitConfig);

        // If partitioning still yields one group, keep the standard single-plan flow.
        if (groups.length > 1) {
            const createdShards: Array<{ plan: WeavePlan; hours: number; scope: string }> = [];

            for (let i = 0; i < groups.length; i += 1) {
                const shardIndex = i + 1;
                const shardOriginalPhases = groups[i];
                const shardPhases = remapShardPhases(shardOriginalPhases);
                const shardPlanName = createShardPlanName(normalizedPlanName, shardIndex);
                const nextPlanName = shardIndex < groups.length
                    ? createShardPlanName(normalizedPlanName, shardIndex + 1)
                    : undefined;

                const shardScope = shardOriginalPhases.map(phase => phase.name).join(', ');
                const shardHours = shardOriginalPhases.reduce((sum, phase) => sum + (phase.estimatedHours || 3), 0);

                const shardPlan = await manager.createPlan({
                    planName: shardPlanName,
                    projectName,
                    vision: `${vision} (Shard ${shardIndex}/${groups.length})`,
                    architecture: {
                        ...architecture,
                        notes: appendShardNote(architecture.notes, shardIndex, groups.length, shardScope),
                    },
                    phases: shardPhases,
                    planRole: 'shard',
                    parentPlanName: normalizedPlanName,
                    shardIndex,
                    shardTotal: groups.length,
                    nextPlanName,
                });

                for (const phase of shardPlan.phases) {
                    const tasks = generateDefaultPhaseTasks(phase, {
                        nodeIds: phaseNodeMap.get(phase.name) || [],
                        nodeFileMap: gdcSignals.nodeFileMap,
                    });
                    if (tasks.length > 0) {
                        await manager.addTasks(phase.id, tasks);
                    }
                }

                createdShards.push({
                    plan: shardPlan,
                    hours: shardHours,
                    scope: shardScope,
                });
            }

            const firstShard = createdShards[0];
            if (!firstShard) {
                throw new Error('Failed to create shard plans from oversized plan');
            }

            // Set active shard to the first one for immediate execution.
            await manager.savePlan(firstShard.plan);

            return {
                plan: firstShard.plan,
                summary: buildSplitSummary(normalizedPlanName, createdShards, estimatedTotalHours),
                estimatedTotalHours,
                splitApplied: true,
                createdPlanNames: createdShards.map(shard => shard.plan.planName || ''),
            };
        }
    }

    // Standard single-plan flow
    const weavePlan = await manager.createPlan({
        planName: normalizedPlanName,
        projectName,
        vision,
        architecture,
        phases,
        planRole: 'standalone',
    });

    // vNext: Generate a baseline executable task list per phase
    for (const phase of weavePlan.phases) {
        const tasks = generateDefaultPhaseTasks(phase, {
            nodeIds: phaseNodeMap.get(phase.name) || [],
            nodeFileMap: gdcSignals.nodeFileMap,
        });
        if (tasks.length > 0) {
            await manager.addTasks(phase.id, tasks);
        }
    }

    // Generate summary
    const summary = generatePlanSummary(weavePlan, estimatedTotalHours);

    return {
        plan: weavePlan,
        summary,
        estimatedTotalHours,
        splitApplied: false,
        createdPlanNames: [weavePlan.planName || normalizedPlanName],
    };
}

function generateDefaultPhaseTasks(
    phase: WeavePhase,
    gdc?: {
        nodeIds?: string[];
        nodeFileMap?: Map<string, string[]>;
    }
): Array<Omit<WeavePhase['tasks'][0], 'status' | 'retryCount'>> {
    // Keep tasks small, specific, and runnable. Downstream craft can refine.
    const baseId = phase.id;
    const title = phase.name;
    const nodeIds = (gdc?.nodeIds || []).slice(0, 4);
    const files = nodeIds
        .flatMap(nodeId => gdc?.nodeFileMap?.get(nodeId) || [])
        .filter(Boolean)
        .slice(0, 8);

    return [
        {
            id: `${baseId}-T1`,
            name: `${title} 구현`,
            testCase: phase.doneWhen,
            nodeIds,
            files,
            verify: [
                { kind: 'checklist', value: phase.doneWhen },
            ],
            acceptanceRefs: [
                `phase:${phase.id}`,
                `done_when:${phase.doneWhen}`,
            ],
            maxRetries: 3,
        },
        {
            id: `${baseId}-T2`,
            name: `${title} 테스트 추가/수정`,
            testCase: '관련 테스트가 통과한다',
            nodeIds,
            files,
            dependsOn: [`${baseId}-T1`],
            verify: [
                { kind: 'checklist', value: '관련 테스트가 통과한다' },
                { kind: 'command', value: 'gdc check --machine' },
            ],
            acceptanceRefs: [`phase:${phase.id}:tests`],
            maxRetries: 2,
        },
        {
            id: `${baseId}-T3`,
            name: `${title} 검증 (빌드/테스트)`,
            testCase: '빌드/테스트가 통과한다',
            dependsOn: [`${baseId}-T2`],
            verify: [
                { kind: 'command', value: 'weave command=verify' },
                { kind: 'command', value: 'gdc check --machine' },
            ],
            acceptanceRefs: [`phase:${phase.id}:verify`],
            maxRetries: 2,
        },
    ];
}

function toKebabCase(input: string): string {
    return input
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');
}

// ============================================================================
// Summary Generation
// ============================================================================

function generatePlanSummary(plan: WeavePlan, totalHours: number): string {
    const lines: string[] = [];

    lines.push(`## 📋 실행 계획서`);
    lines.push('');
    lines.push(`### 비전`);
    lines.push(plan.vision);
    lines.push('');
    lines.push(`### 아키텍처 (변경 가능)`);
    if (plan.architecture.frontend) lines.push(`- Frontend: ${plan.architecture.frontend}`);
    if (plan.architecture.backend) lines.push(`- Backend: ${plan.architecture.backend}`);
    if (plan.architecture.database) lines.push(`- Database: ${plan.architecture.database}`);
    if (plan.architecture.notes) lines.push(`- Note: ${plan.architecture.notes}`);
    lines.push('');
    lines.push(`### Phase 계획`);
    lines.push('');
    lines.push('| Phase | 이름 | 완료 조건 | 예상 시간 |');
    lines.push('|-------|------|----------|----------|');

    for (const phase of plan.phases) {
        const hours = phase.estimatedHours || 3;
        lines.push(`| ${phase.id} | ${phase.name} | ${phase.doneWhen.slice(0, 30)}... | ${hours}시간 |`);
    }

    lines.push('');
    lines.push(`**총 예상 시간**: ${totalHours}시간`);
    lines.push('');
    lines.push(`---`);
    lines.push(`이 계획이 괜찮으세요? 수정이 필요하면 말씀해주세요.`);

    return lines.join('\n');
}

// ============================================================================
// Plan Modification
// ============================================================================

export async function modifyPlan(
    modifications: {
        addPhases?: Omit<WeavePhase, 'tasks'>[];
        removePhases?: string[];
        updatePhases?: { id: string; updates: Partial<WeavePhase> }[];
        updateArchitecture?: Partial<WeavePlan['architecture']>;
    }
): Promise<WeavePlan> {
    const manager = getPhaseManager();
    const plan = await manager.loadPlan();

    if (!plan) {
        throw new Error('No plan exists to modify');
    }

    // Remove phases
    if (modifications.removePhases) {
        plan.phases = plan.phases.filter(p => !modifications.removePhases!.includes(p.id));
    }

    // Add phases
    if (modifications.addPhases) {
        plan.phases.push(...modifications.addPhases.map(p => ({ ...p, tasks: [] })));
    }

    // Update phases
    if (modifications.updatePhases) {
        for (const { id, updates } of modifications.updatePhases) {
            const phase = plan.phases.find(p => p.id === id);
            if (phase) {
                Object.assign(phase, updates);
            }
        }
    }

    // Update architecture
    if (modifications.updateArchitecture) {
        plan.architecture = { ...plan.architecture, ...modifications.updateArchitecture };
    }

    // Save
    await manager.savePlan(plan);

    return plan;
}
