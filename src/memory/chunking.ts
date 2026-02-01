/**
 * Text Chunking - Break text into manageable pieces
 * 
 * Simple line-based chunking with overlap.
 * Preserves context at chunk boundaries.
 */

import { CONFIG, type Chunk, type SourceType, hashText, determineSource } from './core.js';

/**
 * Chunk text into overlapping segments.
 */
export function chunkText(text: string, filePath: string): Chunk[] {
  const { maxTokens, overlapTokens, charsPerToken } = CONFIG.chunking;
  
  const source = determineSource(filePath);
  const lines = text.split('\n');
  const chunks: Chunk[] = [];
  
  const maxChars = maxTokens * charsPerToken;
  const overlapChars = overlapTokens * charsPerToken;
  
  let currentChunkLines: string[] = [];
  let currentChunkStart = 1; // 1-based line number
  let currentLength = 0;
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineLength = line.length + 1; // +1 for newline
    
    if (currentLength + lineLength <= maxChars) {
      currentChunkLines.push(line);
      currentLength += lineLength;
    } else {
      // Save current chunk
      if (currentChunkLines.length > 0) {
        const chunkText = currentChunkLines.join('\n');
        if (chunkText.trim().length > 0) {
          chunks.push(createChunk(
            filePath,
            currentChunkStart,
            currentChunkStart + currentChunkLines.length - 1,
            chunkText,
            source
          ));
        }
      }
      
      // Calculate overlap
      const overlapLines = calculateOverlapLines(currentChunkLines, overlapChars);
      
      // Start new chunk
      currentChunkStart = i + 1 - overlapLines.length;
      currentChunkLines = [...overlapLines, line];
      currentLength = currentChunkLines.join('\n').length;
    }
  }
  
  // Save last chunk
  if (currentChunkLines.length > 0) {
    const chunkText = currentChunkLines.join('\n');
    if (chunkText.trim().length > 0) {
      chunks.push(createChunk(
        filePath,
        currentChunkStart,
        currentChunkStart + currentChunkLines.length - 1,
        chunkText,
        source
      ));
    }
  }
  
  return chunks;
}

/**
 * Calculate overlap lines from end of chunk.
 */
function calculateOverlapLines(lines: string[], overlapChars: number): string[] {
  const result: string[] = [];
  let length = 0;
  
  for (let i = lines.length - 1; i >= 0; i--) {
    const lineLength = lines[i].length + 1;
    if (length + lineLength > overlapChars) break;
    result.unshift(lines[i]);
    length += lineLength;
  }
  
  return result;
}

/**
 * Create chunk object.
 */
function createChunk(
  path: string,
  startLine: number,
  endLine: number,
  text: string,
  source: SourceType
): Chunk {
  return {
    path,
    startLine,
    endLine,
    text,
    hash: hashText(text),
    source,
  };
}

/**
 * Estimate tokens in text.
 */
export function estimateTokens(text: string): number {
  if (!text || text.length === 0) return 0;
  
  // Korean characters: ~2 tokens per char
  const koreanChars = (text.match(/[\uAC00-\uD7A3]/g) || []).length;
  // English words: ~1.3 tokens per word
  const englishWords = (text.match(/[a-zA-Z]+/g) || []).length;
  // Other chars
  const otherChars = text.length - koreanChars - (englishWords * 5);
  
  const koreanTokens = koreanChars * 2;
  const englishTokens = englishWords * 1.3;
  const otherTokens = Math.max(0, otherChars) / 4;
  
  return Math.ceil(koreanTokens + englishTokens + otherTokens);
}

/**
 * Split text into sentences.
 * Handles both English and Korean.
 */
export function splitIntoSentences(text: string): string[] {
  const sentenceEnders = /([.!?。！？])\s+/g;
  const sentences: string[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  
  while ((match = sentenceEnders.exec(text)) !== null) {
    sentences.push(text.slice(lastIndex, match.index + match[1].length).trim());
    lastIndex = match.index + match[0].length;
  }
  
  if (lastIndex < text.length) {
    sentences.push(text.slice(lastIndex).trim());
  }
  
  return sentences.filter(s => s.length > 0);
}

/**
 * Markdown section parsing.
 */
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
