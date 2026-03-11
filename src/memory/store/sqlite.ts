/**
 * SQLite Storage - Persistent chunk and embedding storage
 * 
 * Uses better-sqlite3 for Node.js compatibility.
 * WAL mode for concurrent access.
 * 
 * NOTE: better-sqlite3 is an optional dependency.
 * This module uses dynamic import to avoid errors when not installed.
 */

import { existsSync, mkdirSync } from 'fs';
import { dirname } from 'path';
import {
  type Chunk,
  type SearchResult,
  cosineSimilarityFloat32,
  embeddingToBlob,
  blobToEmbedding,
  toFloat32Array,
} from '../core.js';

// Dynamic import for better-sqlite3 or bun:sqlite
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let DatabaseConstructor: any = null;
let isBun = false;
let sqliteUnavailable = false;
let sqliteUnavailableReason = '';

// Check if running in Bun at module level
// @ts-ignore
const IS_BUN = typeof Bun !== 'undefined';

/**
 * Check if SQLite is available without throwing.
 * Returns true if SQLite can be loaded, false otherwise.
 */
export function isSqliteAvailable(): boolean {
  return !sqliteUnavailable;
}

/**
 * Get the reason SQLite is unavailable.
 */
export function getSqliteUnavailableReason(): string {
  return sqliteUnavailableReason;
}

async function loadDatabase(): Promise<any> {
  if (DatabaseConstructor) return DatabaseConstructor;

  // If we already know SQLite is unavailable, return null immediately
  if (sqliteUnavailable) return null;

  // In Bun environment, use bun:sqlite exclusively
  if (IS_BUN) {
    try {
      // @ts-ignore
      const { Database } = await import('bun:sqlite');
      DatabaseConstructor = Database;
      isBun = true;
      return DatabaseConstructor;
    } catch (error) {
      sqliteUnavailable = true;
      sqliteUnavailableReason = 'bun:sqlite not available in this Bun version';
      console.warn('[Memory DB] bun:sqlite not available, memory features disabled');
      return null;
    }
  }

  // In Node.js environment, use better-sqlite3
  // Use Function constructor to avoid Bun's static analysis of import()
  try {
    const dynamicImport = new Function('specifier', 'return import(specifier)');
    const module = await dynamicImport('better-sqlite3');
    DatabaseConstructor = module.default;
    isBun = false;
    return DatabaseConstructor;
  } catch (error) {
    sqliteUnavailable = true;
    sqliteUnavailableReason = 'better-sqlite3 not installed. Run: npm install better-sqlite3';
    console.warn(
      '[Memory DB] SQLite driver not available. Memory features (semantic search, indexing) disabled.\n' +
      '  To enable: npm install better-sqlite3\n' +
      '  Basic Maskweaver features (masks, verify) will still work.'
    );
    return null;
  }
}


// ============================================================================
// Types
// ============================================================================

export interface SearchOptions {
  limit?: number;
  minScore?: number;
  vectorWeight?: number;
  textWeight?: number;
  sourceFilter?: Chunk['source'][];
}

interface ChunkRow {
  id: number;
  path: string;
  start_line: number;
  end_line: number;
  text: string;
  hash: string;
  source: string;
  created_at: string;
}

interface EmbeddingRow {
  chunk_id: number;
  embedding: Buffer;
}

interface FtsRow {
  rowid: number;
  text: string;
  rank: number;
}

// ============================================================================
// Database Class
// ============================================================================

export class MemoryDatabase {
  private db: any; // Database.Database type
  private statements: Map<string, any> = new Map();
  private ftsAvailable: boolean = false;

  private constructor(db: any) {
    this.db = db;
  }

  /**
   * Create a new MemoryDatabase instance.
   * Uses async factory pattern because better-sqlite3 is dynamically imported.
   * Returns null if SQLite is not available (graceful degradation).
   */
  static async create(dbPath: string): Promise<MemoryDatabase | null> {
    const DatabaseClass = await loadDatabase();

    // SQLite not available - graceful degradation
    if (!DatabaseClass) {
      return null;
    }

    // Ensure directory exists
    const dir = dirname(dbPath);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }

