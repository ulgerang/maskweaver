/**
 * Retrospect Package
 * 
 * 회고 및 가면 관리 시스템
 * 
 * "Export only what matters" - Kent Beck
 */

// Types
export type {
  RetrospectTrigger,
  RetrospectDepth,
  MaskUsageRecord,
  RetrospectInput,
  RetrospectResult,
} from './types.js'

// Strategies
export type { RetrospectStrategy } from './strategies/base.js'
export {
  selectStrategy,
  QuickRetrospectStrategy,
  StandardRetrospectStrategy,
  DeepRetrospectStrategy,
} from './strategies/index.js'

// Core functions
export { performRetrospect, getMemoryPath, getDbPath } from './retrospect.js'

// Mask save
export { saveMask } from './mask-save.js'
export type { MaskSaveInput, MaskSaveResult } from './mask-save.js'
