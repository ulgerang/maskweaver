/**
 * File Indexer - Process markdown files into searchable chunks
 * 
 * Read file → Parse sections → Chunk → Hash → Embed → Store
 */

import { readFile } from 'fs/promises';
import { chunkText } from './chunking.js';
import { initDatabase, upsertChunk, deleteChunksByPath, getChunksByPath } from './store/sqlite.js';
import { getDbPath, type Chunk, type SourceType } from './core.js';

// Will be provided by embedding provider
type EmbeddingProvider = (text: string) => Promise<number[]>;

// ============================================================================
// Markdown Parsing
// ============================================================================

export interface MarkdownSection {
  header: string;
  content: string;
  level: number;
  startLine: number;
  endLine: number;
}

const HEADER_REGEX = /^(#{1,6})\s+(.+)$/;

/**
 * Parse markdown into sections.
 */
export function parseMarkdownSections(content: string): MarkdownSection[] {
  const lines = content.split('\n');
  const sections: MarkdownSection[] = [];

  let currentSection: MarkdownSection | null = null;
  let currentLines: string[] = [];
  let sectionStartLine = 1;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineNumber = i + 1;
    const headerMatch = line.match(HEADER_REGEX);

    if (headerMatch) {
      // Save previous section
      if (currentSection !== null || currentLines.length > 0) {
        sections.push({
          header: currentSection?.header || '',
          content: currentLines.join('\n'),
          level: currentSection?.level || 0,
          startLine: sectionStartLine,
          endLine: lineNumber - 1
        });
      }

      // Start new section
      currentSection = {
        header: headerMatch[2],
        content: '',
        level: headerMatch[1].length,
        startLine: lineNumber,
        endLine: lineNumber
      };
      currentLines = [line];
      sectionStartLine = lineNumber;
    } else {
      currentLines.push(line);
    }
  }

  // Save last section
  if (currentLines.length > 0) {
    sections.push({
      header: currentSection?.header || '',
      content: currentLines.join('\n'),
      level: currentSection?.level || 0,
      startLine: sectionStartLine,
      endLine: lines.length
    });
  }

  return sections;
}

/**
 * Classify source from file path.
 */
export function classifySource(filePath: string): SourceType {
  const normalized = filePath.replace(/\\/g, '/').toLowerCase();
  const fileName = normalized.split('/').pop() || '';

  if (fileName === 'memory.md') return 'memory';
  if (fileName === 'masks.md') return 'masks';
  if (fileName === 'retrospect.md') return 'retrospect';
  if (fileName === 'user.md') return 'user';
  if (normalized.includes('/daily/') || normalized.includes('\\daily\\')) return 'daily';

  return 'memory';
}

// ============================================================================
// File Processing
// ============================================================================

/**
 * Process markdown file into chunks.
 */
async function processFile(filePath: string): Promise<Chunk[]> {
  const content = await readFile(filePath, 'utf-8');
  return chunkText(content, filePath);
}

// ============================================================================
// Indexing
// ============================================================================

/**
 * Index a single file.
 * Only re-embeds chunks that changed (based on hash).
 */
export async function indexFile(
  filePath: string,
  getEmbedding: EmbeddingProvider,
  basePath?: string
): Promise<void> {
  console.log(`[Indexer] Processing: ${filePath}`);

  // Initialize database
  initDatabase(getDbPath(basePath));

  // Process file
  const chunks = await processFile(filePath);
  console.log(`[Indexer] Generated ${chunks.length} chunks`);

  // Get existing chunks for hash comparison
  const existingChunks = getChunksByPath(filePath);
  const existingHashes = new Set(existingChunks.map(c => c.hash));

  // Process only changed chunks
  let newCount = 0;
  let skippedCount = 0;

  for (const chunk of chunks) {
    if (existingHashes.has(chunk.hash)) {
      skippedCount++;
      continue;
    }

    // New or changed chunk - compute embedding
    const embedding = await getEmbedding(chunk.text);
    upsertChunk(chunk, embedding);
    newCount++;
  }

  console.log(`[Indexer] Completed: ${newCount} new, ${skippedCount} unchanged`);
}

/**
 * Reindex file (delete all chunks and reindex).
 */
export async function reindexFile(
  filePath: string,
  getEmbedding: EmbeddingProvider,
  basePath?: string
): Promise<void> {
  console.log(`[Indexer] Reindexing: ${filePath}`);

  initDatabase(getDbPath(basePath));

  // Delete existing chunks
  deleteChunksByPath(filePath);

  // Process and index all chunks
  const chunks = await processFile(filePath);

  for (const chunk of chunks) {
    const embedding = await getEmbedding(chunk.text);
    upsertChunk(chunk, embedding);
  }

  console.log(`[Indexer] Reindexed ${chunks.length} chunks`);
}

/**
 * Index all memory files in directory.
 */
export async function indexAllMemoryFiles(
  baseDir: string,
  getEmbedding: EmbeddingProvider,
  basePath?: string
): Promise<void> {
  console.log(`[Indexer] Scanning directory: ${baseDir}`);

  initDatabase(getDbPath(basePath || baseDir));

  // Main memory files
  const mainFiles = ['MEMORY.md', 'MASKS.md', 'RETROSPECT.md', 'USER.md'];
  let totalFiles = 0;

  for (const fileName of mainFiles) {
    const filePath = `${baseDir}/${fileName}`;
    try {
      await indexFile(filePath, getEmbedding, basePath || baseDir);
      totalFiles++;
    } catch (error) {
      // File doesn't exist or not readable
      console.log(`[Indexer] Skipping ${fileName}: ${error}`);
    }
  }

  // TODO: Scan daily directory
  // This requires glob or fs.readdir

  console.log(`[Indexer] Completed indexing ${totalFiles} files`);
}
