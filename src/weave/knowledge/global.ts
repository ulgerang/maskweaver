/**
 * Global Knowledge Base
 * 
 * Cross-project RAG system for sharing troubleshooting knowledge.
 * This is the KEY differentiator - lessons learned in one project
 * benefit all future projects.
 * 
 * Storage: ~/.maskweaver/knowledge.sqlite (global, not per-project)
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import type { TroubleshootingEntry, KnowledgeSearchResult } from '../types.js';

// ============================================================================
// Configuration
// ============================================================================

const GLOBAL_DIR = path.join(os.homedir(), '.maskweaver');
const GLOBAL_DB_FILE = 'knowledge.sqlite';

export function getGlobalDbPath(): string {
    return path.join(GLOBAL_DIR, GLOBAL_DB_FILE);
}

function ensureGlobalDir(): void {
    if (!fs.existsSync(GLOBAL_DIR)) {
        fs.mkdirSync(GLOBAL_DIR, { recursive: true });
    }
}

// ============================================================================
// Error Signature Normalization
// ============================================================================

/**
 * Normalize error messages to create searchable signatures.
 * Strips out project-specific paths, line numbers, etc.
 */
export function normalizeErrorSignature(error: string): string {
    return error
        // Remove file paths
        .replace(/[A-Za-z]:\\[^\s:]+/g, '<PATH>')
        .replace(/\/[^\s:]+/g, '<PATH>')
        // Remove line/column numbers
        .replace(/:\d+:\d+/g, '')
        .replace(/line \d+/gi, 'line <N>')
        .replace(/column \d+/gi, 'column <N>')
        // Remove specific variable/function names that look generated
        .replace(/_[a-f0-9]{8,}/g, '_<HASH>')
        // Normalize whitespace
        .replace(/\s+/g, ' ')
        .trim()
        .toLowerCase();
}

// ============================================================================
// Global Knowledge Class
// ============================================================================

export class GlobalKnowledge {
    private db: any = null;
    private initialized = false;
    private usingSqlJs = false;
    private sqlJsDb: any = null;

    async init(): Promise<void> {
        if (this.initialized) return;

        ensureGlobalDir();

        // Try better-sqlite3 first (fastest, native)
        try {
            const Database = await import('better-sqlite3').then(m => m.default);
            this.db = new Database(getGlobalDbPath());
            this.createTables();
            this.initialized = true;
            return;
        } catch {
            // better-sqlite3 not available, try sql.js
        }

        // Fallback to sql.js (works everywhere, WASM-based)
        try {
            // @ts-ignore - sql.js doesn't have TypeScript types
            const initSqlJs = await import('sql.js').then(m => m.default);
            const SQL = await initSqlJs();

            // Try to load existing database file
            const dbPath = getGlobalDbPath();
            let data: Uint8Array | undefined;
            try {
                const fs = await import('fs');
                if (fs.existsSync(dbPath)) {
                    data = fs.readFileSync(dbPath);
                }
            } catch {
                // File doesn't exist or can't be read
            }

            this.sqlJsDb = data ? new SQL.Database(data) : new SQL.Database();
            this.db = this.createSqlJsWrapper(this.sqlJsDb, dbPath);
            this.usingSqlJs = true;
            this.createTables();
            this.initialized = true;
            return;
        } catch {
            // sql.js also not available
        }

        // Final fallback: in-memory only (no persistence)
        console.warn('[GlobalKnowledge] No SQLite driver available. Knowledge will not persist between sessions.');
        this.db = null;
        this.initialized = true;
    }

