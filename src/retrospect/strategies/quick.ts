/**
 * Quick Retrospect Strategy
 * 
 * 요약만 기록하는 빠른 회고
 * 
 * "Do the simplest thing that could possibly work" - Kent Beck
 */

import type { RetrospectInput } from '../types.js'
import type { RetrospectStrategy } from './base.js'

/**
 * 현재 시각을 포맷팅
 */
function formatTimestamp(): string {
  const now = new Date()
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  const hour = String(now.getHours()).padStart(2, '0')
  const minute = String(now.getMinutes()).padStart(2, '0')
  
  return `${year}-${month}-${day} ${hour}:${minute}`
}

/**
 * 트리거 라벨
 */
const TRIGGER_LABELS = {
  manual: '수동 요청',
  session_end: '세션 종료',
  periodic: '주기적 회고'
} as const

/**
 * Quick 회고 전략
 * 
 * 가장 간단한 회고. 요약과 가면 사용 정보만 기록합니다.
 */
export class QuickRetrospectStrategy implements RetrospectStrategy {
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
    
    // 가면 사용 정보가 있으면 간략히 추가
    if (input.masksUsed && input.masksUsed.length > 0) {
      lines.push('#### 사용한 가면')
      for (const mask of input.masksUsed) {
        lines.push(`- ${mask.name} (효과성: ${mask.effectiveness}/100)`)
      }
      lines.push('')
    }
    
    return lines.join('\n')
  }
}
