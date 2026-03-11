/**
 * Plugin Types
 * 
 * Shared types for Maskweaver plugin tools
 */

import type { z } from 'zod';

/**
 * Tool factory interface for creating OpenCode tools
 */
export interface ToolFactory {
  /** Tool description shown to LLM */
  description: string;
  /** Zod schema for argument validation */
  args: z.ZodType<any>;
  /** Execute function that returns JSON string result */
  execute: (args: any, context: ToolContext) => Promise<string>;
}

/**
 * Context passed to tool execute functions
 */
export interface ToolContext {
  /** Working directory (project root) */
  worktree: string;
}

/**
 * Standard tool response format
 */
export interface ToolResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}
