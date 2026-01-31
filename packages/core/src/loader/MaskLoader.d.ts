/**
 * Mask Loader
 *
 * Loads mask definitions from the file system.
 */
import type { MaskCatalog, LoadedMask, MaskCatalogEntry } from '../schema/types';
export interface MaskLoaderOptions {
    masksDir: string;
}
export declare class MaskLoader {
    private masksDir;
    private catalog;
    private cache;
    constructor(options: MaskLoaderOptions);
    /**
     * Load the mask catalog (index.json)
     */
    loadCatalog(): Promise<MaskCatalog>;
    /**
     * Load all masks from the catalog
     */
    loadAll(): Promise<LoadedMask[]>;
    /**
     * Load a single mask by ID
     */
    load(maskId: string): Promise<LoadedMask | null>;
    /**
     * List all masks (metadata only)
     */
    listAll(): Promise<Array<MaskCatalogEntry & {
        category: string;
    }>>;
    /**
     * List categories
     */
    listCategories(): Promise<Array<{
        id: string;
        name: string;
        description: string;
        count: number;
    }>>;
    /**
     * Clear the cache
     */
    clearCache(): void;
}
//# sourceMappingURL=MaskLoader.d.ts.map