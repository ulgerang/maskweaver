/**
 * @maskweaver/core
 * 
 * Core library for Maskweaver - AI expert persona system.
 * 가면술사 핵심 라이브러리
 */

// Schema types
export type { Result } from '../shared/types.js';
export type {
  MaskSchema,
  MaskMetadata,
  MaskProfile,
  MaskBehavior,
  MaskUsage,
  MaskUsageExample,
  MaskConfig,
  MaskCatalog,
  MaskCatalogEntry,
  MaskCategory,
  LoadedMask,
  CommunicationTone,
  Verbosity,
  TechnicalDepth,
} from './schema/types';

// Validator
export {
  validateMask,
  validateMaskOrThrow,
  MaskSchemaValidator,
  type ValidationResult,
} from './schema/validator';

// Loader
export {
  MaskLoader,
  type MaskLoaderOptions,
} from './loader/MaskLoader';

// Prompt builder
export {
  promptBuilder,
  buildPrompt,
  buildMinimalPrompt,
  buildRichPrompt,
  type PromptBuilderOptions,
} from './engine/promptBuilder';
