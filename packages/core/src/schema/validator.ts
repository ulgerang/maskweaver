/**
 * Mask Schema Validator
 * 
 * Validates mask YAML/JSON against the schema using Zod.
 */

import { z } from 'zod';
import type { MaskSchema } from './types';

// Communication style enums
const CommunicationToneSchema = z.enum(['direct', 'friendly', 'formal', 'socratic', 'enthusiastic']);
const VerbositySchema = z.enum(['concise', 'moderate', 'detailed']);
const TechnicalDepthSchema = z.enum(['beginner', 'intermediate', 'expert']);
const LanguageSchema = z.enum(['en', 'ko', 'zh', 'ja']);

// Metadata schema
const MaskMetadataSchema = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/, 'ID must be kebab-case'),
  version: z.literal('1.0'),
  language: LanguageSchema,
  created: z.string().datetime(),
  updated: z.string().datetime(),
  authors: z.array(z.string()).optional(),
  relatedMasks: z.array(z.string()).optional(),
  tags: z.array(z.string()).optional(),
});

// Profile schema
const MaskProfileSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  tagline: z.string().min(1, 'Tagline is required'),
  background: z.string().min(50, 'Background should be at least 50 characters'),
  expertise: z.array(z.string()).min(1).max(10),
  thinkingStyle: z.string().min(20, 'Thinking style should be descriptive'),
  strengths: z.array(z.string()).min(1).max(10),
  limitations: z.array(z.string()).optional(),
});

// Behavior schema
const MaskBehaviorSchema = z.object({
  systemPrompt: z.string().min(100, 'System prompt should be detailed'),
  communicationStyle: z.object({
    tone: CommunicationToneSchema,
    verbosity: VerbositySchema,
    technicalDepth: TechnicalDepthSchema,
  }),
  approachPatterns: z.object({
    problemSolving: z.string(),
    codeReview: z.string(),
    architecture: z.string().optional(),
    debugging: z.string().optional(),
  }),
  signaturePhrases: z.array(z.string()).optional(),
});

// Usage schema
const MaskUsageExampleSchema = z.object({
  scenario: z.string(),
  expectedOutcome: z.string(),
});

const MaskUsageSchema = z.object({
  suitableFor: z.array(z.string()).min(1),
  notSuitableFor: z.array(z.string()).optional(),
  examples: z.array(MaskUsageExampleSchema).min(1),
});

// Config schema
const MaskConfigSchema = z.object({
  priority: z.number().min(0).max(100).optional(),
  allowedTools: z.array(z.string()).optional(),
  disallowedTools: z.array(z.string()).optional(),
  maxTokens: z.number().positive().optional(),
  temperature: z.number().min(0).max(2).optional(),
}).optional();

// Complete mask schema
export const MaskSchemaValidator = z.object({
  metadata: MaskMetadataSchema,
  profile: MaskProfileSchema,
  behavior: MaskBehaviorSchema,
  usage: MaskUsageSchema,
  config: MaskConfigSchema,
});

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
export function validateMask(mask: unknown): ValidationResult {
  const result = MaskSchemaValidator.safeParse(mask);
  
  if (result.success) {
    return {
      success: true,
      data: result.data as MaskSchema,
    };
  }
  
  return {
    success: false,
    errors: result.error.errors.map(err => ({
      path: err.path.join('.'),
      message: err.message,
    })),
  };
}

/**
 * Validate and throw on error
 */
export function validateMaskOrThrow(mask: unknown): MaskSchema {
  const result = validateMask(mask);
  
  if (!result.success) {
    const errorMessages = result.errors?.map(e => `${e.path}: ${e.message}`).join('\n');
    throw new Error(`Invalid mask schema:\n${errorMessages}`);
  }
  
  return result.data!;
}
