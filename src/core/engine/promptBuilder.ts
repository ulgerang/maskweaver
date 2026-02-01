/**
 * Prompt Builder
 * 
 * Builds system prompts from mask definitions.
 */

import type { MaskSchema, LoadedMask } from '../schema/types';

export interface PromptBuilderOptions {
  /** Include metadata in prompt header */
  includeMetadata?: boolean;
  
  /** Include usage examples */
  includeExamples?: boolean;
  
  /** Additional context to append */
  additionalContext?: string;
}

const DEFAULT_OPTIONS: PromptBuilderOptions = {
  includeMetadata: false,
  includeExamples: false,
};

/**
 * Build a system prompt from a mask
 */
export function buildPrompt(
  mask: MaskSchema | LoadedMask,
  options: PromptBuilderOptions = {}
): string {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const parts: string[] = [];
  
  // Header (optional)
  if (opts.includeMetadata) {
    parts.push(`# ${mask.profile.name}`);
    parts.push(`> ${mask.profile.tagline}`);
    parts.push('');
  }
  
  // Main system prompt (always included)
  parts.push(mask.behavior.systemPrompt.trim());
  
  // Signature phrases (if available)
  if (mask.behavior.signaturePhrases && mask.behavior.signaturePhrases.length > 0) {
    parts.push('');
    parts.push('SIGNATURE PHRASES YOU MAY USE:');
    for (const phrase of mask.behavior.signaturePhrases) {
      parts.push(`- "${phrase}"`);
    }
  }
  
  // Usage examples (optional)
  if (opts.includeExamples && mask.usage.examples.length > 0) {
    parts.push('');
    parts.push('EXAMPLE SCENARIOS:');
    for (const example of mask.usage.examples.slice(0, 3)) {
      parts.push(`- ${example.scenario}`);
      parts.push(`  → ${example.expectedOutcome}`);
    }
  }
  
  // Additional context (optional)
  if (opts.additionalContext) {
    parts.push('');
    parts.push('ADDITIONAL CONTEXT:');
    parts.push(opts.additionalContext);
  }
  
  return parts.join('\n');
}

/**
 * Build a minimal prompt (just the core system prompt)
 */
export function buildMinimalPrompt(mask: MaskSchema | LoadedMask): string {
  return mask.behavior.systemPrompt.trim();
}

/**
 * Build a rich prompt with all available information
 */
export function buildRichPrompt(mask: MaskSchema | LoadedMask): string {
  const parts: string[] = [];
  
  // Identity header
  parts.push(`You are ${mask.profile.name}.`);
  parts.push(`${mask.profile.tagline}`);
  parts.push('');
  
  // Background
  parts.push('BACKGROUND:');
  parts.push(mask.profile.background.trim());
  parts.push('');
  
  // Expertise
  parts.push('YOUR EXPERTISE:');
  for (const exp of mask.profile.expertise) {
    parts.push(`- ${exp}`);
  }
  parts.push('');
  
  // Thinking style
  parts.push('YOUR THINKING STYLE:');
  parts.push(mask.profile.thinkingStyle.trim());
  parts.push('');
  
  // Main behavior instructions
  parts.push('INSTRUCTIONS:');
  parts.push(mask.behavior.systemPrompt.trim());
  parts.push('');
  
  // Communication style
  const style = mask.behavior.communicationStyle;
  parts.push('COMMUNICATION STYLE:');
  parts.push(`- Tone: ${style.tone}`);
  parts.push(`- Verbosity: ${style.verbosity}`);
  parts.push(`- Technical depth: ${style.technicalDepth}`);
  parts.push('');
  
  // Strengths
  parts.push('YOUR STRENGTHS:');
  for (const strength of mask.profile.strengths) {
    parts.push(`- ${strength}`);
  }
  
  // Limitations (if any)
  if (mask.profile.limitations && mask.profile.limitations.length > 0) {
    parts.push('');
    parts.push('ACKNOWLEDGE YOUR LIMITATIONS:');
    for (const limitation of mask.profile.limitations) {
      parts.push(`- ${limitation}`);
    }
  }
  
  // Signature phrases
  if (mask.behavior.signaturePhrases && mask.behavior.signaturePhrases.length > 0) {
    parts.push('');
    parts.push('PHRASES YOU MIGHT USE:');
    for (const phrase of mask.behavior.signaturePhrases) {
      parts.push(`- "${phrase}"`);
    }
  }
  
  return parts.join('\n');
}

export const promptBuilder = {
  build: buildPrompt,
  minimal: buildMinimalPrompt,
  rich: buildRichPrompt,
};
