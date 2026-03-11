/**
 * Common types used across Maskweaver packages
 */

/**
 * Result type for operations that can fail gracefully
 */
export type Result<T> = 
  | { success: true; data: T }
  | { success: false; error: string };

/**
 * Health check result for system components
 */
export interface HealthCheckResult {
  ok: boolean;
  reason?: string;
  hint?: string;
}

/**
 * Log levels for the system
 */
export type LogLevel = "error" | "warn" | "info" | "debug";

/**
 * Feature status
 */
export interface FeatureStatus {
  enabled: boolean;
  healthy?: boolean;
  lastCheck?: Date;
}
