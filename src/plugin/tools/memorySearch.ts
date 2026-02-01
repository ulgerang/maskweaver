/**
 * Memory Search Tool
 * 
 * Hybrid search: Vector similarity + Text matching
 * 
 * "Clear is better than clever." - Rob Pike
 * 
 * Architecture:
 * - Lazy provider initialization (only on first call)
 * - Graceful degradation (auto-fallback to working providers)
 * - Result caching at provider level
 * - JSON response format for consistent parsing
 */

import { z } from "zod";
import type { IEmbeddingProvider, SearchResult, SourceType } from "../../memory/index.js";
import {
  hybridSearch,
  initDatabase,
  getDbPath,
  selectBestProvider,
  getDefaultConfigs,
  CONFIG,
} from "../../memory/index.js";
import path from "node:path";

// ============================================================================
// Schema Definition
// ============================================================================

/**
 * Memory search arguments schema
 * 
 * Sources:
 * - memory: Long-term knowledge (MEMORY.md)
 * - masks: Mask usage history and effectiveness
 * - retrospect: Daily retrospectives and lessons
 * - daily: Today's work log
 * - user: User preferences and information (USER.md)
 */
const memorySearchArgsSchema = z.object({
  query: z.string().describe("Natural language search query"),
  maxResults: z.number().optional().describe("Maximum results to return (default: 6)"),
  minScore: z.number().optional().describe("Minimum similarity score 0-1 (default: 0.35)"),
  sources: z
    .array(z.enum(["memory", "masks", "retrospect", "daily", "user"]))
    .optional()
    .describe("Filter by source types (default: all)"),
});

type MemorySearchArgs = z.infer<typeof memorySearchArgsSchema>;

// ============================================================================
// Provider State (Singleton Pattern)
// ============================================================================

/**
 * Lazy-initialized embedding provider
 * 
 * Benefits:
 * - No initialization cost if tool is never used
 * - Automatic provider selection on first use
 * - Shared across all search calls
 */
let providerInstance: IEmbeddingProvider | null = null;

/**
 * Get or initialize the embedding provider
 * 
 * @returns Initialized provider (may be text-only fallback)
 */
async function getProvider(): Promise<IEmbeddingProvider> {
  if (!providerInstance) {
    const configs = getDefaultConfigs();
    providerInstance = await selectBestProvider(configs);
  }
  return providerInstance;
}

// ============================================================================
// Tool Factory
// ============================================================================

export interface MemorySearchToolContext {
  worktree: string;
}

/**
 * Create memory search tool
 * 
 * Factory pattern allows:
 * - Dependency injection (context)
 * - Testing with mock providers
 * - Configuration per instance
 */
export function createMemorySearchTool() {
  return {
    description: `Search memories using semantic similarity and keyword matching.

Use this to:
- Recall previous conversations or decisions
- Find mask usage history and effectiveness
- Retrieve user preferences
- Check past retrospectives and lessons

Keywords: "remember", "before", "last time", "previous"`,

    args: memorySearchArgsSchema,

    async execute(args: MemorySearchArgs, context: MemorySearchToolContext) {
      try {
        // Configuration with defaults
        const maxResults = args.maxResults ?? CONFIG.search.defaultMaxResults;
        const minScore = args.minScore ?? CONFIG.search.defaultMinScore;

        // ====================================================================
        // 1. Initialize Database
        // ====================================================================
        const dbPath = getDbPath(context.worktree);
        await initDatabase(dbPath);

        // ====================================================================
        // 2. Get Embedding Provider (lazy initialization)
        // ====================================================================
        const provider = await getProvider();

        // Generate query embedding (embed takes array, returns array)
        const embeddingResults = await provider.embed([args.query]);
        const embedding = embeddingResults[0];

        // ====================================================================
        // 3. Hybrid Search
        // ====================================================================
        const results = hybridSearch(args.query, embedding, {
          limit: maxResults,
          minScore: minScore,
          sourceFilter: args.sources as SourceType[] | undefined,
        });

        // ====================================================================
        // 4. Format Results
        // ====================================================================
        if (results.length === 0) {
          return JSON.stringify(
            {
              results: [],
              totalFound: 0,
              query: args.query,
              message: "No relevant memories found.",
            },
            null,
            2
          );
        }

        // Convert to relative paths and truncate snippets
        const formattedResults = results.map((r: SearchResult) => {
          const relativePath = path.relative(context.worktree, r.chunk.path);
          const snippet =
            r.chunk.text.length > 200
              ? r.chunk.text.slice(0, 200) + "..."
              : r.chunk.text;

          return {
            path: relativePath,
            startLine: r.chunk.startLine,
            endLine: r.chunk.endLine,
            score: Math.round(r.score * 100) / 100,
            snippet: snippet.trim(),
            source: r.chunk.source,
          };
        });

        return JSON.stringify(
          {
            results: formattedResults,
            totalFound: formattedResults.length,
            query: args.query,
            provider: provider.name,
          },
          null,
          2
        );
      } catch (error) {
        // ====================================================================
        // 5. Error Handling
        // ====================================================================
        const message = error instanceof Error ? error.message : String(error);

        // Embedding service connection failure
        if (message.includes("fetch") || message.includes("ECONNREFUSED")) {
          return JSON.stringify(
            {
              error: true,
              message:
                "Cannot connect to embedding service. Check if Ollama is running ('ollama serve').",
              query: args.query,
            },
            null,
            2
          );
        }

        // Database initialization failure
        if (message.includes("Database") || message.includes("SQLite")) {
          return JSON.stringify(
            {
              error: true,
              message: `Memory database initialization failed: ${message}`,
              query: args.query,
            },
            null,
            2
          );
        }

        // Generic error
        return JSON.stringify(
          {
            error: true,
            message: message,
            query: args.query,
          },
          null,
          2
        );
      }
    },
  };
}
