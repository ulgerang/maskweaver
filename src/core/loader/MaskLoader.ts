/**
 * Mask Loader
 * 
 * Loads mask definitions from the file system.
 */

import { readFile } from 'fs/promises';
import { existsSync } from 'fs';
import { parse as parseYaml } from 'yaml';
import { validateMaskOrThrow } from '../schema/validator';
import type { MaskSchema, MaskCatalog, LoadedMask, MaskCatalogEntry } from '../schema/types';

export interface MaskLoaderOptions {
  masksDir: string;
}

export class MaskLoader {
  private masksDir: string;
  private catalog: MaskCatalog | null = null;
  private cache: Map<string, LoadedMask> = new Map();
  
  constructor(options: MaskLoaderOptions) {
    this.masksDir = options.masksDir;
  }
  
  /**
   * Load the mask catalog (index.json)
   */
  async loadCatalog(): Promise<MaskCatalog> {
    if (this.catalog) {
      return this.catalog;
    }
    
    const indexPath = `${this.masksDir}/index.json`;
    
    if (!existsSync(indexPath)) {
      throw new Error(`Mask catalog not found: ${indexPath}`);
    }
    
    const content = await readFile(indexPath, "utf-8");
    this.catalog = JSON.parse(content) as MaskCatalog;
    return this.catalog;
  }
  
  /**
   * Load all masks from the catalog
   */
  async loadAll(): Promise<LoadedMask[]> {
    const catalog = await this.loadCatalog();
    const masks: LoadedMask[] = [];
    
    for (const [categoryId, category] of Object.entries(catalog.categories)) {
      for (const entry of category.masks) {
        try {
          const mask = await this.load(entry.id);
          if (mask) {
            masks.push(mask);
          }
        } catch (error) {
          console.warn(`Failed to load mask ${entry.id}:`, error);
        }
      }
    }
    
    return masks;
  }
  
  /**
   * Load a single mask by ID
   */
  async load(maskId: string): Promise<LoadedMask | null> {
    // Check cache
    if (this.cache.has(maskId)) {
      return this.cache.get(maskId)!;
    }
    
    const catalog = await this.loadCatalog();
    
    // Find mask in catalog
    let entry: MaskCatalogEntry | null = null;
    let categoryId: string | null = null;
    
    for (const [catId, category] of Object.entries(catalog.categories)) {
      const found = category.masks.find(m => m.id === maskId);
      if (found) {
        entry = found;
        categoryId = catId;
        break;
      }
    }
    
    if (!entry || !categoryId) {
      return null;
    }
    
    // Load mask file
    const filePath = `${this.masksDir}/${entry.file}`;
    
    if (!existsSync(filePath)) {
      throw new Error(`Mask file not found: ${filePath}`);
    }
    
    const content = await readFile(filePath, "utf-8");
    const parsed = filePath.endsWith('.yaml') || filePath.endsWith('.yml')
      ? parseYaml(content)
      : JSON.parse(content);
    
    // Validate
    const validated = validateMaskOrThrow(parsed);
    
    // Create loaded mask
    const loadedMask: LoadedMask = {
      ...validated,
      category: categoryId,
      filePath,
    };
    
    // Cache it
    this.cache.set(maskId, loadedMask);
    
    return loadedMask;
  }
  
  /**
   * List all masks (metadata only)
   */
  async listAll(): Promise<Array<MaskCatalogEntry & { category: string }>> {
    const catalog = await this.loadCatalog();
    const result: Array<MaskCatalogEntry & { category: string }> = [];
    
    for (const [categoryId, category] of Object.entries(catalog.categories)) {
      for (const mask of category.masks) {
        result.push({
          ...mask,
          category: categoryId,
        });
      }
    }
    
    return result;
  }
  
  /**
   * List categories
   */
  async listCategories(): Promise<Array<{ id: string; name: string; description: string; count: number }>> {
    const catalog = await this.loadCatalog();
    
    return Object.entries(catalog.categories).map(([id, cat]) => ({
      id,
      name: cat.name,
      description: cat.description,
      count: cat.masks.length,
    }));
  }
  
  /**
   * Clear the cache
   */
  clearCache(): void {
    this.cache.clear();
    this.catalog = null;
  }
}
