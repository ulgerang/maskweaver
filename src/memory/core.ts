/**
 * Memory Core - Simple utilities for text processing
 * 
 * Clear is better than clever.
 */

import { join } from "path";

// ============================================================================
// Configuration
// ============================================================================

export const CONFIG = {
  chunking: {
    maxTokens: 400,
    overlapTokens: 80,
    charsPerToken: 4,
  },
  paths: {
    memoryDir: ".opencode/memory",
    dataDir: ".opencode-data",
    dbFile: "memory.sqlite",
  },
  search: {
    defaultMaxResults: 6,
    defaultMinScore: 0.35,
  },
} as const;

// ============================================================================
// Types
// ============================================================================

export type SourceType = 'daily' | 'memory' | 'masks' | 'retrospect' | 'user' | 'code';
export type MemoryType = 'daily' | 'memory' | 'masks' | 'retrospect' | 'user';

export interface Chunk {
  id?: number;
  path: string;
  startLine: number;
  endLine: number;
  text: string;
  hash: string;
  source: SourceType;
  createdAt?: string;
}

export interface SearchResult {
  chunk: Chunk;
  score: number;
  matchType: 'vector' | 'text' | 'hybrid';
}

// ============================================================================
// Text Processing
// ============================================================================

/**
 * Hash text using djb2 algorithm.
 * Simple, fast, good enough for our use case.
 */
export function hashText(text: string): string {
  let hash = 5381;
  for (let i = 0; i < text.length; i++) {
    hash = ((hash << 5) + hash) + text.charCodeAt(i);
    hash = hash & hash; // Convert to 32bit integer
  }
  return Math.abs(hash).toString(16);
}

/**
 * Estimate token count.
 * Rough approximation: 4 chars ≈ 1 token
 */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / CONFIG.chunking.charsPerToken);
}

/**
 * Determine source type from file path.
 */
export function determineSource(filePath: string): SourceType {
  const lower = filePath.toLowerCase().replace(/\\/g, '/');
  
  if (lower.includes('/daily/') || (lower.endsWith('.md') && /\d{4}-\d{2}-\d{2}/.test(lower))) {
    return 'daily';
  }
  if (lower.includes('masks') || lower.endsWith('masks.md')) {
    return 'masks';
  }
  if (lower.includes('retrospect') || lower.endsWith('retrospect.md')) {
    return 'retrospect';
  }
  if (lower.includes('user') || lower.endsWith('user.md')) {
    return 'user';
  }
  if (lower.includes('memory') || lower.endsWith('memory.md')) {
    return 'memory';
  }
  
  return 'code';
}

// ============================================================================
// Similarity
// ============================================================================

// Deduplicated warning: only log dimension mismatch once per session
let _dimensionMismatchWarned = false;

/**
 * Calculate cosine similarity between two vectors.
 * Single pass for efficiency.
 * 
 * Returns 0 on dimension mismatch instead of throwing,
 * to prevent a single bad embedding from crashing the entire search.
 */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length === 0 || b.length === 0) return 0;
  
  if (a.length !== b.length) {
    if (!_dimensionMismatchWarned) {
      console.warn(
        `[Memory] Vector dimension mismatch: ${a.length} vs ${b.length}. ` +
        `This usually means the embedding provider changed (e.g., fallback to text-only). ` +
        `Mismatched vectors will be scored as 0. This warning is logged once per session.`
      );
      _dimensionMismatchWarned = true;
    }
    return 0;
  }
  
  let dotProduct = 0;
  let magnitudeA = 0;
  let magnitudeB = 0;
  
  for (let i = 0; i < a.length; i++) {
    const valA = a[i];
    const valB = b[i];
    dotProduct += valA * valB;
    magnitudeA += valA * valA;
    magnitudeB += valB * valB;
  }
  
  const magnitude = Math.sqrt(magnitudeA) * Math.sqrt(magnitudeB);
  return magnitude === 0 ? 0 : dotProduct / magnitude;
}

/**
 * Float32 version - more memory efficient.
 * 
 * Returns 0 on dimension mismatch instead of throwing,
 * to prevent a single bad embedding from crashing the entire search.
 */
export function cosineSimilarityFloat32(a: Float32Array, b: Float32Array): number {
  if (a.length === 0 || b.length === 0) return 0;
  
  if (a.length !== b.length) {
    if (!_dimensionMismatchWarned) {
      console.warn(
        `[Memory] Vector dimension mismatch: ${a.length} vs ${b.length}. ` +
        `This usually means the embedding provider changed (e.g., fallback to text-only). ` +
        `Mismatched vectors will be scored as 0. This warning is logged once per session.`
      );
      _dimensionMismatchWarned = true;
    }
    return 0;
  }
  
  let dotProduct = 0;
  let magnitudeA = 0;
  let magnitudeB = 0;
  
  for (let i = 0; i < a.length; i++) {
    const valA = a[i];
    const valB = b[i];
    dotProduct += valA * valB;
    magnitudeA += valA * valA;
    magnitudeB += valB * valB;
  }
  
  const magnitude = Math.sqrt(magnitudeA) * Math.sqrt(magnitudeB);
  return magnitude === 0 ? 0 : dotProduct / magnitude;
}

// ============================================================================
// Embedding Conversion
// ============================================================================

export function toFloat32Array(embedding: number[]): Float32Array {
  return new Float32Array(embedding);
}

export function embeddingToBlob(embedding: number[]): Buffer {
  const float32 = new Float32Array(embedding);
  return Buffer.from(float32.buffer);
}

export function blobToEmbedding(blob: Buffer): Float32Array {
  return new Float32Array(blob.buffer, blob.byteOffset, blob.byteLength / 4);
}

export function blobToNumberArray(blob: Buffer): number[] {
  const float32 = new Float32Array(blob.buffer, blob.byteOffset, blob.byteLength / 4);
  return Array.from(float32);
}

// ============================================================================
// Date Utilities
// ============================================================================

export function getTodayFileName(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  
  return `${year}-${month}-${day}.md`;
}

export function dateToFileName(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  
  return `${year}-${month}-${day}.md`;
}

// ============================================================================
// Path Utilities
// ============================================================================

export function getMemoryPath(
  type: MemoryType,
  basePath: string = process.cwd()
): string {
  const memoryDir = join(basePath, CONFIG.paths.memoryDir);
  
  switch (type) {
    case 'daily':
      return join(memoryDir, 'daily');
    case 'memory':
      return join(memoryDir, 'MEMORY.md');
    case 'masks':
      return join(memoryDir, 'MASKS.md');
    case 'retrospect':
      return join(memoryDir, 'RETROSPECT.md');
    case 'user':
      return join(memoryDir, 'USER.md');
    default:
      throw new Error(`Unknown memory type: ${type}`);
  }
}

export function getDbPath(basePath: string = process.cwd()): string {
  return join(basePath, CONFIG.paths.dataDir, CONFIG.paths.dbFile);
}

export function getDataDir(basePath: string = process.cwd()): string {
  return join(basePath, CONFIG.paths.dataDir);
}

// ============================================================================
// Utilities
// ============================================================================

export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export function getConfig(): typeof CONFIG {
  return CONFIG;
}
