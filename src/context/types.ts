/**
 * Context Type Definitions
 * 
 * 피처 기반 컨텍스트 관리 시스템의 타입 정의
 * 
 * 설계 원칙:
 * - 명확한 이름으로 의도 표현 (Intention-Revealing Names)
 * - 타입 안전성 (Type Safety)
 * - 불변성 강조 (Immutability)
 * 
 * @author Kent Beck's Dummy Human
 */

// ============================================================================
// Feature Context
// ============================================================================

/**
 * 피처 컨텍스트
 * 
 * 하나의 작업 단위를 나타냅니다. 로그인 기능 구현, 버그 수정 등
 * 각 피처는 관련 파일들과 현재 진행 상태를 추적합니다.
 */
export interface FeatureContext {
  /** 고유 식별자 (UUID) */
  id: string
  /** 피처 이름 (예: "login-oauth") */
  name: string
  /** 한 줄 목표 설명 */
  goal: string
  /** 현재 상태 */
  status: 'active' | 'paused' | 'completed'
  /** 관련 파일 목록 */
  files: string[]
  /** 마지막 작업 상태 스냅샷 */
  lastContext: string
  /** 막힌 부분 (선택) */
  blockers?: string
  /** 생성 시각 (ISO 8601) */
  createdAt: string
  /** 마지막 수정 시각 (ISO 8601) */
  updatedAt: string
}

// ============================================================================
// Project Context
// ============================================================================

/**
 * 프로젝트 컨텍스트
 * 
 * 프로젝트 전체에 대한 메타 정보를 관리합니다.
 */
export interface ProjectContext {
  /** 프로젝트 이름 */
  name: string
  /** 기술 스택 */
  techStack?: string[]
  /** 코딩 컨벤션 */
  conventions?: string
  /** 현재 활성 피처 ID */
  activeFeatureId?: string
}

// ============================================================================
// Update Types
// ============================================================================

/**
 * 피처 업데이트 입력
 * 
 * Partial을 사용하되 id와 createdAt은 변경 불가
 */
export type FeatureUpdate = Partial<Omit<FeatureContext, 'id' | 'createdAt'>>

// ============================================================================
// Result Type
// ============================================================================

/**
 * 작업 결과 타입
 * 
 * 모든 작업은 성공/실패를 명시적으로 반환
 * 
 * "Make the return value obvious" - Kent Beck
 */
export interface Result<T> {
  success: boolean
  data?: T
  error?: string
}
