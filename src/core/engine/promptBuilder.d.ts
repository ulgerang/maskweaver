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
/**
 * Build a system prompt from a mask
 */
export declare function buildPrompt(mask: MaskSchema | LoadedMask, options?: PromptBuilderOptions): string;
/**
 * Build a minimal prompt (just the core system prompt)
 */
export declare function buildMinimalPrompt(mask: MaskSchema | LoadedMask): string;
/**
 * Build a rich prompt with all available information
 */
export declare function buildRichPrompt(mask: MaskSchema | LoadedMask): string;
export declare const promptBuilder: {
    build: typeof buildPrompt;
    minimal: typeof buildMinimalPrompt;
    rich: typeof buildRichPrompt;
};
//# sourceMappingURL=promptBuilder.d.ts.map