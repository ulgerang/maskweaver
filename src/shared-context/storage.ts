/**
 * Storage Adapter
 * 
 * 파일 기반 저장소 (향후 DB 전환 대비 추상화)
 */

import { join, normalize, resolve } from "path";
import { mkdir, rename, readFile, appendFile } from "fs/promises";
import { existsSync } from "fs";

export interface StorageAdapter {
  read<T>(path: string): Promise<T | null>;
  write<T>(path: string, data: T): Promise<void>;
  append(path: string, line: string): Promise<void>;
  exists(path: string): boolean;
  ensureDir(path: string): Promise<void>;
  getFullPath(path: string): string;
}

// 경로 검증 (Path Traversal 방지)
export function validatePath(fullPath: string, baseDir: string): boolean {
  const resolvedFull = resolve(fullPath);
  const resolvedBase = resolve(baseDir);
  return resolvedFull.startsWith(resolvedBase) && !fullPath.includes('..');
}

// Atomic Write 구현
async function atomicWrite(filePath: string, data: string): Promise<void> {
  const tempPath = `${filePath}.tmp.${Date.now()}`;
  await Bun.write(tempPath, data);
  await rename(tempPath, filePath);
}

export class FileStorageAdapter implements StorageAdapter {
  constructor(private baseDir: string) {}

  async read<T>(path: string): Promise<T | null> {
    const fullPath = join(this.baseDir, path);
    if (!validatePath(fullPath, this.baseDir)) {
      throw new Error(`Invalid path: ${path}`);
    }
    if (!existsSync(fullPath)) return null;
    const content = await readFile(fullPath, 'utf-8');
    return JSON.parse(content) as T;
  }

  async write<T>(path: string, data: T): Promise<void> {
    const fullPath = join(this.baseDir, path);
    if (!validatePath(fullPath, this.baseDir)) {
      throw new Error(`Invalid path: ${path}`);
    }
    await this.ensureDir(dirname(fullPath));
    await atomicWrite(fullPath, JSON.stringify(data, null, 2));
  }

  async append(path: string, line: string): Promise<void> {
    const fullPath = join(this.baseDir, path);
    if (!validatePath(fullPath, this.baseDir)) {
      throw new Error(`Invalid path: ${path}`);
    }
    await appendFile(fullPath, line + '\n');
  }

  exists(path: string): boolean {
    return existsSync(join(this.baseDir, path));
  }

  getFullPath(path: string): string {
    return join(this.baseDir, path);
  }

  async ensureDir(path: string): Promise<void> {
    if (!existsSync(path)) {
      await mkdir(path, { recursive: true });
    }
  }
}

function dirname(path: string): string {
  return path.split(/[/\\]/).slice(0, -1).join('/');
}
