/**
 * Mask Save Tool - Save effective masks to library
 */

import { z } from "zod";
import { saveMask } from "../../retrospect/index.js";
import type { ToolFactory, ToolContext } from "../types.js";

export function createMaskSaveTool(): ToolFactory {
  return {
    description: `효과적인 가면을 라이브러리에 저장합니다.
새로운 가면을 추가하거나, 기존 가면의 효과성 점수와 사용 기록을 업데이트합니다.

사용 시점:
- 가면 사용 후 효과적이었을 때
- 새로운 전문가 가면을 발견했을 때
- 기존 가면의 효과성을 기록할 때

효과성 점수는 이동 평균으로 계산됩니다 (새 점수 가중치: 0.3)`,
    args: z.object({
      name: z.string(),
      expertise: z.string(),
      thinkingStyle: z.string(),
      strengths: z.string(),
      suitableFor: z.string(),
      effectivenessScore: z.number().min(0).max(100),
      usageNote: z.string().optional(),
    }),
    async execute(args: {
      name: string;
      expertise: string;
      thinkingStyle: string;
      strengths: string;
      suitableFor: string;
      effectivenessScore: number;
      usageNote?: string;
    }, context: ToolContext) {
      try {
        const worktree = context.worktree;
        const result = saveMask(worktree, args);
        return JSON.stringify(result, null, 2);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        return JSON.stringify(
          {
            success: false,
            message: `가면 저장 실패: ${errorMessage}`,
          },
          null,
          2
        );
      }
    },
  };
}
