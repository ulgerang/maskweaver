/**
 * Weave Plan Stage
 * 
 * Create phase-based execution plan from analyzed requirements.
 * Generates testable MVPs per phase with clear completion criteria.
 */

import type { WeavePhase, WeavePlan } from '../types.js';
import type { IntakeResult } from './intake.js';
import { PhaseManager, getPhaseManager } from '../phase-manager.js';

// ============================================================================
// Types
// ============================================================================

export interface PlanOptions {
    intake: IntakeResult;
    projectName: string;
    userAnswers?: Record<string, string>;  // Answers to intake questions
}

export interface PlanResult {
    plan: WeavePlan;
    summary: string;
    estimatedTotalHours: number;
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

// ============================================================================
// Main Plan Function
// ============================================================================

export async function plan(options: PlanOptions): Promise<PlanResult> {
    const { intake, projectName, userAnswers } = options;

    // Infer architecture
    const architecture = inferArchitecture(intake, userAnswers);

    // Generate phases
    const phases = generatePhases(intake, userAnswers);

    // Create vision summary
    const vision = intake.features.length > 0
        ? `${projectName}: ${intake.features.slice(0, 3).join(', ')} 등의 기능을 제공하는 애플리케이션`
        : `${projectName} 애플리케이션`;

    // Calculate total estimated hours
    const estimatedTotalHours = phases.reduce((sum, p) => sum + (p.estimatedHours || 3), 0);

    // Create plan
    const manager = getPhaseManager();
    const weavePlan = await manager.createPlan({
        projectName,
        vision,
        architecture,
        phases,
    });

    // Generate summary
    const summary = generatePlanSummary(weavePlan, estimatedTotalHours);

    return {
        plan: weavePlan,
        summary,
        estimatedTotalHours,
    };
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
