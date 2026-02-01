/**
 * Memory Indexer Tool - Index memory files for semantic search
 */

import { z } from "zod";
import { indexFile, reindexFile, indexAllMemoryFiles } from "../../memory/index.js";
import { createProvider, selectBestProvider } from "../../memory/index.js";
import type { ProviderConfig } from "../../memory/index.js";
import type { ToolFactory, ToolContext } from "../types.js";
import { getMemoryProviderConfig } from "../../shared/config.js";

/**
 * Get embedding provider based on configuration
 */
async function getConfiguredProvider(worktree: string) {
  // Try to load config from maskweaver.config.json
  const memoryConfig = getMemoryProviderConfig(worktree);
  
  if (memoryConfig && memoryConfig.provider) {
    const providerConfig: ProviderConfig = {
      type: memoryConfig.provider,
      model: memoryConfig.model,
      dimensions: memoryConfig.dimensions,
      baseUrl: memoryConfig.baseUrl || "http://localhost:11434",
    };
    
    try {
      const provider = createProvider(providerConfig);
      const health = await provider.healthCheck();
      
      if (health.ok) {
        return provider;
      }
      
      console.warn(`Configured provider ${memoryConfig.provider} failed: ${health.reason}`);
    } catch (error) {
      console.warn(`Failed to create provider: ${error}`);
    }
  }
  
  // Fallback
  const fallbackConfigs: ProviderConfig[] = [
    { type: "ollama", model: "bge-m3", dimensions: 1024 },
    { type: "ollama", model: "nomic-embed-text", dimensions: 768 },
    { type: "text-only" },
  ];
  
  return selectBestProvider(fallbackConfigs);
}

export function createMemoryIndexerTool(): ToolFactory {
  return {
    description: `Index memory files for semantic search. Chunks markdown files and stores embeddings.

Actions:
- index: Index a single file (only re-embeds changed chunks)
- reindex: Force reindex a file (deletes and re-embeds all chunks)
- index-all: Index all memory files (MEMORY.md, MASKS.md, RETROSPECT.md, USER.md)`,
    args: z.object({
      action: z.enum(["index", "reindex", "index-all"]),
      path: z.string(),
    }),
    async execute(args: { action: "index" | "reindex" | "index-all"; path: string }, context: ToolContext) {
      try {
        const basePath = context.worktree;

        // Create embedding provider from config
        const provider = await getConfiguredProvider(basePath);

        const getEmbedding = async (text: string): Promise<number[]> => {
          const embeddings = await provider.embed([text]);
          return embeddings[0];
        };

        // Execute action
        switch (args.action) {
          case "index":
            await indexFile(args.path, getEmbedding, basePath);
            return JSON.stringify(
              {
                success: true,
                action: "index",
                path: args.path,
                message: "파일 인덱싱 완료",
              },
              null,
              2
            );

          case "reindex":
            await reindexFile(args.path, getEmbedding, basePath);
            return JSON.stringify(
              {
                success: true,
                action: "reindex",
                path: args.path,
                message: "파일 재인덱싱 완료",
              },
              null,
              2
            );

          case "index-all":
            await indexAllMemoryFiles(args.path, getEmbedding, basePath);
            return JSON.stringify(
              {
                success: true,
                action: "index-all",
                path: args.path,
                message: "모든 메모리 파일 인덱싱 완료",
              },
              null,
              2
            );

          default:
            return JSON.stringify(
              {
                success: false,
                message: `알 수 없는 액션: ${args.action}`,
              },
              null,
              2
            );
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        return JSON.stringify(
          {
            success: false,
            message: `인덱싱 실패: ${errorMessage}`,
          },
          null,
          2
        );
      }
    },
  };
}
