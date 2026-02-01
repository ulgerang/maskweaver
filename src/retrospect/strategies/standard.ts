/**
 * Standard Retrospect Strategy
 * 
 * 표준 회고: 요약 + 가면 + 잘된 점/개선점
 * 
 * "Make it work, make it right, make it fast" - Kent Beck
 */

import type { RetrospectInput } from '../types.js'
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
 * Standard 회고 전략
 * 
 * 기본 회고. 작업 요약, 가면 사용, 잘된 점, 개선점을 기록합니다.
 */
export class StandardRetrospectStrategy implements RetrospectStrategy {
  generateContent(input: RetrospectInput): string {
    const timestamp = formatTimestamp()
    const triggerLabel = TRIGGER_LABELS[input.trigger]
    
    const lines: string[] = [
      `### ${timestamp} - [${triggerLabel}]`,
      '',
      '#### 오늘의 작업 요약',
      input.summary ?? '(요약 없음)',
      ''
    ]
    
    // 가면 사용 정보
    if (input.masksUsed && input.masksUsed.length > 0) {
      lines.push('#### 사용한 가면')
      for (const mask of input.masksUsed) {
        lines.push(`- **${mask.name}** (효과성: ${mask.effectiveness}/100)`)
        lines.push(`  - 작업: ${mask.task}`)
      }
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
    
    return lines.join('\n')
  }
}
