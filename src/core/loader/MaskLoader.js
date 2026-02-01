/**
 * Mask Loader
 *
 * Loads mask definitions from the file system.
 */
import { parse as parseYaml } from 'yaml';
import { validateMaskOrThrow } from '../schema/validator';
export class MaskLoader {
    masksDir;
    catalog = null;
    cache = new Map();
    constructor(options) {
        this.masksDir = options.masksDir;
    }
    /**
     * Load the mask catalog (index.json)
     */
    async loadCatalog() {
        if (this.catalog) {
            return this.catalog;
        }
        const indexPath = `${this.masksDir}/index.json`;
        const file = Bun.file(indexPath);
        if (!(await file.exists())) {
            throw new Error(`Mask catalog not found: ${indexPath}`);
        }
        this.catalog = await file.json();
        return this.catalog;
    }
    /**
     * Load all masks from the catalog
     */
    async loadAll() {
        const catalog = await this.loadCatalog();
        const masks = [];
        for (const [categoryId, category] of Object.entries(catalog.categories)) {
            for (const entry of category.masks) {
                try {
                    const mask = await this.load(entry.id);
                    if (mask) {
                        masks.push(mask);
                    }
                }
                catch (error) {
                    console.warn(`Failed to load mask ${entry.id}:`, error);
                }
            }
        }
        return masks;
    }
    /**
     * Load a single mask by ID
     */
    async load(maskId) {
        // Check cache
        if (this.cache.has(maskId)) {
            return this.cache.get(maskId);
        }
        const catalog = await this.loadCatalog();
        // Find mask in catalog
        let entry = null;
        let categoryId = null;
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
        const file = Bun.file(filePath);
        if (!(await file.exists())) {
            throw new Error(`Mask file not found: ${filePath}`);
        }
        const content = await file.text();
        const parsed = filePath.endsWith('.yaml') || filePath.endsWith('.yml')
            ? parseYaml(content)
            : JSON.parse(content);
        // Validate
        const validated = validateMaskOrThrow(parsed);
        // Create loaded mask
        const loadedMask = {
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
    async listAll() {
        const catalog = await this.loadCatalog();
        const result = [];
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
    async listCategories() {
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
    clearCache() {
        this.cache.clear();
        this.catalog = null;
    }
}
//# sourceMappingURL=MaskLoader.js.map