    /**
     * Create a wrapper that mimics better-sqlite3 API using sql.js
     */
    private createSqlJsWrapper(sqlJsDb: any, dbPath: string) {
        const saveToFile = () => {
            try {
                const data = sqlJsDb.export();
                const fs = require('fs');
                fs.writeFileSync(dbPath, Buffer.from(data));
            } catch {
                // Ignore save errors
            }
        };

        return {
            exec: (sql: string) => {
                try {
                    sqlJsDb.run(sql);
                    saveToFile();
                } catch (e) {
                    console.warn('[sql.js] exec error:', e);
                }
            },
            prepare: (sql: string) => {
                return {
                    run: (...params: any[]) => {
                        try {
                            // Flatten params if first element is array
                            const flatParams = params.length === 1 && Array.isArray(params[0])
                                ? params[0]
                                : params;
                            sqlJsDb.run(sql, flatParams.length > 0 ? flatParams : undefined);
                            saveToFile();
                            return { changes: sqlJsDb.getRowsModified() };
                        } catch (e) {
                            console.warn('[sql.js] run error:', e);
                            return { changes: 0 };
                        }
                    },
                    get: (...params: any[]) => {
                        try {
                            const stmt = sqlJsDb.prepare(sql);
                            // Flatten params if first element is array
                            const flatParams = params.length === 1 && Array.isArray(params[0])
                                ? params[0]
                                : params;
                            if (flatParams.length > 0) {
                                stmt.bind(flatParams);
                            }
                            if (stmt.step()) {
                                const row = stmt.getAsObject();
                                stmt.free();
                                return row;
                            }
                            stmt.free();
                            return undefined;
                        } catch (e) {
                            console.warn('[sql.js] get error:', e);
                            return undefined;
                        }
                    },
                    all: (...params: any[]) => {
                        try {
                            const results: any[] = [];
                            const stmt = sqlJsDb.prepare(sql);
                            // Flatten params if first element is array
                            const flatParams = params.length === 1 && Array.isArray(params[0])
                                ? params[0]
                                : params;
                            if (flatParams.length > 0) {
                                stmt.bind(flatParams);
                            }
                            while (stmt.step()) {
                                results.push(stmt.getAsObject());
                            }
                            stmt.free();
                            return results;
                        } catch (e) {
                            console.warn('[sql.js] all error:', e);
                            return [];
                        }
                    },
                };
            },
            close: () => {
                saveToFile();
                sqlJsDb.close();
            },
        };
    }

    private createTables(): void {
        if (!this.db) return;

        this.db.exec(`
      CREATE TABLE IF NOT EXISTS troubleshooting (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        error_signature TEXT NOT NULL,
        error_message TEXT NOT NULL,
        context TEXT NOT NULL,
        solution TEXT NOT NULL,
        project_type TEXT,
        tech_stack TEXT,
        tags TEXT,
        effectiveness INTEGER DEFAULT 5,
        created_at TEXT NOT NULL,
        used_count INTEGER DEFAULT 0,
        last_used_at TEXT
      );

      CREATE INDEX IF NOT EXISTS idx_error_signature 
        ON troubleshooting(error_signature);
      
      CREATE INDEX IF NOT EXISTS idx_project_type 
        ON troubleshooting(project_type);

      CREATE VIRTUAL TABLE IF NOT EXISTS troubleshooting_fts USING fts5(
        error_message,
        context,
        solution,
        tags,
        content='troubleshooting',
        content_rowid='id'
      );

      -- Triggers to keep FTS in sync
      CREATE TRIGGER IF NOT EXISTS troubleshooting_ai AFTER INSERT ON troubleshooting BEGIN
        INSERT INTO troubleshooting_fts(rowid, error_message, context, solution, tags)
        VALUES (new.id, new.error_message, new.context, new.solution, new.tags);
      END;

      CREATE TRIGGER IF NOT EXISTS troubleshooting_ad AFTER DELETE ON troubleshooting BEGIN
        INSERT INTO troubleshooting_fts(troubleshooting_fts, rowid, error_message, context, solution, tags)
        VALUES ('delete', old.id, old.error_message, old.context, old.solution, old.tags);
      END;

      CREATE TRIGGER IF NOT EXISTS troubleshooting_au AFTER UPDATE ON troubleshooting BEGIN
        INSERT INTO troubleshooting_fts(troubleshooting_fts, rowid, error_message, context, solution, tags)
        VALUES ('delete', old.id, old.error_message, old.context, old.solution, old.tags);
        INSERT INTO troubleshooting_fts(rowid, error_message, context, solution, tags)
        VALUES (new.id, new.error_message, new.context, new.solution, new.tags);
      END;
    `);
    }

