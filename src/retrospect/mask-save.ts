/**
 * Mask Save Logic
 * 
 * 효과적인 가면을 MASKS.md에 저장
 * 
 * "Clean code reads like well-written prose" - Kent Beck
 */

import { join } from 'path'
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs'
import { getMemoryPath } from './retrospect.js'

// ============================================================================
// Constants
// ============================================================================

const EFFECTIVENESS_NEW_SCORE_WEIGHT = 0.3
const CUSTOM_SECTION_HEADER = '## 커스텀 가면'

// ============================================================================
// Types
// ============================================================================

interface MaskDefinition {
  name: string
  expertise: string
  thinkingStyle: string
  strengths: string
  suitableFor: string
  effectivenessScore: number
}

interface MaskSaveInput {
  name: string
  expertise: string
  thinkingStyle: string
  strengths: string
  suitableFor: string
  effectivenessScore: number
  usageNote?: string
}

interface MaskSaveResult {
  success: boolean
  action: 'created' | 'updated' | null
  maskName: string
  effectivenessScore?: number
  message: string
}

// ============================================================================
// Date Formatting
// ============================================================================

function formatTimestamp(): string {
  const now = new Date()
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  const hour = String(now.getHours()).padStart(2, '0')
  const minute = String(now.getMinutes()).padStart(2, '0')
  
  return `${year}-${month}-${day} ${hour}:${minute}`
}

// ============================================================================
// Effectiveness Score Calculation
// ============================================================================

/**
 * 이동 평균으로 효과성 점수 계산
 * 
 * "The simplest thing that could possibly work" - Kent Beck
 */
function calculateMovingAverageScore(
  currentScore: number,
  newScore: number,
  weight: number = EFFECTIVENESS_NEW_SCORE_WEIGHT
): number {
  if (currentScore === 0) {
    return newScore
  }
  
  const updatedScore = currentScore * (1 - weight) + newScore * weight
  return Math.round(updatedScore * 10) / 10 // 소수점 첫째 자리까지
}

// ============================================================================
// Markdown Parsing
// ============================================================================

/**
 * 이름을 비교 가능한 형태로 정규화
 */
function normalizeNameForComparison(name: string): string {
  return name
    .toLowerCase()
    .replace(/\s+/g, '')
    .replace(/[()]/g, '')
}

/**
 * MASKS.md에서 특정 가면 섹션을 찾습니다.
 */
