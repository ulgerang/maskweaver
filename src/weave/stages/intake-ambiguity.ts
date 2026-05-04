/**
 * Weave Intake — Ambiguity Scoring
 *
 * Heuristic-based clarity measurement for BDD/Gherkin readiness.
 */

import type { GherkinScenario } from '../types.js';
import type { AmbiguityComponent, AmbiguityBreakdown, AmbiguityScore, IntakeResult } from './intake-types.js';

export const AMBIGUITY_THRESHOLD = 0.20;
export const GHERKIN_READINESS_THRESHOLD = 0.30;

const GOAL_CLARITY_WEIGHT = 0.40;
const CONSTRAINT_CLARITY_WEIGHT = 0.30;
const SUCCESS_CRITERIA_CLARITY_WEIGHT = 0.30;
const BROWNFIELD_CONTEXT_WEIGHT = 0.15;
const BROWNFIELD_GOAL_WEIGHT = 0.35;
const BROWNFIELD_CONSTRAINT_WEIGHT = 0.25;
const BROWNFIELD_CRITERIA_WEIGHT = 0.25;

const MILESTONE_DEFINITIONS: Array<{
    maxScore: number;
    label: AmbiguityScore['milestone'];
    description: string;
}> = [
    { maxScore: 1.0, label: 'initial', description: '핵심 요구사항만 파악됨. 제약조건과 성공 기준이 큰 공백.' },
    { maxScore: 0.40, label: 'progress', description: '대부분 요구사항 파악. 일부 세부사항과 경계 조건 누락.' },
    { maxScore: 0.30, label: 'refined', description: '성공 기준 일부 정의됨. 경계 조건과 비기능 요구사항 보강 필요.' },
    { maxScore: AMBIGUITY_THRESHOLD, label: 'ready', description: '모든 기준이 구체적이고 테스트 가능. Seed 생성 준비 완료.' },
];

function getMilestone(score: number): { label: AmbiguityScore['milestone']; description: string } {
    for (const m of MILESTONE_DEFINITIONS) {
        if (score <= m.maxScore) return { label: m.label, description: m.description };
    }
    return { label: 'initial', description: MILESTONE_DEFINITIONS[0].description };
}

function getNextMilestone(score: number): AmbiguityScore['nextMilestone'] {
    for (let i = MILESTONE_DEFINITIONS.length - 1; i >= 0; i--) {
        const m = MILESTONE_DEFINITIONS[i];
        if (score > m.maxScore) {
            return { threshold: m.maxScore, label: m.label, description: m.description };
        }
    }
    return undefined;
}

function buildJustification(category: string, score: number): string {
    const pct = (score * 100).toFixed(0);
    switch (category) {
        case 'goal':
            if (score >= 0.70) return `목표가 명확하고 Gherkin 시나리오로 변환 가능 (${pct}%)`;
            if (score >= 0.40) return `특징이 식별되었으나 세부사항 부족 (${pct}%)`;
            return `목표 정의가 불충분. 더 많은 질문 필요 (${pct}%)`;
        case 'constraint':
            if (score >= 0.60) return `제약조건이 잘 정의됨 (${pct}%)`;
            if (score >= 0.30) return `기술 스택은 파악되었으나 경계 조건 정의 필요 (${pct}%)`;
            return `제약조건 정의가 필요함 (${pct}%)`;
        case 'criteria':
            if (score >= 0.70) return `성공 기준이 Gherkin 시나리오로 충분히 정의됨 (${pct}%)`;
            if (score >= 0.30) return `일부 인수 조건 존재하나 보강 필요 (${pct}%)`;
            return `인수 조건이 정의되지 않음 (${pct}%)`;
        case 'context':
            if (score >= 0.60) return `기존 코드베이스 맥락이 충분히 파악됨 (${pct}%)`;
            if (score >= 0.30) return `코드베이스 맵은 있으나 세부 이해 부족 (${pct}%)`;
            return `기존 코드베이스 맥락 파악이 필요함 (${pct}%)`;
        default:
            return `Clarity: ${pct}%`;
    }
}

