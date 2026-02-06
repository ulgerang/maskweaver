/**
 * Weave Intake Stage
 * 
 * Document analysis and question generation.
 * Uses Maskweaver memory for semantic search of past similar projects.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import type { WeaveEvent, EnvironmentAnalysis } from '../types.js';
import { analyzeEnvironment } from '../environment/index.js';

// ============================================================================
// Types
// ============================================================================

export interface IntakeOptions {
    docsPath: string;
    onEvent?: (event: WeaveEvent) => void;
}

export interface IntakeResult {
    documents: DocumentAnalysis[];
    features: string[];
    domainTerms: { term: string; description?: string }[];
    technicalRequirements: {
        frontend?: string[];
        backend?: string[];
        database?: string[];
        other?: string[];
    };
    questions: Question[];
    similarProjects?: string[];  // From memory search
    environment?: EnvironmentAnalysis;  // Proactive environment analysis
}

export interface DocumentAnalysis {
    path: string;
    title: string;
    sections: string[];
    keyPoints: string[];
}

export interface Question {
    id: string;
    topic: string;
    question: string;
    options?: string[];
    required: boolean;
}

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

        // Prioritize index files
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

function analyzeDocument(filePath: string): DocumentAnalysis {
    const content = fs.readFileSync(filePath, 'utf-8');
    const fileName = path.basename(filePath);

    // Extract title (first H1 or filename)
    const titleMatch = content.match(/^#\s+(.+)$/m);
    const title = titleMatch ? titleMatch[1] : fileName.replace(/\.[^.]+$/, '');

    // Extract sections (H2 headers)
    const sectionMatches = content.match(/^##\s+(.+)$/gm) || [];
    const sections = sectionMatches.map(s => s.replace(/^##\s+/, ''));

    // Extract key points (bullet points under important headers)
    const keyPoints: string[] = [];
    const bulletMatches = content.match(/^[-*]\s+(.+)$/gm) || [];
    for (const bullet of bulletMatches.slice(0, 10)) {
        keyPoints.push(bullet.replace(/^[-*]\s+/, ''));
    }

    return {
        path: filePath,
        title,
        sections,
        keyPoints,
    };
}

// ============================================================================
// Feature Extraction
// ============================================================================

const FEATURE_PATTERNS = [
    /(?:기능|feature|functionality)[:：]\s*(.+)/gi,
    /(?:할 수 있다|can|should|must)\s+(.+)/gi,
    /(?:구현|implement|build|create)\s+(.+)/gi,
];

function extractFeatures(documents: DocumentAnalysis[]): string[] {
    const features = new Set<string>();

    for (const doc of documents) {
        // From key points
        for (const point of doc.keyPoints) {
            if (point.length > 10 && point.length < 100) {
                features.add(point);
            }
        }

        // From sections
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

function detectTechnicalRequirements(
    documents: DocumentAnalysis[]
): IntakeResult['technicalRequirements'] {
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
            result[category as keyof typeof result] = [...new Set(detected)];
        }
    }

    return result;
}

// ============================================================================
// Question Generation
// ============================================================================

function generateQuestions(
    features: string[],
    techReqs: IntakeResult['technicalRequirements']
): Question[] {
    const questions: Question[] = [];
    let qId = 1;

    // If no frontend detected, ask
    if (!techReqs.frontend || techReqs.frontend.length === 0) {
        questions.push({
            id: `Q${qId++}`,
            topic: '프론트엔드 기술',
            question: '프론트엔드 프레임워크 선호도가 있으신가요?',
            options: ['React', 'Vue', 'Next.js', 'Vanilla JS', '상관없음'],
            required: true,
        });
    }

    // If no database detected, ask
    if (!techReqs.database || techReqs.database.length === 0) {
        questions.push({
            id: `Q${qId++}`,
            topic: '데이터 저장',
            question: '데이터를 어디에 저장할까요?',
            options: ['로컬 스토리지 (오프라인)', '서버 DB (PostgreSQL/MySQL)', '클라우드 (Supabase/Firebase)'],
            required: true,
        });
    }

    // Priority question
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
// Memory Integration for Similar Projects
// ============================================================================

interface SimilarProjectResult {
    projectName: string;
    similarity: number;
    relevantFeatures: string[];
    lessons?: string;
}

/**
 * Search memory for similar past projects based on features.
 * Uses hybrid search (vector + text) from memory module.
 */
