/**
 * Retrospect Strategy Pattern
 * 
 * 회고 깊이에 따른 전략 패턴
 * 
 * "Use patterns when they make code clearer" - Kent Beck
 */

import type { RetrospectInput } from '../types.js'

/**
 * 전략 패턴: 회고 깊이에 따른 마크다운 생성
 * 
 * 이 패턴을 선택한 이유:
 * - 각 깊이의 로직이 명확히 분리됨
 * - 새로운 깊이 추가가 용이
 * - 조건문 중첩 방지
 */
export interface RetrospectStrategy {
  generateContent(input: RetrospectInput): string
}