export function scoreAmbiguity(
    features: string[],
    techReqs: IntakeResult['technicalRequirements'],
    answers: Record<string, string>,
    gherkinScenarios?: GherkinScenario[],
    isBrownfield: boolean = false,
    codebaseMapAvailable: boolean = false,
): AmbiguityScore {
    const answerCount = Object.keys(answers).length;
    const answerDepth = Object.values(answers).reduce((sum, a) => sum + Math.min(a.length / 100, 1.0), 0);

    const hasFeatures = features.length > 0;
    const featureDetailScore = hasFeatures
        ? Math.min(features.reduce((sum, f) => sum + Math.min(f.length / 30, 1.0), 0) / Math.max(features.length, 1), 1.0)
        : 0;

    let goalClarityScore = 0.0;
    if (hasFeatures) goalClarityScore += 0.25;
    if (featureDetailScore > 0.3) goalClarityScore += 0.15;
    if (answerCount >= 3) goalClarityScore += 0.15;
    if (answerDepth >= 1.5) goalClarityScore += 0.15;
    if (gherkinScenarios && gherkinScenarios.length > 0) goalClarityScore += 0.15;
    if (answers && (answers['priority'] || Object.keys(answers).some(k => k.includes('우선순위') || k.includes('priority')))) {
        goalClarityScore += 0.15;
    }

    let constraintClarityScore = 0.0;
    const hasTechStack = (techReqs?.frontend?.length ?? 0) > 0 || (techReqs?.backend?.length ?? 0) > 0;
    if (hasTechStack) constraintClarityScore += 0.30;
    if ((techReqs?.database?.length ?? 0) > 0) constraintClarityScore += 0.15;
    if (answerCount >= 5) constraintClarityScore += 0.15;
    if (answers && Object.keys(answers).some(k => k.includes('예외') || k.includes('edge') || k.includes('에러'))) {
        constraintClarityScore += 0.20;
    }
    if (answers && Object.keys(answers).some(k => k.includes('제약') || k.includes('constraint') || k.includes('제한'))) {
        constraintClarityScore += 0.20;
    }

    let successCriteriaClarityScore = 0.0;
    if (gherkinScenarios && gherkinScenarios.length > 0) {
        const gherkinThenCount = gherkinScenarios.reduce((sum, s) => sum + s.then.length, 0);
        successCriteriaClarityScore += Math.min(gherkinThenCount * 0.10, 0.30);
        if (gherkinScenarios.some(s => s.given.length > 0)) successCriteriaClarityScore += 0.15;
        if (gherkinScenarios.some(s => s.when.length > 0)) successCriteriaClarityScore += 0.15;
        if (gherkinScenarios.length >= features.length * 2) successCriteriaClarityScore += 0.15;
    }
    if (answerCount >= 7) successCriteriaClarityScore += 0.10;
    if (answers && Object.keys(answers).some(k => k.includes('성공') || k.includes('측정') || k.includes('metric'))) {
        successCriteriaClarityScore += 0.15;
    }

    let contextClarityScore = 0.0;
    if (isBrownfield && codebaseMapAvailable) {
        contextClarityScore += 0.40;
        if (answers && Object.keys(answers).some(k => k.includes('기존') || k.includes('existing') || k.includes('구조'))) {
            contextClarityScore += 0.30;
        }
        if (answers && Object.keys(answers).some(k => k.includes('마이그레이션') || k.includes('migration') || k.includes('리팩토링') || k.includes('refactor'))) {
            contextClarityScore += 0.30;
        }
    }

    goalClarityScore = Math.min(1.0, Math.max(0.0, goalClarityScore));
    constraintClarityScore = Math.min(1.0, Math.max(0.0, constraintClarityScore));
    successCriteriaClarityScore = Math.min(1.0, Math.max(0.0, successCriteriaClarityScore));
    contextClarityScore = Math.min(1.0, Math.max(0.0, contextClarityScore));

    const goalComponent: AmbiguityComponent = {
        name: 'Goal Clarity',
        clarityScore: goalClarityScore,
        weight: isBrownfield ? BROWNFIELD_GOAL_WEIGHT : GOAL_CLARITY_WEIGHT,
        justification: buildJustification('goal', goalClarityScore),
        thresholds: [
            { label: 'Features identified', minScore: 0.25, description: '특징이 식별되었는가?' },
            { label: 'Features detailed', minScore: 0.40, description: '특징에 세부사항이 있는가?' },
            { label: 'Questions answered', minScore: 0.55, description: '인터뷰 질문에 답했는가?' },
            { label: 'Gherkin ready', minScore: 0.70, description: 'Gherkin 시나리오로 변환 가능한가?' },
        ],
    };

    const constraintComponent: AmbiguityComponent = {
        name: 'Constraint Clarity',
        clarityScore: constraintClarityScore,
        weight: isBrownfield ? BROWNFIELD_CONSTRAINT_WEIGHT : CONSTRAINT_CLARITY_WEIGHT,
        justification: buildJustification('constraint', constraintClarityScore),
        thresholds: [
            { label: 'Tech stack known', minScore: 0.30, description: '기술 스택이 파악되었는가?' },
            { label: 'Edge cases covered', minScore: 0.50, description: '경계 조건이 다루어졌는가?' },
            { label: 'All constraints clear', minScore: 0.80, description: '모든 제약조건이 명확한가?' },
        ],
    };

    const criteriaComponent: AmbiguityComponent = {
        name: 'Success Criteria Clarity',
        clarityScore: successCriteriaClarityScore,
        weight: isBrownfield ? BROWNFIELD_CRITERIA_WEIGHT : SUCCESS_CRITERIA_CLARITY_WEIGHT,
        justification: buildJustification('criteria', successCriteriaClarityScore),
        thresholds: [
            { label: 'Basic AC exists', minScore: 0.30, description: '기본 인수 조건이 있는가?' },
            { label: 'Gherkin When/Then', minScore: 0.50, description: 'When/Then 시나리오가 있는가?' },
            { label: 'Full scenario coverage', minScore: 0.75, description: '충분한 시나리오 커버리지가 있는가?' },
        ],
    };

    const breakdown: AmbiguityBreakdown = {
        goalClarity: goalComponent,
        constraintClarity: constraintComponent,
        successCriteriaClarity: criteriaComponent,
    };

    if (isBrownfield && codebaseMapAvailable) {
        breakdown.contextClarity = {
            name: 'Context Clarity',
            clarityScore: contextClarityScore,
            weight: BROWNFIELD_CONTEXT_WEIGHT,
            justification: buildJustification('context', contextClarityScore),
            thresholds: [
                { label: 'Map available', minScore: 0.30, description: '코드베이스 맵이 있는가?' },
                { label: 'Patterns understood', minScore: 0.60, description: '기존 패턴이 파악되었는가?' },
            ],
        };
    }

    const weightedClarity = Object.values(breakdown).reduce((sum, comp) => {
        if (!comp) return sum;
        return sum + comp.clarityScore * comp.weight;
    }, 0);

    const overallScore = Math.round((1.0 - weightedClarity) * 10000) / 10000;

    const components = [goalComponent, constraintComponent, criteriaComponent];
    if (breakdown.contextClarity) components.push(breakdown.contextClarity);
    const weakest = components.reduce((min, c) => c.clarityScore < min.clarityScore ? c : min, components[0]);

    const milestone = getMilestone(overallScore);

    return {
        overallScore,
        breakdown,
        isReadyForSeed: overallScore <= AMBIGUITY_THRESHOLD,
        readinessForGherkin: overallScore <= GHERKIN_READINESS_THRESHOLD,
        milestone: milestone.label,
        milestoneDescription: milestone.description,
        weakestArea: weakest.name,
        nextMilestone: getNextMilestone(overallScore),
    };
}
