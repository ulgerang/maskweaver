/**
 * Feature Management
 * 
 * 피처의 생성, 조회, 업데이트, 목록, 전환, 완료, 삭제
 * 
 * "Keep functions small and focused" - Kent Beck
 */

import { randomUUID } from 'crypto'
import { readFile, writeFile, readdir, unlink } from 'fs/promises'
import { existsSync } from 'fs'
import type { FeatureContext, FeatureUpdate, ProjectContext, Result } from './types.js'
import { CONTEXT_CONFIG, getFeaturePath, getFeaturesDir } from './config.js'
import { now, errorMessage } from './utils.js'
import { getProjectContext, saveProjectContext, initContextDir } from './project.js'

// ============================================================================
// Create Feature
// ============================================================================

/**
 * 새로운 피처를 생성합니다.
 */
export async function createFeature(
  basePath: string,
  name: string,
  goal: string
): Promise<Result<FeatureContext>> {
  try {
    // 입력 검증
    if (!name || name.trim().length === 0) {
      return { success: false, error: '[Context] Feature name is required' }
    }
    if (!goal || goal.trim().length === 0) {
      return { success: false, error: '[Context] Feature goal is required' }
    }

    // 디렉토리 확인/초기화
    if (!existsSync(getFeaturesDir(basePath))) {
      const initResult = await initContextDir(basePath)
      if (!initResult.success) {
        return { success: false, error: initResult.error }
      }
    }

    const timestamp = now()
    const feature: FeatureContext = {
      id: randomUUID(),
      name: name.trim(),
      goal: goal.trim(),
      status: CONTEXT_CONFIG.defaults.status,
      files: [],
      lastContext: '',
      createdAt: timestamp,
      updatedAt: timestamp,
    }

    const featurePath = getFeaturePath(basePath, feature.id)
    await writeFile(featurePath, JSON.stringify(feature, null, 2), 'utf-8')

    return { success: true, data: feature }
  } catch (error) {
    return {
      success: false,
      error: `[Context] Failed to create feature: ${errorMessage(error)}`,
    }
  }
}

// ============================================================================
// Read Feature
// ============================================================================

/**
 * 특정 피처를 조회합니다.
 */
export async function getFeature(
  basePath: string,
  id: string
): Promise<Result<FeatureContext>> {
  try {
    const featurePath = getFeaturePath(basePath, id)
    
    if (!existsSync(featurePath)) {
      return {
        success: false,
        error: `[Context] Feature not found: ${id}`,
      }
    }

    const content = await readFile(featurePath, 'utf-8')
    const data = JSON.parse(content) as FeatureContext
    
    return { success: true, data }
  } catch (error) {
    return {
      success: false,
      error: `[Context] Failed to read feature: ${errorMessage(error)}`,
    }
  }
}

// ============================================================================
// Update Feature
// ============================================================================

/**
 * 피처를 업데이트합니다.
 */
export async function updateFeature(
  basePath: string,
  id: string,
  updates: FeatureUpdate
): Promise<Result<FeatureContext>> {
  try {
    // 기존 피처 조회
    const existing = await getFeature(basePath, id)
    if (!existing.success || !existing.data) {
      return existing
    }

    // 업데이트 적용 (id와 createdAt은 불변)
    const updated: FeatureContext = {
      ...existing.data,
      ...updates,
      id: existing.data.id,
      createdAt: existing.data.createdAt,
      updatedAt: now(),
    }

    const featurePath = getFeaturePath(basePath, id)
    await writeFile(featurePath, JSON.stringify(updated, null, 2), 'utf-8')

    return { success: true, data: updated }
  } catch (error) {
    return {
      success: false,
      error: `[Context] Failed to update feature: ${errorMessage(error)}`,
    }
  }
}

// ============================================================================
// List Features
// ============================================================================

/**
 * 모든 피처 목록을 반환합니다.
 */
export async function listFeatures(basePath: string): Promise<Result<FeatureContext[]>> {
  try {
    const featuresDir = getFeaturesDir(basePath)
    
    if (!existsSync(featuresDir)) {
      return { success: true, data: [] }
    }

    const files = await readdir(featuresDir)
    const jsonFiles = files.filter(f => f.endsWith('.json'))
    
    const features: FeatureContext[] = []
    
    for (const file of jsonFiles) {
      const id = file.replace('.json', '')
      const result = await getFeature(basePath, id)
      if (result.success && result.data) {
        features.push(result.data)
      }
    }

    // 최신 업데이트 순으로 정렬
    features.sort((a, b) => 
      new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
    )

    return { success: true, data: features }
  } catch (error) {
    return {
      success: false,
      error: `[Context] Failed to list features: ${errorMessage(error)}`,
    }
  }
}