async function searchSimilarProjects(
    features: string[],
    techStack: string[]
): Promise<SimilarProjectResult[]> {
    const results: SimilarProjectResult[] = [];

    try {
        // Dynamic import to avoid circular dependencies
        const memoryModule = await import('../../memory/index.js');

        // Build query from features and tech stack
        const query = [...features.slice(0, 5), ...techStack].join(' ');

        // Get database instance (returns null if not initialized)
        const db = memoryModule.tryGetDatabase();
        if (!db) {
            console.log('[Intake] Memory database not initialized, skipping similar project search');
            return results;
        }

        // Create a text-only provider for simple search
        // ProviderConfig uses 'type' not 'provider'
        const provider = memoryModule.createProvider({
            type: 'text-only' as const,
        });

        // Use hybridSearch or fall back to text search
        let searchResults: Array<{ chunk: { path: string; text: string }; score: number }> = [];

        if (provider) {
            // Try semantic search if provider available
            // embed() takes string[] and returns Embedding[] (number[][])
            const embeddingResult = await provider.embed([query]);
            const embedding = embeddingResult[0];  // Get first (only) embedding

            // hybridSearch takes (query, queryEmbedding, options)
            searchResults = memoryModule.hybridSearch(query, embedding, {
                limit: 5,
                minScore: 0.3,
            });
        } else {
            console.log('[Intake] Provider not available, using text search only');
            // Fall back to text-only search
            const textResults = db.searchByText(query, 5);
            searchResults = textResults.map((r: any) => ({
                chunk: r.chunk,
                score: r.score || 0.5, // Default score for text matches
            }));
        }

        // Process results to extract project insights
        for (const result of searchResults) {
            const { chunk, score } = result;

            // Try to extract project name from path
            const pathParts = chunk.path.split(/[/\\]/);
            const projectName = pathParts.find((p: string) =>
                !p.startsWith('.') &&
                p !== 'memory' &&
                p !== 'daily' &&
                !p.endsWith('.md')
            ) || 'Previous Project';

            // Extract relevant features mentioned
            const relevantFeatures = features.filter(f =>
                chunk.text.toLowerCase().includes(f.toLowerCase().slice(0, 10))
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
        // Memory search is optional, don't fail intake
        console.log('[Intake] Similar project search failed:', e);
    }

    return results;
}

// ============================================================================
// Main Intake Function
// ============================================================================

export interface IntakeWithAnalysisOptions extends IntakeOptions {
    /** Skip environment analysis for faster intake */
    skipEnvironmentAnalysis?: boolean;
    /** Only include warning+ severity issues in environment analysis */
    warningsOnly?: boolean;
}

export async function intake(options: IntakeOptions | IntakeWithAnalysisOptions): Promise<IntakeResult> {
    const { docsPath } = options;
    const extendedOptions = options as IntakeWithAnalysisOptions;
    const skipEnvironmentAnalysis = extendedOptions.skipEnvironmentAnalysis ?? false;
    const warningsOnly = extendedOptions.warningsOnly ?? false;

    // Resolve path
    const absolutePath = path.isAbsolute(docsPath)
        ? docsPath
        : path.join(process.cwd(), docsPath);

    if (!fs.existsSync(absolutePath)) {
        throw new Error(`Documents path not found: ${absolutePath}`);
    }

    // Discover documents
    const docPaths = fs.statSync(absolutePath).isDirectory()
        ? discoverDocuments(absolutePath)
        : [absolutePath];

    if (docPaths.length === 0) {
        throw new Error(`No documents found in: ${absolutePath}`);
    }

    // Analyze each document
    const documents = docPaths.map(analyzeDocument);

    // Extract information
    const features = extractFeatures(documents);
    const technicalRequirements = detectTechnicalRequirements(documents);
    const questions = generateQuestions(features, technicalRequirements);

    // Build tech stack array for memory search
    const techStack: string[] = [
        ...(technicalRequirements.frontend || []),
        ...(technicalRequirements.backend || []),
        ...(technicalRequirements.database || []),
    ];

    // Search memory for similar past projects
    const similarProjectResults = await searchSimilarProjects(features, techStack);
    const similarProjects = similarProjectResults.map(r =>
        `${r.projectName} (${(r.similarity * 100).toFixed(0)}% 유사): ${r.relevantFeatures.join(', ')}`
    );

    // Proactive environment analysis
    let environment: EnvironmentAnalysis | undefined;
    if (!skipEnvironmentAnalysis) {
        try {
            // Get the project directory (parent of docs path or current working directory)
            const projectPath = fs.statSync(absolutePath).isDirectory()
                ? path.dirname(absolutePath)  // Parent of docs folder
                : path.dirname(absolutePath); // Same for single file

            environment = await analyzeEnvironment({
                projectPath: projectPath !== '.' ? projectPath : process.cwd(),
                warningsOnly,
                includeProjectHistory: true,
            });

            // Log critical issues
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

    return {
        documents,
        features,
        domainTerms: [], // TODO: Extract domain-specific terminology
        technicalRequirements,
        questions,
        similarProjects: similarProjects.length > 0 ? similarProjects : undefined,
        environment,
    };
}

