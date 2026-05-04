/**
 * Weave Intake Stage
 *
 * Document analysis, feature extraction, and interview orchestration.
 * Uses Maskweaver memory for semantic search of past similar projects.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import type { WeaveEvent, EnvironmentAnalysis, MapResult, StructuralChange, ConsentPrompt } from '../types.js';
import { analyzeEnvironment } from '../environment/index.js';
import { readMapResult } from './map.js';

// Import from sub-modules
export type {
    IntakeOptions, IntakeResult, DocumentAnalysis, Question,
    AmbiguityComponent, AmbiguityBreakdown, AmbiguityScore,
    InterviewRound, InterviewState, InterviewOptions, InterviewResult,
    IntakeWithAnalysisOptions,
} from './intake-types.js';

export { scoreAmbiguity } from './intake-ambiguity.js';
export {
    generateQuestions, generateInterviewQuestions,
    generateGherkinQuestions, generateAcceptanceCriteriaFromAnswers,
} from './intake-questions.js';
export {
    saveInterviewState, loadInterviewState, listInterviewStates,
    getInterviewDir,
} from './intake-persistence.js';

// ============================================================================
// Document Discovery
// ============================================================================

const DOC_EXTENSIONS = ['.md', '.txt', '.yaml', '.yml', '.json'];
const INDEX_FILES = ['index.md', 'README.md', 'readme.md'];

function discoverDocuments(basePath: string): string[] {
    const docs: string[] = [];

    function walk(dir: string): void {
        if (!fs.existsSync(dir)) return;

        const entries = fs.readdirSync(dir, { withFileTypes: true });

        for (const indexFile of INDEX_FILES) {
            const indexPath = path.join(dir, indexFile);
            if (fs.existsSync(indexPath)) {
                docs.push(indexPath);
            }
        }

        for (const entry of entries) {
            const fullPath = path.join(dir, entry.name);

            if (entry.isDirectory() && !entry.name.startsWith('.')) {
                walk(fullPath);
            } else if (entry.isFile()) {
                const ext = path.extname(entry.name).toLowerCase();
                if (DOC_EXTENSIONS.includes(ext) && !INDEX_FILES.includes(entry.name)) {
                    docs.push(fullPath);
                }
            }
        }
    }

    walk(basePath);
    return docs;
}

// ============================================================================
// Document Analysis
// ============================================================================

import type { DocumentAnalysis } from './intake-types.js';

function analyzeDocument(filePath: string): DocumentAnalysis {
    const content = fs.readFileSync(filePath, 'utf-8');
    const fileName = path.basename(filePath);

    const titleMatch = content.match(/^#\s+(.+)$/m);
    const title = titleMatch ? titleMatch[1] : fileName.replace(/\.[^.]+$/, '');

    const sectionMatches = content.match(/^##\s+(.+)$/gm) || [];
    const sections = sectionMatches.map(s => s.replace(/^##\s+/, ''));

    const keyPoints: string[] = [];
    const bulletMatches = content.match(/^[-*]\s+(.+)$/gm) || [];
    for (const bullet of bulletMatches.slice(0, 10)) {
        keyPoints.push(bullet.replace(/^[-*]\s+/, ''));
    }

    return { path: filePath, title, sections, keyPoints };
}

// ============================================================================
// Feature Extraction
// ============================================================================

function extractFeatures(documents: DocumentAnalysis[]): string[] {
    const features = new Set<string>();

    for (const doc of documents) {
        for (const point of doc.keyPoints) {
            if (point.length > 10 && point.length < 100) {
                features.add(point);
            }
        }
        for (const section of doc.sections) {
            if (section.length > 5 && section.length < 50) {
                features.add(section);
            }
        }
    }

    return Array.from(features).slice(0, 20);
}

// ============================================================================
// Technical Requirements Detection
// ============================================================================

import type { IntakeResult } from './intake-types.js';

const TECH_PATTERNS: Record<string, RegExp[]> = {
    frontend: [
        /react/i, /vue/i, /angular/i, /svelte/i, /next\.?js/i,
        /tailwind/i, /css/i, /html/i, /typescript/i, /javascript/i,
    ],
    backend: [
        /node/i, /express/i, /fastify/i, /nest\.?js/i,
        /python/i, /django/i, /flask/i, /fastapi/i,
        /go/i, /gin/i, /echo/i, /rust/i, /java/i, /spring/i,
    ],
    database: [
        /postgres/i, /mysql/i, /sqlite/i, /mongodb/i,
        /redis/i, /prisma/i, /supabase/i, /firebase/i,
    ],
};

function detectTechnicalRequirements(documents: DocumentAnalysis[]): IntakeResult['technicalRequirements'] {
    const result: IntakeResult['technicalRequirements'] = {};

    const allText = documents.map(d => d.keyPoints.join(' ') + ' ' + d.sections.join(' ')).join(' ');

    for (const [category, patterns] of Object.entries(TECH_PATTERNS)) {
        const detected: string[] = [];
        for (const pattern of patterns) {
            if (pattern.test(allText)) {
                const match = allText.match(pattern);
                if (match) detected.push(match[0]);
            }
        }
        if (detected.length > 0) {
            (result as any)[category] = [...new Set(detected)];
        }
    }

    return result;
}

// ============================================================================
// Memory Integration for Similar Projects
// ============================================================================

interface SimilarProjectResult {
    projectName: string;
    similarity: number;
    relevantFeatures: string[];
    lessons?: string;
}

async function searchSimilarProjects(
    features: string[],
    techStack: string[],
): Promise<SimilarProjectResult[]> {
    const results: SimilarProjectResult[] = [];

    try {
        const memoryModule = await import('../../memory/index.js');
        const query = [...features.slice(0, 5), ...techStack].join(' ');

        const db = memoryModule.tryGetDatabase();
        if (!db) {
            console.log('[Intake] Memory database not initialized, skipping similar project search');
            return results;
        }

        const provider = memoryModule.createProvider({ type: 'text-only' as const });

        let searchResults: Array<{ chunk: { path: string; text: string }; score: number }> = [];

        if (provider) {
            const embeddingResult = await provider.embed([query]);
            const embedding = embeddingResult[0];
            searchResults = memoryModule.hybridSearch(query, embedding, { limit: 5, minScore: 0.3 });
        } else {
            console.log('[Intake] Provider not available, using text search only');
            const textResults = db.searchByText(query, 5);
            searchResults = textResults.map((r: any) => ({ chunk: r.chunk, score: r.score || 0.5 }));
        }

        for (const result of searchResults) {
            const { chunk, score } = result;
            const pathParts = chunk.path.split(/[/\\]/);
            const projectName = pathParts.find((p: string) =>
                !p.startsWith('.') && p !== 'memory' && p !== 'daily' && !p.endsWith('.md'),
            ) || 'Previous Project';

            const relevantFeatures = features.filter(f =>
                chunk.text.toLowerCase().includes(f.toLowerCase().slice(0, 10)),
            );

            if (relevantFeatures.length > 0 || score > 0.5) {
                results.push({
                    projectName,
                    similarity: score,
                    relevantFeatures,
                    lessons: chunk.text.slice(0, 200),
                });
            }
        }
    } catch (e) {
        console.log('[Intake] Similar project search failed:', e);
    }

    return results;
}

// ============================================================================
// Map Integration — Structural Change Detection & Consent
// ============================================================================

export async function injectMapContext(
    map: MapResult | null,
    features: string[],
): Promise<{ structuralChanges: StructuralChange[]; consentPrompts: ConsentPrompt[] }> {
    const structuralChanges: StructuralChange[] = [];
    const consentPrompts: ConsentPrompt[] = [];

    if (!map) return { structuralChanges, consentPrompts };

    for (const issue of map.structuralIssues) {
        if (issue.severity === 'info') continue;

        const area = issue.area;
        const promptId = `consent-${area.replace(/[^a-z0-9]/gi, '-').toLowerCase()}`;

        structuralChanges.push({
            area,
            currentState: issue.description,
            proposedChange: issue.suggestion,
            rationale: `구조적 이슈 "${issue.title}" 해결 필요`,
            impact: issue.severity === 'critical' ? 'high' : 'medium',
            affectedFiles: issue.affectedFiles,
            breaking: issue.severity === 'critical',
            agreed: false,
        });

        consentPrompts.push({
            id: promptId,
            topic: area,
            currentState: issue.description,
            proposedChange: issue.suggestion,
            rationale: `"${issue.title}" — ${issue.description}`,
            impact: issue.severity === 'critical' ? 'high' : 'medium',
            breaking: issue.severity === 'critical',
            options: ['승인 — 지금 수정', '승인 — build 단계에서 수정', '보류 — 이후 재검토', '무시 — 현재 구조 유지'],
            agreed: false,
        });
    }

    return { structuralChanges, consentPrompts };
}

// ============================================================================
// Main Intake Function
// ============================================================================

import type { IntakeOptions, IntakeWithAnalysisOptions, InterviewOptions, InterviewResult, InterviewRound } from './intake-types.js';
import { scoreAmbiguity } from './intake-ambiguity.js';
import { generateQuestions, generateInterviewQuestions, generateGherkinQuestions, generateAcceptanceCriteriaFromAnswers } from './intake-questions.js';
import { saveInterviewState, loadInterviewState } from './intake-persistence.js';

export async function intake(options: IntakeOptions | IntakeWithAnalysisOptions): Promise<IntakeResult> {
    const { docsPath } = options;
    const extendedOptions = options as IntakeWithAnalysisOptions;
    const skipEnvironmentAnalysis = extendedOptions.skipEnvironmentAnalysis ?? false;
    const warningsOnly = extendedOptions.warningsOnly ?? false;

    const absolutePath = path.isAbsolute(docsPath)
        ? docsPath
        : path.join(process.cwd(), docsPath);

    if (!fs.existsSync(absolutePath)) {
        throw new Error(`Documents path not found: ${absolutePath}`);
    }

    const docPaths = fs.statSync(absolutePath).isDirectory()
        ? discoverDocuments(absolutePath)
        : [absolutePath];

    if (docPaths.length === 0) {
        throw new Error(`No documents found in: ${absolutePath}`);
    }

    const documents = docPaths.map(analyzeDocument);
    const features = extractFeatures(documents);
    const technicalRequirements = detectTechnicalRequirements(documents);
    const questions = generateQuestions(features, technicalRequirements);

    const techStack: string[] = [
        ...(technicalRequirements.frontend || []),
        ...(technicalRequirements.backend || []),
        ...(technicalRequirements.database || []),
    ];

    const similarProjectResults = await searchSimilarProjects(features, techStack);
    const similarProjects = similarProjectResults.map(r =>
        `${r.projectName} (${(r.similarity * 100).toFixed(0)}% 유사): ${r.relevantFeatures.join(', ')}`,
    );

    let environment: EnvironmentAnalysis | undefined;
    if (!skipEnvironmentAnalysis) {
        try {
            const projectPath = fs.statSync(absolutePath).isDirectory()
                ? path.dirname(absolutePath)
                : path.dirname(absolutePath);

            environment = await analyzeEnvironment({
                projectPath: projectPath !== '.' ? projectPath : process.cwd(),
                warningsOnly,
                includeProjectHistory: true,
            });

            const criticalIssues = environment.issues.filter(i => i.severity === 'critical');
            if (criticalIssues.length > 0) {
                console.log(`\n⚠️  [Intake] ${criticalIssues.length}개의 Critical 이슈가 감지되었습니다!`);
                for (const issue of criticalIssues) {
                    console.log(`   🔴 ${issue.title}`);
                }
                console.log('');
            }
        } catch (e) {
            console.log('[Intake] Environment analysis skipped:', e);
        }
    }

    const mapResult = await readMapResult(process.cwd());
    const { structuralChanges } = mapResult
        ? await injectMapContext(mapResult, features)
        : { structuralChanges: [] };

    const baselineAmbiguity = scoreAmbiguity(
        features, technicalRequirements, {},
        undefined, mapResult !== null, mapResult !== null,
    );

    return {
        documents,
        features,
        domainTerms: [],
        technicalRequirements,
        questions,
        similarProjects: similarProjects.length > 0 ? similarProjects : undefined,
        environment,
        codebaseMapPath: mapResult?.mapPath,
        structuralChanges: structuralChanges.length > 0 ? structuralChanges : undefined,
        ambiguityScore: baselineAmbiguity,
    };
}

// ============================================================================
// Multi-Round Interview Orchestrator
// ============================================================================

export async function interview(options: InterviewOptions): Promise<InterviewResult> {
    const basePath = options.basePath || process.cwd();
    const now = new Date().toISOString();

    let interviewState = options.resumeId
        ? loadInterviewState(basePath, options.resumeId)
        : (!options.userAnswers ? loadInterviewState(basePath) : null);

    const intakeResult = await intake({ docsPath: options.docsPath, onEvent: options.onEvent });

    const map = options.mapResult !== undefined
        ? options.mapResult
        : await readMapResult(basePath);

    const { structuralChanges, consentPrompts } = await injectMapContext(map, intakeResult.features);

    const existingAnswers: Record<string, string> = interviewState
        ? Object.assign({}, ...interviewState.rounds.map(r => r.answers))
        : {};
    const roundAnswers = options.userAnswers || {};
    const allAnswers: Record<string, string> = { ...existingAnswers, ...roundAnswers };

    const isBrownfield = map !== null;

    const doneWhenMap: Record<string, string> = {};
    for (const feature of intakeResult.features) {
        doneWhenMap[feature] = `유저가 ${feature.toLowerCase().replace(/[을를이가은는]/g, '')}할 수 있다`;
    }
    const generatedScenarios = Object.keys(allAnswers).length > 0
        ? generateAcceptanceCriteriaFromAnswers(intakeResult.features, allAnswers, doneWhenMap)
        : undefined;

    const ambiguityScore = scoreAmbiguity(
        intakeResult.features, intakeResult.technicalRequirements, allAnswers,
        generatedScenarios, isBrownfield, map !== null,
    );

    const baseQuestions = generateQuestions(intakeResult.features, intakeResult.technicalRequirements);
    const mapQuestions = generateInterviewQuestions(intakeResult.features, intakeResult.technicalRequirements, map);

    const seenIds = new Set<string>();
    const mergedQuestions = [...baseQuestions, ...mapQuestions].filter(q => {
        if (seenIds.has(q.id)) return false;
        seenIds.add(q.id);
        return true;
    });

    let gherkinQuestions = (!options.skipGherkinQuestions && !ambiguityScore.isReadyForSeed)
        ? generateGherkinQuestions(intakeResult.features, mergedQuestions, allAnswers, ambiguityScore)
        : [];

    const enhancedQuestions = mergedQuestions.filter(
        q => !Object.keys(allAnswers).some(k =>
            k.toLowerCase().includes(q.id.toLowerCase())
            || k.toLowerCase().includes((q.targetFeature || '').toLowerCase()),
        ),
    );

    const allQuestions = [...enhancedQuestions, ...gherkinQuestions];

    const interviewId = interviewState?.interviewId
        || `interview_${new Date().toISOString().replace(/[:.]/g, '-')}`;
    const roundNumber = interviewState ? interviewState.rounds.length + 1 : 1;

    const currentRound: InterviewRound = {
        roundNumber,
        questions: allQuestions,
        answers: roundAnswers,
        ambiguityBefore: interviewState?.rounds[interviewState.rounds.length - 1]?.ambiguityAfter,
        ambiguityAfter: ambiguityScore,
        gherkinGenerated: generatedScenarios,
        timestamp: now,
    };

    if (interviewState) {
        interviewState.rounds.push(currentRound);
        interviewState.currentRound = roundNumber;
        interviewState.status = ambiguityScore.isReadyForSeed ? 'completed' : 'in_progress';
        interviewState.features = intakeResult.features;
        interviewState.isBrownfield = isBrownfield;
        interviewState.updatedAt = now;
    } else {
        interviewState = {
            interviewId,
            status: ambiguityScore.isReadyForSeed ? 'completed' : 'in_progress',
            initialContext: intakeResult.features.join(', '),
            rounds: [currentRound],
            currentRound: 1,
            features: intakeResult.features,
            isBrownfield,
            createdAt: now,
            updatedAt: now,
        };
    }

    saveInterviewState(basePath, interviewState);

    const intakeWithEverything: IntakeResult = {
        ...intakeResult,
        codebaseMapPath: map ? map.mapPath : undefined,
        structuralChanges: structuralChanges.length > 0 ? structuralChanges : undefined,
        consentPrompts: consentPrompts.length > 0 ? consentPrompts : undefined,
        ambiguityScore,
        generatedScenarios,
        questions: allQuestions,
    };

    const hasUnansweredQuestions = allQuestions.some(q => q.required);
    const hasPendingConsent = consentPrompts.length > 0 && consentPrompts.some(cp => !cp.agreed);

    return {
        intake: intakeWithEverything,
        agreedStructuralChanges: structuralChanges.filter(sc => sc.agreed),
        userAnswers: allAnswers,
        satisfied: ambiguityScore.isReadyForSeed && !hasUnansweredQuestions && !hasPendingConsent,
        ambiguityScore,
        generatedScenarios,
        interviewState,
        isMultiRound: !ambiguityScore.isReadyForSeed || hasUnansweredQuestions || hasPendingConsent,
    };
}