// ============================================================================
// Switch Feature
// ============================================================================

/**
 * 활성 피처를 전환합니다.
 * 
 * 프로젝트 컨텍스트의 activeFeatureId를 업데이트하고,
 * 해당 피처의 상태를 'active'로 변경합니다.
 */
export async function switchFeature(
  basePath: string,
  id: string
): Promise<Result<FeatureContext>> {
  try {
    // 피처 존재 확인
    const feature = await getFeature(basePath, id)
    if (!feature.success || !feature.data) {
      return feature
    }

    // 이미 completed인 피처는 전환 불가
    if (feature.data.status === 'completed') {
      return {
        success: false,
        error: '[Context] Cannot switch to completed feature. Reopen it first.',
      }
    }

    // 프로젝트 컨텍스트 업데이트
    const projectResult = await getProjectContext(basePath)
    const project: ProjectContext = projectResult.success && projectResult.data
      ? projectResult.data
      : { name: 'unnamed' }

    // 이전 활성 피처를 paused로 변경
    if (project.activeFeatureId && project.activeFeatureId !== id) {
      await updateFeature(basePath, project.activeFeatureId, { status: 'paused' })
    }

    // 현재 피처를 active로 변경
    const updated = await updateFeature(basePath, id, { status: 'active' })
    if (!updated.success) {
      return updated
    }

    // 프로젝트 컨텍스트에 activeFeatureId 저장
    project.activeFeatureId = id
    await saveProjectContext(basePath, project)

    return updated
  } catch (error) {
    return {
      success: false,
      error: `[Context] Failed to switch feature: ${errorMessage(error)}`,
    }
  }
}

// ============================================================================
// Complete Feature
// ============================================================================

/**
 * 피처를 완료 처리합니다.
 * 
 * - 상태를 'completed'로 변경
 * - activeFeatureId에서 제거
 */
export async function completeFeature(
  basePath: string,
  id: string
): Promise<Result<FeatureContext>> {
  try {
    // 피처 상태 변경
    const updated = await updateFeature(basePath, id, { status: 'completed' })
    if (!updated.success) {
      return updated
    }

    // 프로젝트 컨텍스트에서 activeFeatureId 제거 (해당 피처인 경우)
    const projectResult = await getProjectContext(basePath)
    if (projectResult.success && projectResult.data) {
      if (projectResult.data.activeFeatureId === id) {
        projectResult.data.activeFeatureId = undefined
        await saveProjectContext(basePath, projectResult.data)
      }
    }

    return updated
  } catch (error) {
    return {
      success: false,
      error: `[Context] Failed to complete feature: ${errorMessage(error)}`,
    }
  }
}

// ============================================================================
// Delete Feature
// ============================================================================

/**
 * 피처를 삭제합니다.
 * 
 * 주의: 이 작업은 되돌릴 수 없습니다.
 */
export async function deleteFeature(
  basePath: string,
  id: string
): Promise<Result<void>> {
  try {
    const featurePath = getFeaturePath(basePath, id)
    
    if (!existsSync(featurePath)) {
      return {
        success: false,
        error: `[Context] Feature not found: ${id}`,
      }
    }

    // 활성 피처인 경우 프로젝트 컨텍스트에서 제거
    const projectResult = await getProjectContext(basePath)
    if (projectResult.success && projectResult.data) {
      if (projectResult.data.activeFeatureId === id) {
        projectResult.data.activeFeatureId = undefined
        await saveProjectContext(basePath, projectResult.data)
      }
    }

    await unlink(featurePath)
    
    return { success: true }
  } catch (error) {
    return {
      success: false,
      error: `[Context] Failed to delete feature: ${errorMessage(error)}`,
    }
  }
}

// ============================================================================
// Get Active Feature
// ============================================================================

/**
 * 현재 활성 피처를 조회합니다.
 */
export async function getActiveFeature(basePath: string): Promise<Result<FeatureContext | null>> {
  try {
    const projectResult = await getProjectContext(basePath)
    
    if (!projectResult.success || !projectResult.data) {
      return { success: true, data: null }
    }

    if (!projectResult.data.activeFeatureId) {
      return { success: true, data: null }
    }

    return getFeature(basePath, projectResult.data.activeFeatureId)
  } catch (error) {
    return {
      success: false,
      error: `[Context] Failed to get active feature: ${errorMessage(error)}`,
    }
  }
}
