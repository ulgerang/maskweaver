/**
 * Context Utilities
 * 
 * 작은, 재사용 가능한 유틸리티 함수들
 * 
 * "Small functions, well named, doing one thing" - Kent Beck
 */

// ============================================================================
// Time Utilities
// ============================================================================

/**
 * 현재 시각을 ISO 8601 형식으로 반환
 */
export function now(): string {
  return new Date().toISOString()
}

// ============================================================================
// Error Handling
// ============================================================================

/**
 * 에러에서 메시지 추출
 * 
 * "Handle errors gracefully" - Kent Beck
 */
export function errorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message
  }
  return String(error)
}

// ============================================================================
// Path Normalization
// ============================================================================

/**
 * 파일 경로 정규화 (Windows 백슬래시 → 슬래시)
 */
export function normalizePath(filePath: string): string {
  return filePath.replace(/\\/g, '/')
}
