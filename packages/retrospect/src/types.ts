/**
 * Retrospect Type Definitions
 * 
 * 회고 시스템의 타입 정의
 * 
 * "Make the types express intent" - Kent Beck
 */

// ============================================================================
// Trigger Types
// ============================================================================

export type RetrospectTrigger = 'manual' | 'session_end' | 'periodic'

export type RetrospectDepth = 'quick' | 'standard' | 'deep'

// ============================================================================
// Mask Usage
// ============================================================================

export interface MaskUsageRecord {
  name: string
  task: string
  effectiveness: number
}

// ============================================================================
// Input & Output
// ============================================================================

export interface RetrospectInput {
  trigger: RetrospectTrigger
  summary: string
  masksUsed?: MaskUsageRecord[]
  wellDone?: string[]
  improvements?: string[]
  lessons?: string[]
  depth?: RetrospectDepth
}

export interface RetrospectResult {
  success: boolean
  retrospectPath: string
  summary: {
    tasksCompleted: number
    masksUsed: number
    averageEffectiveness: number
  }
  message?: string
}
