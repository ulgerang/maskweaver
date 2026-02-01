/**
 * Mask Schema v1.0
 *
 * Defines the structure for AI expert personas.
 * 가면술사 (Maskweaver) - Core Type Definitions
 */
export interface MaskMetadata {
    /** Unique identifier (kebab-case) */
    id: string;
    /** Schema version for future compatibility */
    version: '1.0';
    /** Primary language of this mask definition */
    language: 'en' | 'ko' | 'zh' | 'ja';
    /** Creation/update timestamps (ISO 8601) */
    created: string;
    updated: string;
    /** Contributors/authors */
    authors?: string[];
    /** Related mask IDs for cross-referencing */
    relatedMasks?: string[];
    /** Tags for categorization and search */
    tags?: string[];
}
export interface MaskProfile {
    /** Display name of the persona */
    name: string;
    /** One-line tagline */
    tagline: string;
    /** Detailed background (2-3 paragraphs) */
    background: string;
    /** Core expertise areas (3-5 items) */
    expertise: string[];
    /** Thinking style description */
    thinkingStyle: string;
    /** Key strengths (3-5 bullet points) */
    strengths: string[];
    /** Limitations/weaknesses (honesty is key) */
    limitations?: string[];
}
export type CommunicationTone = 'direct' | 'friendly' | 'formal' | 'socratic' | 'enthusiastic';
export type Verbosity = 'concise' | 'moderate' | 'detailed';
export type TechnicalDepth = 'beginner' | 'intermediate' | 'expert';
export interface MaskBehavior {
    /** System prompt injected when mask is applied */
    systemPrompt: string;
    /** Communication style guidelines */
    communicationStyle: {
        tone: CommunicationTone;
        verbosity: Verbosity;
        technicalDepth: TechnicalDepth;
    };
    /** Task approach patterns */
    approachPatterns: {
        problemSolving: string;
        codeReview: string;
        architecture?: string;
        debugging?: string;
    };
    /** Example phrases this persona might use */
    signaturePhrases?: string[];
}
export interface MaskUsageExample {
    scenario: string;
    expectedOutcome: string;
}
export interface MaskUsage {
    /** When to use this mask */
    suitableFor: string[];
    /** When NOT to use this mask */
    notSuitableFor?: string[];
    /** Example use cases */
    examples: MaskUsageExample[];
}
export interface MaskConfig {
    /** Runtime configuration */
    priority?: number;
    /** Tool restrictions */
    allowedTools?: string[];
    disallowedTools?: string[];
    /** Session settings */
    maxTokens?: number;
    temperature?: number;
}
/**
 * Complete Mask Definition
 *
 * This is the main schema for defining expert personas (masks).
 */
export interface MaskSchema {
    metadata: MaskMetadata;
    profile: MaskProfile;
    behavior: MaskBehavior;
    usage: MaskUsage;
    config?: MaskConfig;
}
/**
 * Mask Catalog Entry (for index.json)
 */
export interface MaskCatalogEntry {
    id: string;
    name: string;
    file: string;
    tags: string[];
    category?: string;
}
/**
 * Mask Category (for index.json)
 */
export interface MaskCategory {
    name: string;
    description: string;
    masks: MaskCatalogEntry[];
}
/**
 * Mask Catalog (masks/index.json)
 */
export interface MaskCatalog {
    version: string;
    categories: Record<string, MaskCategory>;
}
/**
 * Loaded Mask (with resolved category info)
 */
export interface LoadedMask extends MaskSchema {
    category: string;
    filePath: string;
}
//# sourceMappingURL=types.d.ts.map