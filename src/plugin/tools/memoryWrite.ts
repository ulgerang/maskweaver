/**
 * Memory Write Tool
 * 
 * Saves content to memory files with automatic indexing.
 * Each function does one thing well.
 * 
 * @author Kent Beck's Dummy Human
 */

import { z } from "zod";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { dirname, join, relative } from "path";
import {
  getMemoryPath,
  getTodayFileName,
} from "../../memory/index.js";
import type { ToolFactory, ToolContext } from "../types.js";

// ============================================================================
// Schema Definition
// ============================================================================

const memoryWriteArgsSchema = z.object({
  content: z.string().describe("Content to save (markdown format)"),
  target: z.enum(["daily", "memory", "user"]).describe("Target location"),
  section: z.string().optional().describe("Section title (e.g., 'User Preferences')"),
});

type MemoryWriteArgs = z.infer<typeof memoryWriteArgsSchema>;
type MemoryTarget = MemoryWriteArgs["target"];

// ============================================================================
// Tool Factory
// ============================================================================

export function createMemoryWriteTool(): ToolFactory {
  return {
    description: `Saves content to memory files.
- daily: Today's work log (appends to today's date file)
- memory: Long-term memory (adds to MEMORY.md)
- user: User information (updates USER.md)`,

    args: memoryWriteArgsSchema,

    async execute(args: MemoryWriteArgs, context: ToolContext) {
      try {
        const filePath = determineFilePath(args.target, context.worktree);
        ensureDirectoryExists(filePath);
        
        const existingContent = readExistingContent(filePath);
        const newContent = buildNewContent(existingContent, args.content, args.section);
        
        saveContent(filePath, newContent);
        await tryReindexing(filePath);
        
        return formatSuccessResponse(filePath, args.target, context.worktree);
      } catch (error) {
        return formatErrorResponse(error, args.target);
      }
    },
  };
}

// ============================================================================
// Path Resolution
// ============================================================================

function determineFilePath(target: MemoryTarget, worktree: string): string {
  if (target === "daily") {
    const dailyDir = getMemoryPath("daily", worktree);
    return join(dailyDir, getTodayFileName());
  }
  
  return getMemoryPath(target, worktree);
}

// ============================================================================
// File System Operations
// ============================================================================

function ensureDirectoryExists(filePath: string): void {
  const dir = dirname(filePath);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
}

function readExistingContent(filePath: string): string {
  if (!existsSync(filePath)) {
    return "";
  }
  return readFileSync(filePath, "utf-8");
}

function saveContent(filePath: string, content: string): void {
  const normalized = content.trim() + "\n";
  writeFileSync(filePath, normalized, "utf-8");
}

// ============================================================================
// Content Building
// ============================================================================

function buildNewContent(
  existing: string,
  newText: string,
  section?: string
): string {
  if (section) {
    return updateSection(existing, section, newText);
  }
  return appendEntry(existing, newText);
}

function updateSection(content: string, section: string, newText: string): string {
  const sectionHeader = `## ${section}`;
  const headerIndex = content.indexOf(sectionHeader);
  
  if (headerIndex === -1) {
    return appendNewSection(content, sectionHeader, newText);
  }
  
  return insertIntoExistingSection(content, headerIndex, sectionHeader, newText);
}

function appendNewSection(content: string, header: string, text: string): string {
  return content.trimEnd() + "\n\n" + header + "\n\n" + text;
}

function insertIntoExistingSection(
  content: string,
  headerIndex: number,
  header: string,
  text: string
): string {
  const afterHeader = content.slice(headerIndex + header.length);
  const nextSectionMatch = afterHeader.match(/\n## /);
  
  if (nextSectionMatch && nextSectionMatch.index !== undefined) {
    return insertBeforeNextSection(content, headerIndex, header, nextSectionMatch.index, text);
  }
  
  return appendToLastSection(content, text);
}

function insertBeforeNextSection(
  content: string,
  headerIndex: number,
  header: string,
  nextSectionOffset: number,
  text: string
): string {
  const insertPoint = headerIndex + header.length + nextSectionOffset;
  const before = content.slice(0, insertPoint);
  const after = content.slice(insertPoint);
  return before.trimEnd() + "\n\n" + text + "\n" + after;
}

function appendToLastSection(content: string, text: string): string {
  return content.trimEnd() + "\n\n" + text;
}

function appendEntry(content: string, newText: string): string {
  const timestamp = formatTimestamp(new Date());
  const entry = buildEntry(timestamp, newText);
  
  if (isEmpty(content)) {
    return entry;
  }
  
  return content.trimEnd() + "\n\n" + entry;
}

function formatTimestamp(date: Date): string {
  return date.toISOString().slice(0, 19).replace("T", " ");
}

function buildEntry(timestamp: string, text: string): string {
  return `---\n\n**${timestamp}**\n\n${text}`;
}

function isEmpty(content: string): boolean {
  return content.trim().length === 0;
}

// ============================================================================
// Indexing
// ============================================================================

async function tryReindexing(_filePath: string): Promise<void> {
  // NOTE: Reindexing requires embedding provider setup
  // For now, skip auto-reindex on write. Use memory_indexer tool instead.
  // To enable: instantiate provider and call reindexFile(filePath, getEmbedding)
}

function logIndexingWarning(error: unknown): void {
  const message = error instanceof Error ? error.message : String(error);
  console.warn("[memoryWrite] Indexing skipped:", message);
}

// ============================================================================
// Response Formatting
// ============================================================================

function formatSuccessResponse(
  filePath: string,
  target: MemoryTarget,
  worktree: string
): string {
  const relativePath = relative(worktree, filePath);
  
  return JSON.stringify(
    {
      success: true,
      path: relativePath,
      message: `Saved to ${target}`,
    },
    null,
    2
  );
}

function formatErrorResponse(error: unknown, target: MemoryTarget): string {
  const message = error instanceof Error ? error.message : String(error);
  
  return JSON.stringify(
    {
      success: false,
      message: `Save failed: ${message}`,
      target,
    },
    null,
    2
  );
}
