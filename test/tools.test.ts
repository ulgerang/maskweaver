/**
 * Maskweaver Plugin Tools Tests
 * 
 * Testing tools with a focus on:
 * 1. Schema validation (arguments)
 * 2. Response format (JSON structure)
 * 3. Error handling (graceful failures)
 * 4. Edge cases (missing data, invalid inputs)
 * 
 * "Make it work, make it right, make it fast" - Kent Beck
 * 
 * @author Kent Beck's Dummy Human
 */

import { test, expect, describe, beforeEach, afterEach } from "vitest";
import { mkdirSync, rmSync, writeFileSync, existsSync } from "fs";
import { join } from "path";
import { createMemorySearchTool } from "../src/plugin/tools/memorySearch.js";
import { createMemoryGetTool } from "../src/plugin/tools/memoryGet.js";
import { createMemoryIndexerTool } from "../src/plugin/tools/memoryIndexer.js";
import { createContextTool } from "../src/plugin/tools/context.js";
import { createRetrospectTool } from "../src/plugin/tools/retrospect.js";
import { createMaskSaveTool } from "../src/plugin/tools/maskSave.js";
import type { ToolContext } from "../src/plugin/types.js";

// ============================================================================
// Test Setup & Helpers
// ============================================================================

/**
 * Create a temporary test directory
 */
function createTempDir(): string {
  const tempDir = join(process.cwd(), "test-temp", `test-${Date.now()}`);
  mkdirSync(tempDir, { recursive: true });
  return tempDir;
}

/**
 * Clean up temporary directory
 */
function cleanupTempDir(dir: string): void {
  if (existsSync(dir)) {
    rmSync(dir, { recursive: true, force: true });
  }
}

/**
 * Parse JSON response from tool
 */
function parseResponse(jsonString: string): any {
  return JSON.parse(jsonString);
}

/**
 * Create test context with worktree
 */
function createTestContext(worktree: string): ToolContext {
  return { worktree };
}

// ============================================================================
// Memory Search Tool Tests
// ============================================================================

describe("Memory Search Tool", () => {
  test("should create tool with description and schema", () => {
    const tool = createMemorySearchTool();
    
    expect(tool).toBeDefined();
    expect(tool.description).toBeDefined();
    expect(tool.description).toContain("Search memories");
    expect(tool.args).toBeDefined();
    expect(tool.execute).toBeDefined();
  });

  test("should validate query argument is required", async () => {
    const tool = createMemorySearchTool();
    
    // Test schema validation by passing invalid args
    const result = tool.args.safeParse({});
    expect(result.success).toBe(false);
  });

  test("should validate optional arguments", () => {
    const tool = createMemorySearchTool();
    
    // Valid with all optional params
    const validFull = tool.args.safeParse({
      query: "test query",
      maxResults: 10,
      minScore: 0.5,
      sources: ["memory", "daily"],
    });
    expect(validFull.success).toBe(true);
    
    // Valid with only required params
    const validMinimal = tool.args.safeParse({
      query: "test query",
    });
    expect(validMinimal.success).toBe(true);
  });

  test("should validate source type enum", () => {
    const tool = createMemorySearchTool();
    
    // Valid sources
    const valid = tool.args.safeParse({
      query: "test",
      sources: ["memory", "masks", "retrospect", "daily", "user"],
    });
    expect(valid.success).toBe(true);
    
    // Invalid source
    const invalid = tool.args.safeParse({
      query: "test",
      sources: ["invalid-source"],
    });
    expect(invalid.success).toBe(false);
  });
});

// ============================================================================
// Memory Get Tool Tests
// ============================================================================

