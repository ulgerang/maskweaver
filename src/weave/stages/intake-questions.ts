/**
 * Weave Intake — Question Generation
 *
 * Basic clarifying questions, map-augmented interview questions,
 * Gherkin-focused (Given/When/Then) questions, and acceptance criteria
 * generation from interview answers.
 */

import type { MapResult, GherkinScenario } from '../types.js';
import type { Question, IntakeResult, AmbiguityScore } from './intake-types.js';

// ============================================================================
// Basic Question Generation
// ============================================================================

export function generateQuestions(
    features: string[],
    techReqs: IntakeResult['technicalRequirements'],
): Question[] {
    const questions: Question[] = [];
    let qId = 1;

    if (!techReqs.frontend || techReqs.frontend.length === 0) {
        questions.push({
            id: `Q${qId++}`,
            topic: '프론트엔드 기술',
            question: '프론트엔드 프레임워크 선호도가 있으신가요?',
            options: ['React', 'Vue', 'Next.js', 'Vanilla JS', '상관없음'],
            required: true,
        });
    }

    if (!techReqs.database || techReqs.database.length === 0) {
        questions.push({
            id: `Q${qId++}`,
            topic: '데이터 저장',
            question: '데이터를 어디에 저장할까요?',
            options: ['로컬 스토리지 (오프라인)', '서버 DB (PostgreSQL/MySQL)', '클라우드 (Supabase/Firebase)'],
            required: true,
        });
    }

    if (features.length > 3) {
        questions.push({
            id: `Q${qId++}`,
            topic: '우선순위',
            question: '가장 먼저 완성해야 하는 기능은 무엇인가요?',
            options: features.slice(0, 5),
            required: true,
        });
    }

    return questions;
}

// ============================================================================
// Interview Questions (Map-Augmented)
// ============================================================================

export function generateInterviewQuestions(
    features: string[],
    techReqs: IntakeResult['technicalRequirements'],
    map: MapResult | null,
): Question[] {
    const questions = generateQuestions(features, techReqs);

    if (map && map.structuralIssues.length > 0) {
        const critical = map.structuralIssues.filter(i => i.severity === 'critical');
        const warnings = map.structuralIssues.filter(i => i.severity === 'warning');
        if (critical.length > 0) {
            questions.unshift({
                id: 'MAP-CRITICAL',
                topic: '구조적 문제',
                question: `코드베이스에서 ${critical.length}개의 Critical 이슈가 발견되었습니다. 계속 진행할까요?`,
                options: ['이슈를 먼저 해결', '진행하되 build 단계에서 해결', '지금은 무시'],
                required: true,
            });
        }
        if (warnings.length > 0) {
            questions.push({
                id: 'MAP-WARNINGS',
                topic: '권장 구조 변경',
                question: `${warnings.length}개의 경고가 있습니다. 구조 변경 권장사항을 검토하시겠습니까?`,
                options: ['검토', '나중에 검토', '무시'],
                required: false,
            });
        }
    }

    if (features.length > 0) {
        questions.push({
            id: 'EXISTING-CODE',
            topic: '기존 코드 활용',
            question: '기존 코드베이스의 구조나 패턴을 유지하면서 구현하시겠습니까?',
            options: ['최대한 기존 구조 유지', '필요시 구조 변경', '새로 작성'],
            required: true,
        });
    }

    return questions;
}

// ============================================================================
// Gherkin-Focused Question Generation
// ============================================================================

