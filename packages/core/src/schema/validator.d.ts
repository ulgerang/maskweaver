/**
 * Mask Schema Validator
 *
 * Validates mask YAML/JSON against the schema using Zod.
 */
import { z } from 'zod';
import type { MaskSchema } from './types';
export declare const MaskSchemaValidator: z.ZodObject<{
    metadata: z.ZodObject<{
        id: z.ZodString;
        version: z.ZodLiteral<"1.0">;
        language: z.ZodEnum<["en", "ko", "zh", "ja"]>;
        created: z.ZodString;
        updated: z.ZodString;
        authors: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
        relatedMasks: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
        tags: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
    }, "strip", z.ZodTypeAny, {
        id: string;
        version: "1.0";
        language: "en" | "ko" | "zh" | "ja";
        created: string;
        updated: string;
        authors?: string[] | undefined;
        relatedMasks?: string[] | undefined;
        tags?: string[] | undefined;
    }, {
        id: string;
        version: "1.0";
        language: "en" | "ko" | "zh" | "ja";
        created: string;
        updated: string;
        authors?: string[] | undefined;
        relatedMasks?: string[] | undefined;
        tags?: string[] | undefined;
    }>;
    profile: z.ZodObject<{
        name: z.ZodString;
        tagline: z.ZodString;
        background: z.ZodString;
        expertise: z.ZodArray<z.ZodString, "many">;
        thinkingStyle: z.ZodString;
        strengths: z.ZodArray<z.ZodString, "many">;
        limitations: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
    }, "strip", z.ZodTypeAny, {
        name: string;
        tagline: string;
        background: string;
        expertise: string[];
        thinkingStyle: string;
        strengths: string[];
        limitations?: string[] | undefined;
    }, {
        name: string;
        tagline: string;
        background: string;
        expertise: string[];
        thinkingStyle: string;
        strengths: string[];
        limitations?: string[] | undefined;
    }>;
    behavior: z.ZodObject<{
        systemPrompt: z.ZodString;
        communicationStyle: z.ZodObject<{
            tone: z.ZodEnum<["direct", "friendly", "formal", "socratic", "enthusiastic"]>;
            verbosity: z.ZodEnum<["concise", "moderate", "detailed"]>;
            technicalDepth: z.ZodEnum<["beginner", "intermediate", "expert"]>;
        }, "strip", z.ZodTypeAny, {
            tone: "direct" | "friendly" | "formal" | "socratic" | "enthusiastic";
            verbosity: "concise" | "moderate" | "detailed";
            technicalDepth: "beginner" | "intermediate" | "expert";
        }, {
            tone: "direct" | "friendly" | "formal" | "socratic" | "enthusiastic";
            verbosity: "concise" | "moderate" | "detailed";
            technicalDepth: "beginner" | "intermediate" | "expert";
        }>;
        approachPatterns: z.ZodObject<{
            problemSolving: z.ZodString;
            codeReview: z.ZodString;
            architecture: z.ZodOptional<z.ZodString>;
            debugging: z.ZodOptional<z.ZodString>;
        }, "strip", z.ZodTypeAny, {
            problemSolving: string;
            codeReview: string;
            architecture?: string | undefined;
            debugging?: string | undefined;
        }, {
            problemSolving: string;
            codeReview: string;
            architecture?: string | undefined;
            debugging?: string | undefined;
        }>;
        signaturePhrases: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
    }, "strip", z.ZodTypeAny, {
        systemPrompt: string;
        communicationStyle: {
            tone: "direct" | "friendly" | "formal" | "socratic" | "enthusiastic";
            verbosity: "concise" | "moderate" | "detailed";
            technicalDepth: "beginner" | "intermediate" | "expert";
        };
        approachPatterns: {
            problemSolving: string;
            codeReview: string;
            architecture?: string | undefined;
            debugging?: string | undefined;
        };
        signaturePhrases?: string[] | undefined;
    }, {
        systemPrompt: string;
        communicationStyle: {
            tone: "direct" | "friendly" | "formal" | "socratic" | "enthusiastic";
            verbosity: "concise" | "moderate" | "detailed";
            technicalDepth: "beginner" | "intermediate" | "expert";
        };
        approachPatterns: {
            problemSolving: string;
            codeReview: string;
            architecture?: string | undefined;
            debugging?: string | undefined;
        };
        signaturePhrases?: string[] | undefined;
    }>;
    usage: z.ZodObject<{
        suitableFor: z.ZodArray<z.ZodString, "many">;
        notSuitableFor: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
        examples: z.ZodArray<z.ZodObject<{
            scenario: z.ZodString;
            expectedOutcome: z.ZodString;
        }, "strip", z.ZodTypeAny, {
            scenario: string;
            expectedOutcome: string;
        }, {
            scenario: string;
            expectedOutcome: string;
        }>, "many">;
    }, "strip", z.ZodTypeAny, {
        suitableFor: string[];
        examples: {
            scenario: string;
            expectedOutcome: string;
        }[];
        notSuitableFor?: string[] | undefined;
    }, {
        suitableFor: string[];
        examples: {
            scenario: string;
            expectedOutcome: string;
        }[];
        notSuitableFor?: string[] | undefined;
    }>;
    config: z.ZodOptional<z.ZodObject<{
        priority: z.ZodOptional<z.ZodNumber>;
        allowedTools: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
        disallowedTools: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
        maxTokens: z.ZodOptional<z.ZodNumber>;
        temperature: z.ZodOptional<z.ZodNumber>;
    }, "strip", z.ZodTypeAny, {
        priority?: number | undefined;
        allowedTools?: string[] | undefined;
        disallowedTools?: string[] | undefined;
        maxTokens?: number | undefined;
        temperature?: number | undefined;
    }, {
        priority?: number | undefined;
        allowedTools?: string[] | undefined;
        disallowedTools?: string[] | undefined;
        maxTokens?: number | undefined;
        temperature?: number | undefined;
    }>>;
}, "strip", z.ZodTypeAny, {
    metadata: {
        id: string;
        version: "1.0";
        language: "en" | "ko" | "zh" | "ja";
        created: string;
        updated: string;
        authors?: string[] | undefined;
        relatedMasks?: string[] | undefined;
        tags?: string[] | undefined;
    };
    profile: {
        name: string;
        tagline: string;
        background: string;
        expertise: string[];
        thinkingStyle: string;
        strengths: string[];
        limitations?: string[] | undefined;
    };
    behavior: {
        systemPrompt: string;
        communicationStyle: {
            tone: "direct" | "friendly" | "formal" | "socratic" | "enthusiastic";
            verbosity: "concise" | "moderate" | "detailed";
            technicalDepth: "beginner" | "intermediate" | "expert";
        };
        approachPatterns: {
            problemSolving: string;
            codeReview: string;
            architecture?: string | undefined;
            debugging?: string | undefined;
        };
        signaturePhrases?: string[] | undefined;
    };
    usage: {
        suitableFor: string[];
        examples: {
            scenario: string;
            expectedOutcome: string;
        }[];
        notSuitableFor?: string[] | undefined;
    };
    config?: {
        priority?: number | undefined;
        allowedTools?: string[] | undefined;
        disallowedTools?: string[] | undefined;
        maxTokens?: number | undefined;
        temperature?: number | undefined;
    } | undefined;
}, {
    metadata: {
        id: string;
        version: "1.0";
        language: "en" | "ko" | "zh" | "ja";
        created: string;
        updated: string;
        authors?: string[] | undefined;
        relatedMasks?: string[] | undefined;
        tags?: string[] | undefined;
    };
    profile: {
        name: string;
        tagline: string;
        background: string;
        expertise: string[];
        thinkingStyle: string;
        strengths: string[];
        limitations?: string[] | undefined;
    };
    behavior: {
        systemPrompt: string;
        communicationStyle: {
            tone: "direct" | "friendly" | "formal" | "socratic" | "enthusiastic";
            verbosity: "concise" | "moderate" | "detailed";
            technicalDepth: "beginner" | "intermediate" | "expert";
        };
        approachPatterns: {
            problemSolving: string;
            codeReview: string;
            architecture?: string | undefined;
            debugging?: string | undefined;
        };
        signaturePhrases?: string[] | undefined;
    };
    usage: {
        suitableFor: string[];
        examples: {
            scenario: string;
            expectedOutcome: string;
        }[];
        notSuitableFor?: string[] | undefined;
    };
    config?: {
        priority?: number | undefined;
        allowedTools?: string[] | undefined;
        disallowedTools?: string[] | undefined;
        maxTokens?: number | undefined;
        temperature?: number | undefined;
    } | undefined;
}>;
/**
 * Validation result
 */
export interface ValidationResult {
    success: boolean;
    data?: MaskSchema;
    errors?: Array<{
        path: string;
        message: string;
    }>;
}
/**
 * Validate a mask object against the schema
 */
export declare function validateMask(mask: unknown): ValidationResult;
/**
 * Validate and throw on error
 */
export declare function validateMaskOrThrow(mask: unknown): MaskSchema;
//# sourceMappingURL=validator.d.ts.map