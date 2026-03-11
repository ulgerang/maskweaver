/**
 * Feature File Management
 * 
 * 피처에 파일 추가/제거
 * 
 * "Simple operations, clearly named" - Kent Beck
 */

import type { FeatureContext, Result } from './types.js'
import { normalizePath } from './utils.js'
import { getFeature, updateFeature } from './feature.js'

// ============================================================================
// Add File
// ============================================================================

/**
 * 피처에 파일을 추가합니다.
 */
export async function addFileToFeature(
  basePath: string,
  id: string,
  filePath: string
): Promise<Result<FeatureContext>> {
  const feature = await getFeature(basePath, id)
  if (!feature.success || !feature.data) {
    return feature
  }

  // 정규화된 경로
  const normalizedPath = normalizePath(filePath)

  // 중복 체크
  if (feature.data.files.includes(normalizedPath)) {
    return { success: true, data: feature.data } // 이미 있으면 그냥 성공
  }

  const updatedFiles = [...feature.data.files, normalizedPath]
  return updateFeature(basePath, id, { files: updatedFiles })
}

// ============================================================================
// Remove File
// ============================================================================

/**
 * 피처에서 파일을 제거합니다.
 */
export async function removeFileFromFeature(
  basePath: string,
  id: string,
  filePath: string
): Promise<Result<FeatureContext>> {
  const feature = await getFeature(basePath, id)
  if (!feature.success || !feature.data) {
    return feature
  }

  // 정규화된 경로
  const normalizedPath = normalizePath(filePath)

  const updatedFiles = feature.data.files.filter(f => f !== normalizedPath)
  
  // 변경이 없으면 그냥 성공
  if (updatedFiles.length === feature.data.files.length) {
    return { success: true, data: feature.data }
  }

  return updateFeature(basePath, id, { files: updatedFiles })
}
