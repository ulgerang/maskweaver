/**
 * Retrospect Tool - Session retrospective
 */

import { z } from "zod";
import { performRetrospect } from "../../retrospect/index.js";
import type { ToolFactory, ToolContext } from "../types.js";

export function createRetrospectTool(): ToolFactory {
  return {
    description: `회고를 수행합니다.
- daily: 오늘의 작업 기록 (자동으로 오늘 날짜 파일에 추가)
- memory: 장기 기억 (MEMORY.md에 추가)  
- user: 유저 정보 (USER.md 업데이트)`,
    args: z.object({
      trigger: z.enum(["manual", "session_end", "periodic"]),
      summary: z.string(),
      masksUsed: z
        .array(
          z.object({
            name: z.string(),
            task: z.string(),
            effectiveness: z.number().min(0).max(100),
          })
        )
        .optional(),
      wellDone: z.array(z.string()).optional(),
      improvements: z.array(z.string()).optional(),
      lessons: z.array(z.string()).optional(),
      depth: z.enum(["quick", "standard", "deep"]).optional(),
    }),
    async execute(args: {
      trigger: "manual" | "session_end" | "periodic";
      summary: string;
      masksUsed?: Array<{
        name: string;
        task: string;
        effectiveness: number;
      }>;
      wellDone?: string[];
      improvements?: string[];
      lessons?: string[];
      depth?: "quick" | "standard" | "deep";
    }, context: ToolContext) {
      try {
        const worktree = context.worktree;
        const result = performRetrospect(worktree, {
          ...args,
          depth: args.depth ?? "standard",
        });
        return JSON.stringify(result, null, 2);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        return JSON.stringify(
          {
            success: false,
            message: `회고 실패: ${errorMessage}`,
          },
          null,
          2
        );
      }
    },
  };
}