    /**
     * Record a troubleshooting experience for future reference.
     */
    async record(entry: Omit<TroubleshootingEntry, 'id' | 'errorSignature' | 'createdAt' | 'usedCount'>): Promise<number> {
        await this.init();

        if (!this.db) {
            console.warn('[GlobalKnowledge] No database available');
            return -1;
        }

        const signature = normalizeErrorSignature(entry.errorMessage);
        const now = new Date().toISOString();

        const stmt = this.db.prepare(`
      INSERT INTO troubleshooting (
        error_signature, error_message, context, solution,
        project_type, tech_stack, tags, effectiveness,
        created_at, used_count
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0)
    `);

        const result = stmt.run(
            signature,
            entry.errorMessage,
            entry.context,
            entry.solution,
            entry.projectType || null,
            entry.techStack ? JSON.stringify(entry.techStack) : null,
            entry.tags ? JSON.stringify(entry.tags) : null,
            entry.effectiveness || 5,
            now
        );

        return result.lastInsertRowid as number;
    }

    /**
     * Search for solutions to a similar error.
     */
    async search(
        errorMessage: string,
        options: {
            projectType?: string;
            limit?: number;
            minEffectiveness?: number;
        } = {}
    ): Promise<KnowledgeSearchResult[]> {
        await this.init();

        if (!this.db) return [];

        const { projectType, limit = 5, minEffectiveness = 3 } = options;
        const signature = normalizeErrorSignature(errorMessage);
        const results: KnowledgeSearchResult[] = [];

        // 1. Exact signature match (highest priority)
        const exactStmt = this.db.prepare(`
      SELECT * FROM troubleshooting 
      WHERE error_signature = ? 
        AND effectiveness >= ?
      ORDER BY effectiveness DESC, used_count DESC
      LIMIT ?
    `);
        const exactMatches = exactStmt.all(signature, minEffectiveness, limit);

        for (const row of exactMatches) {
            results.push({
                entry: this.rowToEntry(row),
                score: 1.0,
                matchType: 'exact',
            });
        }

        // 2. FTS search for similar errors (if not enough exact matches)
        if (results.length < limit) {
            const remaining = limit - results.length;
            const existingIds = results.map(r => r.entry.id);

            // Extract key terms from error
            const searchTerms = errorMessage
                .replace(/[^\w\s]/g, ' ')
                .split(/\s+/)
                .filter(t => t.length > 3)
                .slice(0, 10)
                .join(' OR ');

            if (searchTerms) {
                try {
                    const ftsStmt = this.db.prepare(`
            SELECT t.*, bm25(troubleshooting_fts) as rank
            FROM troubleshooting_fts f
            JOIN troubleshooting t ON f.rowid = t.id
            WHERE troubleshooting_fts MATCH ?
              AND t.effectiveness >= ?
              ${existingIds.length > 0 ? `AND t.id NOT IN (${existingIds.join(',')})` : ''}
              ${projectType ? 'AND t.project_type = ?' : ''}
            ORDER BY rank
            LIMIT ?
          `);

                    const params = projectType
                        ? [searchTerms, minEffectiveness, projectType, remaining]
                        : [searchTerms, minEffectiveness, remaining];

                    const ftsMatches = ftsStmt.all(...params);

                    for (const row of ftsMatches) {
                        results.push({
                            entry: this.rowToEntry(row),
                            score: Math.min(0.9, 1 / (1 - row.rank)), // BM25 score normalization
                            matchType: 'similar',
                        });
                    }
                } catch (e) {
                    // FTS query might fail with special characters
                }
            }
        }

        return results;
    }