    // Open database
    const db = new DatabaseClass(dbPath);

    // Enable WAL mode for concurrency
    if (isBun) {
      db.exec('PRAGMA journal_mode = WAL');
      db.exec('PRAGMA synchronous = NORMAL');
    } else {
      db.pragma('journal_mode = WAL');
      db.pragma('synchronous = NORMAL');
      db.pragma('cache_size = -64000'); // 64MB
      db.pragma('temp_store = MEMORY');
    }


    const instance = new MemoryDatabase(db);

    // Initialize schema
    instance.initSchema();

    // Prepare statements
    instance.prepareStatements();

    return instance;
  }

  /**
   * Initialize database schema.
   */
  private initSchema(): void {
    this.db.exec(`
      -- Chunks table
      CREATE TABLE IF NOT EXISTS chunks (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        path TEXT NOT NULL,
        start_line INTEGER NOT NULL,
        end_line INTEGER NOT NULL,
        text TEXT NOT NULL,
        hash TEXT NOT NULL,
        source TEXT NOT NULL,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(path, start_line, end_line)
      );

      -- Embeddings table
      CREATE TABLE IF NOT EXISTS embeddings (
        chunk_id INTEGER PRIMARY KEY,
        embedding BLOB NOT NULL,
        FOREIGN KEY (chunk_id) REFERENCES chunks(id) ON DELETE CASCADE
      );

      -- Mask usage table
      CREATE TABLE IF NOT EXISTS mask_usage (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        mask_name TEXT NOT NULL,
        task_description TEXT,
        effectiveness_score INTEGER,
        used_at TEXT DEFAULT CURRENT_TIMESTAMP
      );

      -- Indexes
      CREATE INDEX IF NOT EXISTS idx_chunks_path ON chunks(path);
      CREATE INDEX IF NOT EXISTS idx_chunks_source ON chunks(source);
      CREATE INDEX IF NOT EXISTS idx_chunks_hash ON chunks(hash);
      CREATE INDEX IF NOT EXISTS idx_mask_usage_name ON mask_usage(mask_name);
    `);

    // FTS5 virtual table
    this.ftsAvailable = false;
    try {
      this.db.exec(`
        CREATE VIRTUAL TABLE IF NOT EXISTS chunks_fts USING fts5(
          text,
          content='chunks',
          content_rowid='id',
          tokenize='unicode61'
        );
      `);
      this.ftsAvailable = true;
    } catch (error) {
      // FTS5 not supported by this SQLite build
      console.warn('[Memory DB] FTS5 not available. Text search will be disabled:', error);
    }

    // FTS triggers — only if FTS table was created successfully
    if (this.ftsAvailable) {
      try {
        this.db.exec(`
          -- INSERT trigger
          CREATE TRIGGER IF NOT EXISTS chunks_ai AFTER INSERT ON chunks BEGIN
            INSERT INTO chunks_fts(rowid, text) VALUES (new.id, new.text);
          END;

          -- DELETE trigger
          CREATE TRIGGER IF NOT EXISTS chunks_ad AFTER DELETE ON chunks BEGIN
            INSERT INTO chunks_fts(chunks_fts, rowid, text) VALUES('delete', old.id, old.text);
          END;

          -- UPDATE trigger
          CREATE TRIGGER IF NOT EXISTS chunks_au AFTER UPDATE ON chunks BEGIN
            INSERT INTO chunks_fts(chunks_fts, rowid, text) VALUES('delete', old.id, old.text);
            INSERT INTO chunks_fts(rowid, text) VALUES (new.id, new.text);
          END;
        `);
      } catch (error) {
        console.warn('[Memory DB] FTS triggers setup failed:', error);
        this.ftsAvailable = false;
      }
    }
  }

  /**
   * Prepare SQL statements for reuse.
   */
  private prepareStatements(): void {
    this.statements.set('upsertChunk', this.db.prepare(`
      INSERT INTO chunks (path, start_line, end_line, text, hash, source)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(path, start_line, end_line) DO UPDATE SET
        text = excluded.text,
        hash = excluded.hash,
        source = excluded.source,
        created_at = CURRENT_TIMESTAMP
      RETURNING id
    `));

    this.statements.set('upsertEmbedding', this.db.prepare(`
      INSERT INTO embeddings (chunk_id, embedding)
      VALUES (?, ?)
      ON CONFLICT(chunk_id) DO UPDATE SET
        embedding = excluded.embedding
    `));

    this.statements.set('getChunkById', this.db.prepare(`
      SELECT * FROM chunks WHERE id = ?
    `));

    this.statements.set('deleteChunksByPath', this.db.prepare(`
      DELETE FROM chunks WHERE path = ?
    `));

    this.statements.set('checkChunkByHash', this.db.prepare(`
      SELECT id FROM chunks WHERE path = ? AND hash = ?
    `));

    this.statements.set('getAllEmbeddings', this.db.prepare(`
      SELECT c.*, e.embedding
      FROM chunks c
      JOIN embeddings e ON c.id = e.chunk_id
    `));

    // FTS statement — only prepare if FTS table exists
    if (this.ftsAvailable) {
      this.statements.set('searchFts', this.db.prepare(`
        SELECT rowid, text, rank
        FROM chunks_fts
        WHERE chunks_fts MATCH ?
        ORDER BY rank
        LIMIT ?
      `));
    }

    this.statements.set('getChunksByPath', this.db.prepare(`
      SELECT * FROM chunks WHERE path = ?
    `));

    this.statements.set('insertMaskUsage', this.db.prepare(`
      INSERT INTO mask_usage (mask_name, task_description, effectiveness_score)
      VALUES (?, ?, ?)
    `));

    this.statements.set('getMaskStats', this.db.prepare(`
      SELECT 
        mask_name,
        COUNT(*) as usage_count,
        AVG(effectiveness_score) as avg_effectiveness,
        MAX(used_at) as last_used
      FROM mask_usage
      GROUP BY mask_name
      ORDER BY usage_count DESC
    `));
  }

  // ==========================================================================
  // CRUD Operations
  // ==========================================================================

  /**
   * Insert or update chunk.
   * 
   * If embedding is empty (e.g., text-only mode), the chunk is stored
   * but the embedding row is skipped. This allows text search to work
   * while vector search gracefully returns no results for these chunks.
   */
  upsertChunk(chunk: Chunk, embedding: number[]): number {
    const stmt = this.statements.get('upsertChunk')!;
    const result = stmt.get(
      chunk.path,
      chunk.startLine,
      chunk.endLine,
      chunk.text,
      chunk.hash,
      chunk.source
    ) as { id: number } | undefined;

    if (!result?.id) {
      throw new Error('[Memory DB] Failed to upsert chunk');
    }

    // Only save embedding if it has actual content
    if (embedding && embedding.length > 0) {
      const embStmt = this.statements.get('upsertEmbedding')!;
      const embeddingBlob = embeddingToBlob(embedding);
      embStmt.run(result.id, embeddingBlob);
    }

    return result.id;
  }

  /**
   * Bulk insert chunks in transaction.
   */
  upsertChunks(chunks: Array<{ chunk: Chunk; embedding: number[] }>): number[] {
    const ids: number[] = [];

    const transaction = this.db.transaction(() => {
      for (const { chunk, embedding } of chunks) {
        const id = this.upsertChunk(chunk, embedding);
        ids.push(id);
      }
    });

    transaction();
    return ids;
  }

  /**
   * Delete chunks by path.
   */
  deleteChunksByPath(path: string): number {
    const stmt = this.statements.get('deleteChunksByPath')!;
    const result = stmt.run(path);
    return result.changes;
  }

  /**
   * Check if chunk changed.
   */
  isChunkChanged(path: string, hash: string): boolean {
    const stmt = this.statements.get('checkChunkByHash')!;
    const result = stmt.get(path, hash);
    return result === undefined;
  }

  /**
   * Get chunks by path.
   */
  getChunksByPath(path: string): Chunk[] {
    const stmt = this.statements.get('getChunksByPath')!;
    const rows = stmt.all(path) as ChunkRow[];

    return rows.map(row => ({
      id: row.id,
      path: row.path,
      startLine: row.start_line,
      endLine: row.end_line,
      text: row.text,
      hash: row.hash,
      source: row.source as Chunk['source'],
      createdAt: row.created_at,
    }));
  }

  // ==========================================================================
  // Search Operations
  // ==========================================================================

  /**
   * Vector similarity search.
   * 
   * Returns empty results if queryEmbedding is empty (e.g., text-only mode).
   * Skips stored embeddings with dimension mismatches instead of crashing.
   */
  searchByVector(
    queryEmbedding: number[],
    limit: number = 6,
    sourceFilter?: Chunk['source'][]
  ): SearchResult[] {
    // Empty embedding = text-only mode. Skip vector search entirely.
    if (!queryEmbedding || queryEmbedding.length === 0) {
      return [];
    }

    const queryVec = toFloat32Array(queryEmbedding);

    // Get all embeddings
    const stmt = this.statements.get('getAllEmbeddings')!;
    let rows = stmt.all() as Array<ChunkRow & { embedding: Buffer }>;

    // Filter by source if specified
    if (sourceFilter && sourceFilter.length > 0) {
      rows = rows.filter(row => sourceFilter.includes(row.source as Chunk['source']));
    }

    // Calculate similarities and sort
    // cosineSimilarityFloat32 returns 0 on dimension mismatch (no throw)
    const scored: SearchResult[] = [];
    for (const row of rows) {
      const embeddingVec = blobToEmbedding(row.embedding);
      
      // Skip rows with empty or invalid embeddings
      if (embeddingVec.length === 0) {
        continue;
      }

      const score = cosineSimilarityFloat32(queryVec, embeddingVec);

      scored.push({
        chunk: {
          id: row.id,
          path: row.path,
          startLine: row.start_line,
          endLine: row.end_line,
          text: row.text,
          hash: row.hash,
          source: row.source as Chunk['source'],
          createdAt: row.created_at,
        },
        score,
        matchType: 'vector' as const,
      });
    }

    return scored
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
  }

  /**
   * Full-text search using FTS5.
   * Returns empty results if FTS is not available.
   */
  searchByText(query: string, limit: number = 6): SearchResult[] {
    if (!this.ftsAvailable) {
      return [];
    }

    const normalizedQuery = this.normalizeFtsQuery(query);
    if (!normalizedQuery) return [];

    try {
      const stmt = this.statements.get('searchFts');
      if (!stmt) return [];
      
      const ftsResults = stmt.all(normalizedQuery, limit) as FtsRow[];

      const chunkStmt = this.statements.get('getChunkById')!;

      const results: SearchResult[] = [];
      for (const fts of ftsResults) {
        const chunk = chunkStmt.get(fts.rowid) as ChunkRow | undefined;
        if (!chunk) continue;

        // Normalize BM25 score to 0-1 range
        const normalizedScore = Math.min(1, Math.max(0, -fts.rank / 10));

        results.push({
          chunk: {
            id: chunk.id,
            path: chunk.path,
            startLine: chunk.start_line,
            endLine: chunk.end_line,
            text: chunk.text,
            hash: chunk.hash,
            source: chunk.source as Chunk['source'],
            createdAt: chunk.created_at,
          },
          score: normalizedScore,
          matchType: 'text' as const,
        });
      }
      return results;
    } catch (error) {
      console.warn('[Memory DB] FTS search error:', error);
      return [];
    }
  }

  /**
   * Normalize FTS query.
   */
  private normalizeFtsQuery(query: string): string {
    const tokens = query
      .replace(/[^\w\s가-힣]/g, ' ')
      .split(/\s+/)
      .filter(t => t.length > 0);

    if (tokens.length === 0) return '';

    return tokens.map(t => `${t}*`).join(' OR ');
  }

  // ==========================================================================
  // Mask Usage
  // ==========================================================================

  recordMaskUsage(
    maskName: string,
    taskDescription?: string,
    effectivenessScore?: number
  ): void {
    const stmt = this.statements.get('insertMaskUsage')!;
    stmt.run(maskName, taskDescription ?? null, effectivenessScore ?? null);
  }

  getMaskStats(): Array<{
    mask_name: string;
    usage_count: number;
    avg_effectiveness: number | null;
    last_used: string;
  }> {
    const stmt = this.statements.get('getMaskStats')!;
    return stmt.all() as Array<{
      mask_name: string;
      usage_count: number;
      avg_effectiveness: number | null;
      last_used: string;
    }>;
  }

  // ==========================================================================
  // Utilities
  // ==========================================================================

  getStats(): {
    chunkCount: number;
    embeddingCount: number;
    maskUsageCount: number;
    dbSize: number;
  } {
    const chunkCount = (this.db.prepare('SELECT COUNT(*) as count FROM chunks').get() as { count: number }).count;
    const embeddingCount = (this.db.prepare('SELECT COUNT(*) as count FROM embeddings').get() as { count: number }).count;
    const maskUsageCount = (this.db.prepare('SELECT COUNT(*) as count FROM mask_usage').get() as { count: number }).count;

    let pageCount = 0;
    let pageSize = 0;

    if (isBun) {
      pageCount = (this.db.prepare('PRAGMA page_count').get() as any)['page_count'];
      pageSize = (this.db.prepare('PRAGMA page_size').get() as any)['page_size'];
    } else {
      pageCount = (this.db.pragma('page_count', { simple: true }) as number);
      pageSize = (this.db.pragma('page_size', { simple: true }) as number);
    }

    const dbSize = pageCount * pageSize;

    return { chunkCount, embeddingCount, maskUsageCount, dbSize };
  }


  rebuildFtsIndex(): void {
    if (!this.ftsAvailable) {
      console.warn('[Memory DB] FTS not available, cannot rebuild index.');
      return;
    }
    this.db.exec("INSERT INTO chunks_fts(chunks_fts) VALUES('rebuild')");
  }

  optimize(): void {
    this.db.pragma('optimize');
    this.db.exec('VACUUM');
  }

  close(): void {
    this.statements.clear();
    this.db.close();
  }
}