describe("Memory Get Tool", () => {
  let tempDir: string;
  let testFile: string;
  
  beforeEach(() => {
    tempDir = createTempDir();
    testFile = join(tempDir, "test.md");
    writeFileSync(testFile, "Line 1\nLine 2\nLine 3\nLine 4\nLine 5\n");
  });
  
  afterEach(() => {
    cleanupTempDir(tempDir);
  });

  test("should create tool with description and schema", () => {
    const tool = createMemoryGetTool();
    
    expect(tool).toBeDefined();
    expect(tool.description).toBeDefined();
    expect(tool.description).toContain("Read memory");
    expect(tool.args).toBeDefined();
    expect(tool.execute).toBeDefined();
  });

  test("should require path argument", () => {
    const tool = createMemoryGetTool();
    
    const invalid = tool.args.safeParse({});
    expect(invalid.success).toBe(false);
    
    const valid = tool.args.safeParse({
      path: "/some/path.md",
    });
    expect(valid.success).toBe(true);
  });

  test("should read entire file when no range specified", async () => {
    const tool = createMemoryGetTool();
    const context = createTestContext(tempDir);
    
    const response = await tool.execute(
      { path: testFile },
      context
    );
    
    const parsed = parseResponse(response);
    expect(parsed.success).toBe(true);
    expect(parsed.totalLines).toBe(6); // 5 lines + empty line at end
    expect(parsed.content).toContain("Line 1");
    expect(parsed.content).toContain("Line 5");
  });

  test("should handle non-existent file", async () => {
    const tool = createMemoryGetTool();
    const context = createTestContext(tempDir);
    
    const response = await tool.execute(
      { path: join(tempDir, "nonexistent.md") },
      context
    );
    
    const parsed = parseResponse(response);
    expect(parsed.success).toBe(false);
    expect(parsed.error).toContain("not found");
  });
});

// ============================================================================
// Memory Indexer Tool Tests
// ============================================================================

describe("Memory Indexer Tool", () => {
  test("should create tool with description and schema", () => {
    const tool = createMemoryIndexerTool();
    
    expect(tool).toBeDefined();
    expect(tool.description).toBeDefined();
    expect(tool.description).toContain("Index memory files");
    expect(tool.args).toBeDefined();
    expect(tool.execute).toBeDefined();
  });

  test("should require action and path arguments", () => {
    const tool = createMemoryIndexerTool();
    
    const invalid = tool.args.safeParse({});
    expect(invalid.success).toBe(false);
    
    const valid = tool.args.safeParse({
      action: "index",
      path: "/path/to/file.md",
    });
    expect(valid.success).toBe(true);
  });

  test("should validate action enum values", () => {
    const tool = createMemoryIndexerTool();
    
    // Valid actions
    const actions = ["index", "reindex", "index-all"];
    actions.forEach((action) => {
      const result = tool.args.safeParse({
        action,
        path: "/path",
      });
      expect(result.success).toBe(true);
    });
    
    // Invalid action
    const invalid = tool.args.safeParse({
      action: "invalid-action",
      path: "/path",
    });
    expect(invalid.success).toBe(false);
  });
});

// ============================================================================
// Context Tool Tests
// ============================================================================

describe("Context Tool", () => {
  let tempDir: string;
  
  beforeEach(() => {
    tempDir = createTempDir();
  });
  
  afterEach(() => {
    cleanupTempDir(tempDir);
  });

  test("should create tool with description and schema", () => {
    const tool = createContextTool();
    
    expect(tool).toBeDefined();
    expect(tool.description).toBeDefined();
    expect(tool.description).toContain("컨텍스트를 관리");
    expect(tool.args).toBeDefined();
    expect(tool.execute).toBeDefined();
  });

  test("should require action argument", () => {
    const tool = createContextTool();
    
    const invalid = tool.args.safeParse({});
    expect(invalid.success).toBe(false);
    
    const valid = tool.args.safeParse({
      action: "status",
    });
    expect(valid.success).toBe(true);
  });

  test("should validate all action enum values", () => {
    const tool = createContextTool();
    
    const actions = [
      "start", "switch", "status", "done",
      "add", "drop", "goal", "list"
    ];
    
    actions.forEach((action) => {
      const result = tool.args.safeParse({ action });
      expect(result.success).toBe(true);
    });
  });

  test("should return status when no active feature", async () => {
    const tool = createContextTool();
    const context = createTestContext(tempDir);
    
    const response = await tool.execute(
      { action: "status" },
      context
    );
    
    const parsed = parseResponse(response);
    expect(parsed.success).toBe(true);
    expect(parsed.action).toBe("status");
    expect(parsed.message).toBeDefined();
  });

  test("should handle list action", async () => {
    const tool = createContextTool();
    const context = createTestContext(tempDir);
    
    const response = await tool.execute(
      { action: "list" },
      context
    );
    
    const parsed = parseResponse(response);
    expect(parsed.success).toBe(true);
    expect(parsed.action).toBe("list");
    expect(parsed.data).toBeDefined();
  });

  test("should create and activate feature with start action", async () => {
    const tool = createContextTool();
    const context = createTestContext(tempDir);
    
    const response = await tool.execute(
      {
        action: "start",
        name: "test-feature",
        goal: "Test feature creation",
      },
      context
    );
    
    const parsed = parseResponse(response);
    expect(parsed.success).toBe(true);
    expect(parsed.action).toBe("start");
    expect(parsed.data).toBeDefined();
    expect(parsed.data.name).toBe("test-feature");
    expect(parsed.data.status).toBe("active");
  });
});

