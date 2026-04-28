/**
 * Plugin Types
 * 
 * Shared types for Maskweaver plugin tools
 * 
 * Based on @opencode-ai/plugin tool definitions.
 */

import type { z } from 'zod';

/**
 * Minimal context required by Maskweaver tool factories.
 * SDK provides richer context, but factories only need worktree.
 */
export interface ToolContext {
  worktree: string;
}

/**
 * Tool factory interface for creating OpenCode tools
 */
export interface ToolFactory {
  /** Tool description shown to LLM */
  description: string;
  /** Zod schema for argument validation */
  args: z.ZodType<any>;
  /** Execute function that returns string result */
  execute: (args: any, context: ToolContext) => Promise<string>;
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
