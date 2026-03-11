/**
 * Memory Get Tool - Read memory file contents
 */
import { z } from "zod";
import { existsSync, readFileSync } from 'fs';
import type { ToolFactory, ToolContext } from '../types.js';

export const memoryGetSchema = z.object({
  path: z.string().describe('Path to memory file'),
  from: z.number().optional().describe('Start line (0-based)'),
  lines: z.number().optional().describe('Number of lines to read'),
});

export type MemoryGetArgs = z.infer<typeof memoryGetSchema>;

export function createMemoryGetTool(): ToolFactory {
  return {
    description: `Read memory file contents. Use memory_search to find files first.`,
    args: memoryGetSchema,
    async execute(args: MemoryGetArgs, context: ToolContext) {
      try {
        if (!existsSync(args.path)) {
          return JSON.stringify({ success: false, error: `File not found: ${args.path}` }, null, 2);
        }
        const content = readFileSync(args.path, 'utf-8');
        const allLines = content.split('\n');
        const from = args.from ?? 0;
        const lineCount = args.lines ?? allLines.length;
        const selectedLines = allLines.slice(from, from + lineCount);
        return JSON.stringify({
          success: true,
          path: args.path,
          totalLines: allLines.length,
          from,
          to: Math.min(from + lineCount, allLines.length),
          content: selectedLines.join('\n'),
        }, null, 2);
      } catch (error) {
        return JSON.stringify({ success: false, error: String(error) }, null, 2);
      }
    },
  };
}
