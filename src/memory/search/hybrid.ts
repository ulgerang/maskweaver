/**
 * Hybrid Search - Combine vector and text search
 * 
 * Simple weighted combination of vector similarity and FTS scores.
 */

import type { Chunk, SearchResult } from '../core.js';
import type { SearchOptions } from '../store/sqlite.js';
import { getDatabase } from '../store/sqlite.js';

const DEFAULT_VECTOR_WEIGHT = 0.7;
const DEFAULT_TEXT_WEIGHT = 0.3;
const DEFAULT_MIN_SCORE = 0.35;
const DEFAULT_MAX_RESULTS = 6;

/**
 * Hybrid search combining vector and text search.
 */
export function hybridSearch(
  query: string,
  queryEmbedding: number[],
  options: SearchOptions = {}
): SearchResult[] {
  const {
    limit = DEFAULT_MAX_RESULTS,
    minScore = DEFAULT_MIN_SCORE,
    vectorWeight = DEFAULT_VECTOR_WEIGHT,
    textWeight = DEFAULT_TEXT_WEIGHT,
    sourceFilter,
  } = options;

  const db = getDatabase();

  // SQLite not available - return empty results (graceful degradation)
  if (!db) {
    return [];
  }

  // Get more candidates for reranking
  const candidateLimit = limit * 3;

  // Run both searches
  const vectorResults = db.searchByVector(queryEmbedding, candidateLimit, sourceFilter);
  const textResults = db.searchByText(query, candidateLimit);

  // Merge results
  const scoreMap = new Map<number, { chunk: Chunk; vectorScore: number; textScore: number }>();

  for (const result of vectorResults) {
    scoreMap.set(result.chunk.id!, {
      chunk: result.chunk,
      vectorScore: result.score,
      textScore: 0,
    });
  }

  for (const result of textResults) {
    const existing = scoreMap.get(result.chunk.id!);
    if (existing) {
      existing.textScore = result.score;
    } else {
      scoreMap.set(result.chunk.id!, {
        chunk: result.chunk,
        vectorScore: 0,
        textScore: result.score,
      });
    }
  }

  // Calculate combined scores and sort
  const results: SearchResult[] = Array.from(scoreMap.values())
    .map(({ chunk, vectorScore, textScore }) => {
      const combinedScore = vectorScore * vectorWeight + textScore * textWeight;
      return {
        chunk,
        score: combinedScore,
        matchType: 'hybrid' as const,
      };
    })
    .filter(r => r.score >= minScore)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);

  return results;
}
