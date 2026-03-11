/**
 * Project Context Management
 * 
 * 프로젝트 전체 메타데이터 관리
 * 
 * "Each function should do one thing and do it well" - Kent Beck
 */

import { mkdir, readFile, writeFile } from 'fs/promises'
import { existsSync } from 'fs'
import type { ProjectContext, Result } from './types.js'
import { getContextDir, getProjectPath } from './config.js'
import { errorMessage } from './utils.js'

// ============================================================================
// Project Context Operations
// ============================================================================

/**
 * 프로젝트 컨텍스트를 읽어옵니다.
 */
export async function getProjectContext(basePath: string): Promise<Result<ProjectContext>> {
  try {
    const projectPath = getProjectPath(basePath)
    
    if (!existsSync(projectPath)) {
      return {
        success: false,
        error: '[Context] Project context not found. Run initContextDir first.',
      }
    }

    const content = await readFile(projectPath, 'utf-8')
    const data = JSON.parse(content) as ProjectContext
    
    return { success: true, data }
  } catch (error) {
    return {
      success: false,
      error: `[Context] Failed to read project context: ${errorMessage(error)}`,
    }
  }
}

/**
 * 프로젝트 컨텍스트를 저장합니다.
 */
export async function saveProjectContext(
  basePath: string,
  context: ProjectContext
): Promise<Result<void>> {
  try {
    const projectPath = getProjectPath(basePath)
    
    // 디렉토리가 없으면 초기화
    if (!existsSync(getContextDir(basePath))) {
      const initResult = await initContextDir(basePath)
      if (!initResult.success) {
        return initResult
      }
    }

    await writeFile(projectPath, JSON.stringify(context, null, 2), 'utf-8')
    
    return { success: true }
  } catch (error) {
    return {
      success: false,
      error: `[Context] Failed to save project context: ${errorMessage(error)}`,
    }
  }
}

// ============================================================================
// Directory Initialization
// ============================================================================

/**
 * 컨텍스트 디렉토리 구조를 초기화합니다.
 * 
 * 생성 구조:
 * .opencode/context/
 * ├── project.json
 * └── features/
 */
export async function initContextDir(basePath: string): Promise<Result<void>> {
  try {
    const { getFeaturesDir } = await import('./config.js')
    const featuresDir = getFeaturesDir(basePath)
    const projectPath = getProjectPath(basePath)

    // 디렉토리 생성 (recursive)
    await mkdir(featuresDir, { recursive: true })

    // project.json이 없으면 기본값으로 생성
    if (!existsSync(projectPath)) {
      const defaultProject: ProjectContext = {
        name: basePath.split(/[/\\]/).pop() || 'unnamed-project',
      }
      await writeFile(projectPath, JSON.stringify(defaultProject, null, 2), 'utf-8')
    }

    return { success: true }
  } catch (error) {
    return {
      success: false,
      error: `[Context] Failed to initialize: ${errorMessage(error)}`,
    }
  }
}