export function generateGherkinQuestions(
    features: string[],
    existingQuestions: Question[],
    existingAnswers: Record<string, string>,
    ambiguity: AmbiguityScore,
): Question[] {
    const questions: Question[] = [];
    let qId = existingQuestions.length + 1;

    if (ambiguity.weakestArea === 'Success Criteria Clarity' || ambiguity.overallScore > 0.3) {
        for (let i = 0; i < Math.min(features.length, 3); i++) {
            const feature = features[i];

            const givenAnswered = Object.keys(existingAnswers).some(k =>
                k.includes(`given-${i}`) || k.includes(`전제-${i}`),
            );
            if (!givenAnswered) {
                questions.push({
                    id: `Q${qId++}`,
                    topic: 'Gherkin - Given',
                    question: `"${feature}" 기능을 사용하기 전에 어떤 전제조건이 필요합니까? (예: 로그인 되어 있어야 한다, 데이터가 존재해야 한다)`,
                    required: true,
                    questionType: 'gherkin-given',
                    targetFeature: feature,
                });
            }

            const whenAnswered = Object.keys(existingAnswers).some(k =>
                k.includes(`when-${i}`) || k.includes(`행동-${i}`),
            );
            if (!whenAnswered) {
                questions.push({
                    id: `Q${qId++}`,
                    topic: 'Gherkin - When',
                    question: `"${feature}" 기능을 실행하기 위해 사용자가 어떤 행동을 하나요? (예: 버튼을 클릭한다, 값을 입력하고 제출한다)`,
                    required: true,
                    questionType: 'gherkin-when',
                    targetFeature: feature,
                });
            }

            const thenAnswered = Object.keys(existingAnswers).some(k =>
                k.includes(`then-${i}`) || k.includes(`결과-${i}`),
            );
            if (!thenAnswered) {
                questions.push({
                    id: `Q${qId++}`,
                    topic: 'Gherkin - Then',
                    question: `"${feature}" 기능 실행 후 어떤 결과가 나와야 하나요? (예: 성공 메시지가 표시된다, 데이터가 저장된다, 화면이 갱신된다)`,
                    required: true,
                    questionType: 'gherkin-then',
                    targetFeature: feature,
                });
            }
        }
    }

    if (ambiguity.weakestArea === 'Constraint Clarity' || ambiguity.breakdown.constraintClarity.clarityScore < 0.5) {
        const edgeAnswered = Object.keys(existingAnswers).some(k =>
            k.includes('edge') || k.includes('예외') || k.includes('에러'),
        );
        if (!edgeAnswered) {
            questions.push({
                id: `Q${qId++}`,
                topic: '경계 조건',
                question: '비정상적인 상황(네트워크 오류, 잘못된 입력, 권한 없음 등)에서 어떻게 동작해야 하나요?',
                required: true,
                questionType: 'edge-case',
            });
        }

        const constraintAnswered = Object.keys(existingAnswers).some(k =>
            k.includes('constraint') || k.includes('제약') || k.includes('제한'),
        );
        if (!constraintAnswered) {
            questions.push({
                id: `Q${qId++}`,
                topic: '제약조건',
                question: '기술적/비기능적 제약조건이 있나요? (지원 브라우저, 성능 목표, 보안 요구사항, 데이터 제한 등)',
                required: false,
                questionType: 'constraint',
            });
        }
    }

    if (ambiguity.weakestArea === 'Goal Clarity' || ambiguity.breakdown.goalClarity.clarityScore < 0.5) {
        const successAnswered = Object.keys(existingAnswers).some(k =>
            k.includes('성공') || k.includes('측정') || k.includes('metric'),
        );
        if (!successAnswered) {
            questions.push({
                id: `Q${qId++}`,
                topic: '성공 지표',
                question: '이 프로젝트의 성공을 어떻게 측정할 수 있을까요? (예: 사용자 100명 가입, 페이지 로드 2초 이내, 테스트 통과율 95%)',
                required: false,
                questionType: 'clarification',
            });
        }
    }

    return questions;
}

// ============================================================================
// Acceptance Criteria Generation from Interview Answers
// ============================================================================

function findAnswer(answers: Record<string, string>, ...keys: string[]): string | undefined {
    for (const [k, v] of Object.entries(answers)) {
        for (const key of keys) {
            if (k.toLowerCase().includes(key.toLowerCase())) return v;
        }
    }
    return undefined;
}

export function generateAcceptanceCriteriaFromAnswers(
    features: string[],
    answers: Record<string, string>,
    doneWhenMap: Record<string, string>,
): GherkinScenario[] {
    const scenarios: GherkinScenario[] = [];

    for (let i = 0; i < features.length; i++) {
        const feature = features[i];
        const doneWhen = doneWhenMap[feature] || `유저가 ${feature} 기능을 사용할 수 있다`;

        const givenAnswer = findAnswer(answers, `given-${i}`, `전제-${i}`, feature, 'given');
        const whenAnswer = findAnswer(answers, `when-${i}`, `행동-${i}`, feature, 'when');
        const thenAnswer = findAnswer(answers, `then-${i}`, `결과-${i}`, feature, 'then');

        const happyGiven = givenAnswer ? [givenAnswer] : [`${feature} 관련 기능이 구현되어 있다`];
        const happyWhen = whenAnswer ? [whenAnswer] : [`유저가 ${feature} 기능을 사용한다`];
        const happyThen = thenAnswer
            ? [thenAnswer, doneWhen].filter((v, idx, arr) => arr.indexOf(v) === idx)
            : [doneWhen];

        scenarios.push({
            feature,
            scenario: `${feature} - 정상 동작`,
            given: happyGiven,
            when: happyWhen,
            then: happyThen,
        });

        const edgeAnswer = findAnswer(answers, 'edge', '에러', '예외', 'edge-cases');
        if (edgeAnswer) {
            scenarios.push({
                feature,
                scenario: `${feature} - 에러 처리`,
                given: [`${feature} 관련 기능이 구현되어 있다`, '비정상적인 상황이 발생한다'],
                when: ['오류 조건이 발생한다'],
                then: [edgeAnswer],
            });
        } else {
            scenarios.push({
                feature,
                scenario: `${feature} - 에러 처리`,
                given: [`${feature} 관련 기능이 구현되어 있다`],
                when: [`유저가 ${feature} 기능을 비정상적으로 사용한다`],
                then: ['적절한 에러 메시지가 표시된다'],
            });
        }
    }

    return scenarios;
}