    /**
     * Mark a solution as used (increases its ranking).
     */
    async markUsed(id: number): Promise<void> {
        await this.init();

        if (!this.db) return;

        const stmt = this.db.prepare(`
      UPDATE troubleshooting 
      SET used_count = used_count + 1,
          last_used_at = ?
      WHERE id = ?
    `);

        stmt.run(new Date().toISOString(), id);
    }

    /**
     * Update effectiveness rating after user feedback.
     */
    async updateEffectiveness(id: number, effectiveness: number): Promise<void> {
        await this.init();

        if (!this.db) return;

        const stmt = this.db.prepare(`
      UPDATE troubleshooting 
      SET effectiveness = ?
      WHERE id = ?
    `);

        stmt.run(Math.max(1, Math.min(10, effectiveness)), id);
    }

    /**
     * Get statistics about the knowledge base.
     */
    async getStats(): Promise<{
        totalEntries: number;
        topProjectTypes: { type: string; count: number }[];
        topTags: { tag: string; count: number }[];
        averageEffectiveness: number;
    }> {
        await this.init();

        if (!this.db) {
            return {
                totalEntries: 0,
                topProjectTypes: [],
                topTags: [],
                averageEffectiveness: 0,
            };
        }

        const totalStmt = this.db.prepare('SELECT COUNT(*) as count FROM troubleshooting');
        const total = totalStmt.get();

        const projectTypeStmt = this.db.prepare(`
      SELECT project_type as type, COUNT(*) as count 
      FROM troubleshooting 
      WHERE project_type IS NOT NULL
      GROUP BY project_type 
      ORDER BY count DESC 
      LIMIT 10
    `);
        const projectTypes = projectTypeStmt.all();

        const avgStmt = this.db.prepare('SELECT AVG(effectiveness) as avg FROM troubleshooting');
        const avg = avgStmt.get();

        return {
            totalEntries: total.count,
            topProjectTypes: projectTypes,
            topTags: [], // TODO: Parse JSON tags and aggregate
            averageEffectiveness: avg.avg || 0,
        };
    }

    private rowToEntry(row: any): TroubleshootingEntry {
        return {
            id: row.id,
            errorSignature: row.error_signature,
            errorMessage: row.error_message,
            context: row.context,
            solution: row.solution,
            projectType: row.project_type,
            techStack: row.tech_stack ? JSON.parse(row.tech_stack) : undefined,
            tags: row.tags ? JSON.parse(row.tags) : undefined,
            effectiveness: row.effectiveness,
            createdAt: row.created_at,
            usedCount: row.used_count,
            lastUsedAt: row.last_used_at,
        };
    }
}

// ============================================================================
// Convenience Functions
// ============================================================================

let globalInstance: GlobalKnowledge | null = null;

async function getGlobalKnowledge(): Promise<GlobalKnowledge> {
    if (!globalInstance) {
        globalInstance = new GlobalKnowledge();
        await globalInstance.init();
    }
    return globalInstance;
}

/**
 * Record a troubleshooting experience.
 * Call this when an error is successfully resolved.
 */
export async function recordTroubleshooting(
    entry: Omit<TroubleshootingEntry, 'id' | 'errorSignature' | 'createdAt' | 'usedCount'>
): Promise<number> {
    const knowledge = await getGlobalKnowledge();
    return knowledge.record(entry);
}

/**
 * Search for solutions to a similar error.
 * Call this when encountering an error during execution.
 */
export async function searchTroubleshooting(
    errorMessage: string,
    options?: {
        projectType?: string;
        limit?: number;
    }
): Promise<KnowledgeSearchResult[]> {
    const knowledge = await getGlobalKnowledge();
    return knowledge.search(errorMessage, options);
}
