/**
 * Context Configuration
 * 
 * 컨텍스트 시스템의 설정과 경로 유틸리티
 * 
 * "Configuration should be obvious and in one place" - Kent Beck
 */

import { join } from 'path'

// ============================================================================
// Configuration
// ============================================================================

export const CONTEXT_CONFIG = {
  paths: {
    contextDir: '.opencode/context',
    projectFile: 'project.json',
    featuresDir: 'features',
  },
  defaults: {
    status: 'active' as const,
  },
} as const

// ============================================================================
// Path Utilities
// ============================================================================

/**
 * 컨텍스트 디렉토리 경로 반환
 */
export function getContextDir(basePath: string): string {
  return join(basePath, CONTEXT_CONFIG.paths.contextDir)
}

/**
 * 프로젝트 컨텍스트 파일 경로 반환
 */
export function getProjectPath(basePath: string): string {
  return join(getContextDir(basePath), CONTEXT_CONFIG.paths.projectFile)
}

/**
 * 피처 디렉토리 경로 반환
 */
export function getFeaturesDir(basePath: string): string {
  return join(getContextDir(basePath), CONTEXT_CONFIG.paths.featuresDir)
}

/**
 * 특정 피처 파일 경로 반환
 */
export function getFeaturePath(basePath: string, id: string): string {
  return join(getFeaturesDir(basePath), `${id}.json`)
}

/**
 * 설정 내보내기 (외부 모듈에서 참조용)
 */
export function getContextConfig(): typeof CONTEXT_CONFIG {
  return CONTEXT_CONFIG
}