// ============================================================================
// Retrospect Tool Tests
// ============================================================================

describe("Retrospect Tool", () => {
  test("should create tool with description and schema", () => {
    const tool = createRetrospectTool();
    
    expect(tool).toBeDefined();
    expect(tool.description).toBeDefined();
    expect(tool.description).toContain("회고");
    expect(tool.args).toBeDefined();
    expect(tool.execute).toBeDefined();
  });

  test("should require trigger and summary arguments", () => {
    const tool = createRetrospectTool();
    
    const invalid = tool.args.safeParse({});
    expect(invalid.success).toBe(false);
    
    const valid = tool.args.safeParse({
      trigger: "manual",
      summary: "Today's work summary",
    });
    expect(valid.success).toBe(true);
  });

  test("should validate trigger enum values", () => {
    const tool = createRetrospectTool();
    
    const triggers = ["manual", "session_end", "periodic"];
    triggers.forEach((trigger) => {
      const result = tool.args.safeParse({
        trigger,
        summary: "Test",
      });
      expect(result.success).toBe(true);
    });
    
    const invalid = tool.args.safeParse({
      trigger: "invalid",
      summary: "Test",
    });
    expect(invalid.success).toBe(false);
  });

  test("should validate depth enum values", () => {
    const tool = createRetrospectTool();
    
    const depths = ["quick", "standard", "deep"];
    depths.forEach((depth) => {
      const result = tool.args.safeParse({
        trigger: "manual",
        summary: "Test",
        depth,
      });
      expect(result.success).toBe(true);
    });
  });
});

// ============================================================================
// Mask Save Tool Tests
// ============================================================================

describe("Mask Save Tool", () => {
  test("should create tool with description and schema", () => {
    const tool = createMaskSaveTool();
    
    expect(tool).toBeDefined();
    expect(tool.description).toBeDefined();
    expect(tool.description).toContain("가면을 라이브러리에 저장");
    expect(tool.args).toBeDefined();
    expect(tool.execute).toBeDefined();
  });

  test("should require all mandatory arguments", () => {
    const tool = createMaskSaveTool();
    
    const invalid = tool.args.safeParse({});
    expect(invalid.success).toBe(false);
    
    const valid = tool.args.safeParse({
      name: "test-expert",
      expertise: "Testing",
      thinkingStyle: "Analytical",
      strengths: "Detail-oriented",
      suitableFor: "Test writing",
      effectivenessScore: 80,
    });
    expect(valid.success).toBe(true);
  });

  test("should validate effectivenessScore range", () => {
    const tool = createMaskSaveTool();
    
    // Valid scores
    const valid0 = tool.args.safeParse({
      name: "test",
      expertise: "Test",
      thinkingStyle: "Test",
      strengths: "Test",
      suitableFor: "Test",
      effectivenessScore: 0,
    });
    expect(valid0.success).toBe(true);
    
    const valid100 = tool.args.safeParse({
      name: "test",
      expertise: "Test",
      thinkingStyle: "Test",
      strengths: "Test",
      suitableFor: "Test",
      effectivenessScore: 100,
    });
    expect(valid100.success).toBe(true);
    
    // Invalid scores
    const invalidNegative = tool.args.safeParse({
      name: "test",
      expertise: "Test",
      thinkingStyle: "Test",
      strengths: "Test",
      suitableFor: "Test",
      effectivenessScore: -1,
    });
    expect(invalidNegative.success).toBe(false);
    
    const invalidHigh = tool.args.safeParse({
      name: "test",
      expertise: "Test",
      thinkingStyle: "Test",
      strengths: "Test",
      suitableFor: "Test",
      effectivenessScore: 101,
    });
    expect(invalidHigh.success).toBe(false);
  });
});
