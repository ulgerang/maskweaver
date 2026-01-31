/**
 * Retrospect Core
 * 
 * 회고 시스템의 메인 로직
 * 
 * "Each function has one clear purpose" - Kent Beck
 */

import { join } from 'path'
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs'
import type { RetrospectInput, RetrospectResult, MaskUsageRecord } from './types.js'
import { selectStrategy } from './strategies/index.js'

// ============================================================================
// Constants
// ============================================================================

const RETROSPECT_SECTION_HEADER = '## 회고 기록'

// ============================================================================
// Path Utilities
// ============================================================================

/**
 * 메모리 경로 반환
 */
function getMemoryPath(type: string, basePath: string): string {
  return join(basePath, '.opencode', 'memory', `${type.toUpperCase()}.md`)
}

/**
 * DB 경로 반환
 */
function getDbPath(basePath: string): string {
  return join(basePath, '.opencode', 'memory', 'memory.db')
}

// ============================================================================
// File Operations
// ============================================================================

/**
 * RETROSPECT.md 파일 읽기
 */
function readRetrospectFile(basePath: string): string {
  const retrospectPath = getMemoryPath('retrospect', basePath)
  
  if (!existsSync(retrospectPath)) {
    // 기본 템플릿 반환
    return `# 회고록 (Retrospective Journal)

이 파일은 가면술사의 회고와 성찰을 기록합니다.
세션 종료 시, 주기적으로, 또는 수동 요청 시 회고를 수행하고 기록합니다.

---

${RETROSPECT_SECTION_HEADER}

`
  }
  
  return readFileSync(retrospectPath, 'utf-8')
}

/**
 * RETROSPECT.md 파일 쓰기
 */
function writeRetrospectFile(basePath: string, content: string): void {
  const retrospectPath = getMemoryPath('retrospect', basePath)
  const dir = join(basePath, '.opencode', 'memory')
  
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true })
  }
  
  writeFileSync(retrospectPath, content, 'utf-8')
}

/**
 * 회고 내용을 파일에 추가
 * 
 * 회고 기록 섹션 바로 다음에 새 회고를 추가합니다.
 * (최신 회고가 위에 오도록)
 */
function appendRetrospect(content: string, retrospectContent: string): string {
  const sectionIndex = content.indexOf(RETROSPECT_SECTION_HEADER)
  
  if (sectionIndex !== -1) {
    const insertPosition = sectionIndex + RETROSPECT_SECTION_HEADER.length
    const before = content.slice(0, insertPosition)
    const after = content.slice(insertPosition)
    
    return `${before}\n\n${retrospectContent}${after}`
  }
  
  // 섹션이 없으면 끝에 추가
  return `${content}\n${RETROSPECT_SECTION_HEADER}\n\n${retrospectContent}`
}

// ============================================================================
// Statistics
// ============================================================================

/**
 * 평균 효과성 계산
 */
function calculateAverageEffectiveness(masks: MaskUsageRecord[]): number {
  if (masks.length === 0) return 0
  const sum = masks.reduce((acc, mask) => acc + mask.effectiveness, 0)
  return sum / masks.length
}

/**
 * 회고 요약 통계 계산
 */
function calculateSummaryStats(input: RetrospectInput): RetrospectResult['summary'] {
  const masksUsed = input.masksUsed?.length ?? 0
  const avgEffectiveness = input.masksUsed && input.masksUsed.length > 0
    ? calculateAverageEffectiveness(input.masksUsed)
    : 0
  
  // 작업 수는 요약에서 줄바꿈으로 대략 추정
  const tasksCompleted = input.summary.split('\n').filter(l => l.trim().startsWith('-')).length || 1
  
  return {
    tasksCompleted,
    masksUsed,
    averageEffectiveness: Math.round(avgEffectiveness * 10) / 10
  }
}

// ============================================================================
// Main Retrospect Function
// ============================================================================

/**
 * 회고 수행
 * 
 * "Make it work, make it right, make it fast" - Kent Beck
 */
export function performRetrospect(
  basePath: string,
  input: RetrospectInput
): RetrospectResult {
  try {
    const depth = input.depth ?? 'standard'
    
    // 1. 전략 선택
    const strategy = selectStrategy(depth)
    
    // 2. 회고 내용 생성
    const retrospectContent = strategy.generateContent(input)
    
    // 3. RETROSPECT.md 읽기 및 업데이트
    let content = readRetrospectFile(basePath)
    content = appendRetrospect(content, retrospectContent)
    
    // 4. 파일 저장
    writeRetrospectFile(basePath, content)
    
    // 5. 통계 계산
    const summaryStats = calculateSummaryStats(input)
    
    // 6. 결과 반환
    const retrospectPath = getMemoryPath('retrospect', basePath)
    
    const TRIGGER_LABELS = {
      manual: '수동 요청',
      session_end: '세션 종료',
      periodic: '주기적 회고'
    } as const
    
    return {
      success: true,
      retrospectPath,
      summary: summaryStats,
      message: `회고가 기록되었습니다. (${TRIGGER_LABELS[input.trigger]}, ${depth} 깊이)`
    }
    
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    const retrospectPath = getMemoryPath('retrospect', basePath)
    
    return {
      success: false,
      retrospectPath,
      summary: {
        tasksCompleted: 0,
        masksUsed: 0,
        averageEffectiveness: 0
      },
      message: `회고 기록 실패: ${errorMessage}`
    }
  }
}

// ============================================================================
// Export Path Utilities (for mask-save)
// ============================================================================

export { getMemoryPath, getDbPath }