// ============================================================================
// Singleton Instance
// ============================================================================

let defaultInstance: MemoryDatabase | null = null;

/**
 * Initialize the database.
 * Returns null if SQLite is not available (graceful degradation).
 */
export async function initDatabase(dbPath: string): Promise<MemoryDatabase | null> {
  if (defaultInstance) {
    defaultInstance.close();
  }
  defaultInstance = await MemoryDatabase.create(dbPath);
  return defaultInstance;
}

/**
 * Get the database instance.
 * Returns null if SQLite is not available or not initialized.
 * Use this for optional memory features.
 */
export function getDatabase(): MemoryDatabase | null {
  if (!defaultInstance && !isSqliteAvailable()) {
    // SQLite not available - return null instead of throwing
    return null;
  }
  return defaultInstance;
}

/**
 * Try to get the database instance, returning null if not initialized.
 * Use this when database access is optional (e.g., in intake stage).
 */
export function tryGetDatabase(): MemoryDatabase | null {
  return defaultInstance;
}

// ============================================================================
// Convenience Functions
// These throw errors if SQLite is not available. Use getDatabase() directly
// for optional access with null checks.
// ============================================================================

export function upsertChunk(chunk: Chunk, embedding: number[]): number {
  const db = getDatabase();
  if (!db) throw new Error('[Memory DB] SQLite not available');
  return db.upsertChunk(chunk, embedding);
}

export function searchByVector(embedding: number[], limit?: number): SearchResult[] {
  const db = getDatabase();
  if (!db) return [];  // Graceful degradation - return empty results
  return db.searchByVector(embedding, limit);
}

export function searchByText(query: string, limit?: number): SearchResult[] {
  const db = getDatabase();
  if (!db) return [];  // Graceful degradation - return empty results
  return db.searchByText(query, limit);
}

export function deleteChunksByPath(path: string): number {
  const db = getDatabase();
  if (!db) return 0;
  return db.deleteChunksByPath(path);
}

export function getChunksByPath(path: string): Chunk[] {
  const db = getDatabase();
  if (!db) return [];
  return db.getChunksByPath(path);
}