function findMaskSection(content: string, maskName: string): { start: number; end: number; score: number } | null {
  const lines = content.split('\n')
  const normalizedTarget = normalizeNameForComparison(maskName)
  
  let currentMaskStart = -1
  let currentMaskName = ''
  let currentScore = 0
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    
    // ### 가면명 형식 감지
    if (line.startsWith('### ')) {
      // 이전 가면 섹션 종료 체크
      if (currentMaskStart !== -1) {
        const normalizedCurrent = normalizeNameForComparison(currentMaskName)
        if (normalizedCurrent === normalizedTarget) {
          return { start: currentMaskStart, end: i - 1, score: currentScore }
        }
      }
      
      // 새 가면 섹션 시작
      currentMaskStart = i
      const withoutPrefix = line.replace(/^###\s*/, '')
      const nameMatch = withoutPrefix.match(/^([^(]+)/)
      currentMaskName = nameMatch ? nameMatch[1].trim() : withoutPrefix.trim()
      currentScore = 0
    }
    
    // 효과성 점수 추출
    if (currentMaskStart !== -1 && line.includes('**효과성 점수**')) {
      const colonIndex = line.indexOf(':')
      if (colonIndex !== -1) {
        const value = line.slice(colonIndex + 1).trim()
        currentScore = value === '-' ? 0 : parseFloat(value) || 0
      }
    }
  }
  
  // 마지막 가면 체크
  if (currentMaskStart !== -1) {
    const normalizedCurrent = normalizeNameForComparison(currentMaskName)
    if (normalizedCurrent === normalizedTarget) {
      return { start: currentMaskStart, end: lines.length - 1, score: currentScore }
    }
  }
  
  return null
}

// ============================================================================
// Markdown Generation
// ============================================================================

/**
 * 새 가면 섹션 마크다운 생성
 */
function generateNewMaskSection(input: MaskSaveInput): string {
  const timestamp = formatTimestamp()
  const usageRecord = input.usageNote 
    ? `  - ${timestamp} (점수: ${input.effectivenessScore}) - ${input.usageNote}`
    : `  - ${timestamp} (점수: ${input.effectivenessScore})`
  
  return `### ${input.name}
- **전문 분야**: ${input.expertise}
- **사고 방식**: ${input.thinkingStyle}
- **강점**: ${input.strengths}
- **적합한 작업**: ${input.suitableFor}
- **효과성 점수**: ${input.effectivenessScore}
- **사용 기록**: 
${usageRecord}
`
}

/**
 * 기존 가면 섹션 업데이트
 */
function updateExistingMask(
  content: string,
  section: { start: number; end: number; score: number },
  newScore: number,
  usageNote?: string
): string {
  const lines = content.split('\n')
  const timestamp = formatTimestamp()
  const newUsageRecord = usageNote
    ? `  - ${timestamp} (점수: ${newScore}) - ${usageNote}`
    : `  - ${timestamp} (점수: ${newScore})`
  
  // 효과성 점수 업데이트
  const updatedScore = calculateMovingAverageScore(section.score, newScore)
  
  const sectionLines = lines.slice(section.start, section.end + 1)
  const result: string[] = []
  let usageRecordInserted = false
  
  for (const line of sectionLines) {
    // 효과성 점수 라인 업데이트
    if (line.includes('**효과성 점수**')) {
      result.push(`- **효과성 점수**: ${updatedScore}`)
    }
    // 사용 기록 라인 찾기
    else if (line.includes('**사용 기록**')) {
      result.push(line)
      // 바로 다음에 새 기록 추가
      result.push(newUsageRecord)
      usageRecordInserted = true
    }
    else {
      result.push(line)
    }
  }
  
  // 사용 기록 섹션이 없으면 마지막에 추가
  if (!usageRecordInserted) {
    result.push(`- **사용 기록**: `)
    result.push(newUsageRecord)
  }
  
  // 전체 파일 재구성
  const before = lines.slice(0, section.start)
  const after = lines.slice(section.end + 1)
  
  return [...before, ...result, ...after].join('\n')
}

/**
 * 새 가면 추가
 */
function addNewMask(content: string, input: MaskSaveInput): string {
  const newSection = generateNewMaskSection(input)
  
  // 커스텀 가면 섹션 찾기
  const customSectionIndex = content.indexOf(CUSTOM_SECTION_HEADER)
  
  if (customSectionIndex !== -1) {
    // 커스텀 섹션 바로 다음에 추가
    const insertPosition = customSectionIndex + CUSTOM_SECTION_HEADER.length
    const afterHeader = content.slice(insertPosition)
    const beforeHeader = content.slice(0, insertPosition)
    
    return `${beforeHeader}\n\n${newSection}${afterHeader}`
  }
  
  // 커스텀 섹션이 없으면 파일 끝에 추가
  return `${content}\n${CUSTOM_SECTION_HEADER}\n\n${newSection}`
}

// ============================================================================
// File Operations
// ============================================================================

/**
 * MASKS.md 파일 읽기
 */
function readMasksFile(basePath: string): string {
  const masksPath = getMemoryPath('masks', basePath)
  
  if (!existsSync(masksPath)) {
    // 기본 템플릿 반환
    return `# 가면 라이브러리 (Mask Library)

이 파일은 가면술사가 사용하는 가면들의 정의와 효과성을 기록합니다.
성공적으로 사용된 가면들을 저장하여 향후 유사한 작업에 활용합니다.

---

## 검증된 가면 목록

---

${CUSTOM_SECTION_HEADER}

`
  }
  
  return readFileSync(masksPath, 'utf-8')
}

/**
 * MASKS.md 파일 쓰기
 */
function writeMasksFile(basePath: string, content: string): void {
  const masksPath = getMemoryPath('masks', basePath)
  const dir = join(basePath, '.opencode', 'memory')
  
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true })
  }
  
  writeFileSync(masksPath, content, 'utf-8')
}

// ============================================================================
// Main Function
// ============================================================================

/**
 * 가면 저장
 * 
 * "Make each function tell a story" - Kent Beck
 */
export function saveMask(
  basePath: string,
  input: MaskSaveInput
): MaskSaveResult {
  try {
    // 1. MASKS.md 읽기
    let content = readMasksFile(basePath)
    
    // 2. 해당 가면이 있는지 확인
    const existingSection = findMaskSection(content, input.name)
    
    let action: 'created' | 'updated'
    
    if (existingSection) {
      // 3a. 기존 가면 업데이트
      content = updateExistingMask(
        content,
        existingSection,
        input.effectivenessScore,
        input.usageNote
      )
      action = 'updated'
    } else {
      // 3b. 새 가면 추가
      content = addNewMask(content, input)
      action = 'created'
    }
    
    // 4. 파일 저장
    writeMasksFile(basePath, content)
    
    return {
      success: true,
      action,
      maskName: input.name,
      effectivenessScore: input.effectivenessScore,
      message: action === 'created'
        ? `새 가면 '${input.name}'이(가) 추가되었습니다.`
        : `가면 '${input.name}'의 효과성 점수가 업데이트되었습니다.`
    }
    
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    return {
      success: false,
      action: null,
      maskName: input.name,
      message: `가면 저장 실패: ${errorMessage}`
    }
  }
}

// Export types
export type { MaskSaveInput, MaskSaveResult }
