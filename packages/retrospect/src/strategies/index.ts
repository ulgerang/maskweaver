/**
 * Retrospect Strategies
 * 
 * 전략 선택 및 export
 * 
 * "Polymorphism beats switch statements" - Kent Beck
 */

import type { RetrospectDepth } from '../types.js'
import type { RetrospectStrategy } from './base.js'
import { QuickRetrospectStrategy } from './quick.js'
import { StandardRetrospectStrategy } from './standard.js'
import { DeepRetrospectStrategy } from './deep.js'

/**
 * 깊이에 따른 전략 선택
 * 
 * "Choose the right tool for the job" - Kent Beck
 */
export function selectStrategy(depth: RetrospectDepth): RetrospectStrategy {
  const strategies: Record<RetrospectDepth, RetrospectStrategy> = {
    quick: new QuickRetrospectStrategy(),
    standard: new StandardRetrospectStrategy(),
    deep: new DeepRetrospectStrategy()
  }
  
  return strategies[depth]
}

// Export strategies
export { RetrospectStrategy } from './base.js'
export { QuickRetrospectStrategy } from './quick.js'
export { StandardRetrospectStrategy } from './standard.js'
export { DeepRetrospectStrategy } from './deep.js'
