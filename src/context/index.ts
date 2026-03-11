/**
 * Context Package
 * 
 * 피처 기반 컨텍스트 관리 시스템
 * 
 * "Export only what's needed" - Kent Beck
 */

// Types
export type {
  FeatureContext,
  ProjectContext,
  FeatureUpdate,
  Result,
} from './types.js'

// Configuration
export {
  CONTEXT_CONFIG,
  getContextDir,
  getProjectPath,
  getFeaturesDir,
  getFeaturePath,
  getContextConfig,
} from './config.js'

// Project Context
export {
  getProjectContext,
  saveProjectContext,
  initContextDir,
} from './project.js'

// Feature Management
export {
  createFeature,
  getFeature,
  updateFeature,
  listFeatures,
  switchFeature,
  completeFeature,
  deleteFeature,
  getActiveFeature,
} from './feature.js'

// File Management
export {
  addFileToFeature,
  removeFileFromFeature,
} from './files.js'

// Utilities
export {
  now,
  errorMessage,
  normalizePath,
} from './utils.js'
