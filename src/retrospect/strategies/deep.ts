/**
 * Deep Retrospect Strategy
 * 
 * 심층 회고: 전체 정보 + 통계 + 교훈
 * 
 * "Reflect deeply on what matters" - Kent Beck
 */

import type { RetrospectInput, MaskUsageRecord } from '../types.js'
import type { RetrospectStrategy } from './base.js'

function formatTimestamp(): string {
  const now = new Date()
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  const hour = String(now.getHours()).padStart(2, '0')
  const minute = String(now.getMinutes()).padStart(2, '0')
  
  return `${year}-${month}-${day} ${hour}:${minute}`
}

const TRIGGER_LABELS = {
  manual: '수동 요청',
  session_end: '세션 종료',
  periodic: '주기적 회고'
} as const

/**
 * 효과성 점수에 따른 라벨 반환
 */
function getEffectivenessLabel(score: number): string {
  if (score >= 90) return '매우 효과적'
  if (score >= 70) return '효과적'
  if (score >= 50) return '보통'
  if (score >= 30) return '개선 필요'
  return '재고 필요'
}

/**
 * 평균 효과성 계산
 */
function calculateAverageEffectiveness(masks: MaskUsageRecord[]): number {
  if (masks.length === 0) return 0
  const sum = masks.reduce((acc, mask) => acc + mask.effectiveness, 0)
  return sum / masks.length
}

/**
 * Deep 회고 전략
 * 
 * 가장 상세한 회고. 모든 정보와 통계, 교훈까지 기록합니다.
 */
export class DeepRetrospectStrategy implements RetrospectStrategy {
  generateContent(input: RetrospectInput): string {
    const timestamp = formatTimestamp()
    const triggerLabel = TRIGGER_LABELS[input.trigger]
    
    const lines: string[] = [
      `### ${timestamp} - [${triggerLabel}] (심층 회고)`,
      '',
      '#### 오늘의 작업 요약',
      input.summary ?? '(요약 없음)',
      ''
    ]
    
    // 가면 사용 정보 - 상세
    if (input.masksUsed && input.masksUsed.length > 0) {
      lines.push('#### 사용한 가면')
      for (const mask of input.masksUsed) {
        lines.push(`- **${mask.name}** (효과성: ${mask.effectiveness}/100)`)
        lines.push(`  - 작업: ${mask.task}`)
        lines.push(`  - 평가: ${getEffectivenessLabel(mask.effectiveness)}`)
      }
      lines.push('')
      
      // 가면 사용 통계
      const avgEffectiveness = calculateAverageEffectiveness(input.masksUsed)
      lines.push(`> 가면 사용 통계: ${input.masksUsed.length}개 사용, 평균 효과성 ${avgEffectiveness.toFixed(1)}/100`)
      lines.push('')
    }
    
    // 잘된 점
    if (input.wellDone && input.wellDone.length > 0) {
      lines.push('#### 잘된 점')
      for (const item of input.wellDone) {
        lines.push(`- ${item}`)
      }
      lines.push('')
    }
    
    // 개선할 점
    if (input.improvements && input.improvements.length > 0) {
      lines.push('#### 개선할 점')
      for (const item of input.improvements) {
        lines.push(`- ${item}`)
      }
      lines.push('')
    }
    
    // 배운 교훈 - 심층 회고에서만
    if (input.lessons && input.lessons.length > 0) {
      lines.push('#### 배운 교훈')
      for (const lesson of input.lessons) {
        lines.push(`- ${lesson}`)
      }
      lines.push('')
    }
    
    // 구분선
    lines.push('---')
    lines.push('')
    
    return lines.join('\n')
  }
}
