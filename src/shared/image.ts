/**
 * @maskweaver/shared - Image Normalization Utilities
 * 
 * LLM Vision API를 위한 이미지 정규화 유틸리티
 * 모든 주요 LLM (OpenAI, Claude, Gemini, Kimi)이 지원하는 포맷으로 변환
 * 
 * 지원 포맷: JPEG, PNG, WebP, GIF (모든 LLM 공통)
 * 권장 설정: JPEG (최대 호환성), 2048x2048 이하
 */

import * as fs from "node:fs";
import * as path from "node:path";

// ============================================================================
// Types
// ============================================================================

export interface ImageNormalizeOptions {
    /** Target format (default: 'jpeg' for max compatibility) */
    format?: "jpeg" | "png" | "webp";
    /** Max dimension in pixels (default: 2048) */
    maxDimension?: number;
    /** JPEG quality 1-100 (default: 85) */
    quality?: number;
    /** Remove metadata/EXIF (default: true) */
    stripMetadata?: boolean;
}

export interface NormalizedImage {
    /** Base64 encoded image data */
    base64: string;
    /** MIME type (e.g., 'image/jpeg') */
    mimeType: string;
    /** Original file path (if from file) */
    originalPath?: string;
    /** Whether conversion was performed */
    converted: boolean;
    /** Warning messages if any */
    warnings?: string[];
}

export interface ImageInfo {
    format: string;
    width?: number;
    height?: number;
    sizeBytes: number;
    hasAlpha?: boolean;
}

// ============================================================================
// Constants
// ============================================================================

/** Universally supported formats across all major LLMs */
const SUPPORTED_FORMATS = ["jpeg", "jpg", "png", "webp", "gif"];

/** MIME type mappings */
const MIME_TYPES: Record<string, string> = {
    jpeg: "image/jpeg",
    jpg: "image/jpeg",
    png: "image/png",
    webp: "image/webp",
    gif: "image/gif",
};

/** Maximum dimensions by LLM (using most restrictive for safety) */
const LLM_LIMITS = {
    maxDimension: 2048, // Safe for all LLMs
    maxFileSize: 20 * 1024 * 1024, // 20MB (OpenAI limit)
    kimiMaxDimension: 4096, // Kimi allows up to 4K
    claudeMaxDimension: 8000, // Claude allows up to 8000x8000
};

// ============================================================================
// Image Detection (Pure JS - no dependencies)
// ============================================================================

/** Detect image format from magic bytes */
function detectFormat(buffer: Buffer): string | null {
    if (buffer.length < 12) return null;

    // JPEG: FF D8 FF
    if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
        return "jpeg";
    }

    // PNG: 89 50 4E 47 0D 0A 1A 0A
    if (
        buffer[0] === 0x89 &&
        buffer[1] === 0x50 &&
        buffer[2] === 0x4e &&
        buffer[3] === 0x47 &&
        buffer[4] === 0x0d &&
        buffer[5] === 0x0a &&
        buffer[6] === 0x1a &&
        buffer[7] === 0x0a
    ) {
        return "png";
    }

    // WebP: RIFF....WEBP
    if (
        buffer[0] === 0x52 &&
        buffer[1] === 0x49 &&
        buffer[2] === 0x46 &&
        buffer[3] === 0x46 &&
        buffer[8] === 0x57 &&
        buffer[9] === 0x45 &&
        buffer[10] === 0x42 &&
        buffer[11] === 0x50
    ) {
        return "webp";
    }

    // GIF: GIF87a or GIF89a
    if (
        buffer[0] === 0x47 &&
        buffer[1] === 0x49 &&
        buffer[2] === 0x46 &&
        buffer[3] === 0x38 &&
        (buffer[4] === 0x37 || buffer[4] === 0x39) &&
        buffer[5] === 0x61
    ) {
        return "gif";
    }

    // BMP: BM
    if (buffer[0] === 0x42 && buffer[1] === 0x4d) {
        return "bmp";
    }

    // TIFF: II or MM
    if (
        (buffer[0] === 0x49 && buffer[1] === 0x49) ||
        (buffer[0] === 0x4d && buffer[1] === 0x4d)
    ) {
        return "tiff";
    }

    // HEIC/HEIF: ftyp followed by heic, heix, mif1, etc.
    if (
        buffer[4] === 0x66 &&
        buffer[5] === 0x74 &&
        buffer[6] === 0x79 &&
        buffer[7] === 0x70
    ) {
        const brand = buffer.slice(8, 12).toString("ascii");
        if (["heic", "heix", "mif1", "msf1", "hevc", "hevx"].includes(brand)) {
            return "heic";
        }
    }

    return null;
}

/** Get PNG dimensions (width, height) from header */
function getPngDimensions(
    buffer: Buffer
): { width: number; height: number } | null {
    // PNG IHDR chunk starts at byte 8, width at 16, height at 20
    if (buffer.length < 24) return null;
    if (buffer[12] !== 0x49 || buffer[13] !== 0x48) return null; // 'IH'

    const width = buffer.readUInt32BE(16);
    const height = buffer.readUInt32BE(20);
    return { width, height };
}

/** Get JPEG dimensions (more complex due to variable structure) */
function getJpegDimensions(
    buffer: Buffer
): { width: number; height: number } | null {
    let offset = 2; // Skip SOI marker

    while (offset < buffer.length - 1) {
        if (buffer[offset] !== 0xff) return null;

        const marker = buffer[offset + 1];

        // SOF markers (Start of Frame)
        if (
            marker >= 0xc0 &&
            marker <= 0xcf &&
            marker !== 0xc4 &&
            marker !== 0xc8 &&
            marker !== 0xcc
        ) {
            if (offset + 9 > buffer.length) return null;
            const height = buffer.readUInt16BE(offset + 5);
            const width = buffer.readUInt16BE(offset + 7);
            return { width, height };
        }

        // Skip to next marker
        if (marker === 0xd8 || marker === 0xd9) {
            offset += 2;
        } else if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
            offset += 2;
        } else {
            const len = buffer.readUInt16BE(offset + 2);
            offset += 2 + len;
        }
    }

    return null;
}

/** Get image info without external dependencies */
export function getImageInfo(input: Buffer | string): ImageInfo | null {
    const buffer = typeof input === "string" ? fs.readFileSync(input) : input;

    const format = detectFormat(buffer);
    if (!format) return null;

    let dimensions: { width: number; height: number } | null = null;

    if (format === "png") {
        dimensions = getPngDimensions(buffer);
    } else if (format === "jpeg") {
        dimensions = getJpegDimensions(buffer);
    }

    return {
        format,
        width: dimensions?.width,
        height: dimensions?.height,
        sizeBytes: buffer.length,
        hasAlpha: format === "png" || format === "webp",
    };
}

// ============================================================================
// Normalization Logic
// ============================================================================

/** Check if format is supported by all LLMs */
export function isSupported(format: string): boolean {
    return SUPPORTED_FORMATS.includes(format.toLowerCase());
}

/** Check if image needs conversion */
export function needsConversion(info: ImageInfo, options?: ImageNormalizeOptions): {
    needsConversion: boolean;
    reasons: string[];
} {
    const reasons: string[] = [];
    const maxDim = options?.maxDimension ?? LLM_LIMITS.maxDimension;

    // Format not supported
    if (!isSupported(info.format)) {
        reasons.push(`Format '${info.format}' not supported by all LLMs`);
    }

    // Too large
    if (info.width && info.width > maxDim) {
        reasons.push(`Width ${info.width}px exceeds max ${maxDim}px`);
    }
    if (info.height && info.height > maxDim) {
        reasons.push(`Height ${info.height}px exceeds max ${maxDim}px`);
    }

    // File too big
    if (info.sizeBytes > LLM_LIMITS.maxFileSize) {
        reasons.push(`File size ${(info.sizeBytes / 1024 / 1024).toFixed(1)}MB exceeds 20MB limit`);
    }

    return {
        needsConversion: reasons.length > 0,
        reasons,
    };
}

/**
 * Normalize an image for LLM Vision API compatibility
 * 
 * This is the main entry point. It will:
 * 1. Detect image format
 * 2. Check if conversion is needed
 * 3. Convert if necessary (requires sharp)
 * 4. Return base64-encoded result
 * 
 * @example
 * ```typescript
 * import { normalizeImage } from 'maskweaver/shared';
 * 
 * // From file path
 * const result = await normalizeImage('/path/to/screenshot.png');
 * console.log(result.base64); // Use in LLM API
 * 
 * // From buffer
 * const buffer = fs.readFileSync('/path/to/image.bmp');
 * const result = await normalizeImage(buffer, { format: 'jpeg' });
 * ```
 */
export async function normalizeImage(
    input: Buffer | string,
    options?: ImageNormalizeOptions
): Promise<NormalizedImage> {
    const buffer = typeof input === "string" ? fs.readFileSync(input) : input;
    const originalPath = typeof input === "string" ? input : undefined;

    const info = getImageInfo(buffer);
    const warnings: string[] = [];

    if (!info) {
        throw new Error("Unable to detect image format. File may be corrupted or unsupported.");
    }

    const checkResult = needsConversion(info, options);

    // If no conversion needed, return as-is
    if (!checkResult.needsConversion) {
        return {
            base64: buffer.toString("base64"),
            mimeType: MIME_TYPES[info.format] || `image/${info.format}`,
            originalPath,
            converted: false,
        };
    }

    // Conversion needed - try to use sharp if available
    warnings.push(...checkResult.reasons);

    try {
        // Dynamic import to avoid hard dependency
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const sharp = await (async () => {
            try {
                // Use Function constructor to avoid static analysis
                const importFn = new Function('modulePath', 'return import(modulePath)');
                return await importFn('sharp');
            } catch {
                return null;
            }
        })();

        if (!sharp) {
            // No sharp available - return with warnings
            if (isSupported(info.format)) {
                // Format is OK, just size issues - return anyway with warning
                warnings.push("Image may be too large. Install 'sharp' for automatic resizing.");
                return {
                    base64: buffer.toString("base64"),
                    mimeType: MIME_TYPES[info.format] || `image/${info.format}`,
                    originalPath,
                    converted: false,
                    warnings,
                };
            } else {
                throw new Error(
                    `Image format '${info.format}' requires conversion. Install 'sharp' package: npm install sharp`
                );
            }
        }

        // Use sharp for conversion
        const targetFormat = options?.format ?? "jpeg";
        const maxDim = options?.maxDimension ?? LLM_LIMITS.maxDimension;
        const quality = options?.quality ?? 85;

        let pipeline = sharp.default(buffer);

        // Resize if needed
        if (
            (info.width && info.width > maxDim) ||
            (info.height && info.height > maxDim)
        ) {
            pipeline = pipeline.resize(maxDim, maxDim, {
                fit: "inside",
                withoutEnlargement: true,
            });
        }

        // Convert format
        if (targetFormat === "jpeg") {
            pipeline = pipeline.jpeg({ quality });
        } else if (targetFormat === "png") {
            pipeline = pipeline.png({ compressionLevel: 6 });
        } else if (targetFormat === "webp") {
            pipeline = pipeline.webp({ quality });
        }

        const outputBuffer = await pipeline.toBuffer();

        return {
            base64: outputBuffer.toString("base64"),
            mimeType: MIME_TYPES[targetFormat],
            originalPath,
            converted: true,
            warnings: warnings.length > 0 ? warnings : undefined,
        };
    } catch (error) {
        if (error instanceof Error && error.message.includes("sharp")) {
            throw error;
        }
        throw new Error(`Image conversion failed: ${error}`);
    }
}

/**
 * Normalize image and save to file
 * 
 * @example
 * ```typescript
 * const outputPath = await normalizeImageToFile(
 *   '/path/to/screenshot.bmp',
 *   '/path/to/output.jpg',
 *   { format: 'jpeg', quality: 90 }
 * );
 * ```
 */
export async function normalizeImageToFile(
    input: Buffer | string,
    outputPath: string,
    options?: ImageNormalizeOptions
): Promise<string> {
    const result = await normalizeImage(input, options);
    const buffer = Buffer.from(result.base64, "base64");

    // Ensure directory exists
    const dir = path.dirname(outputPath);
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }

    fs.writeFileSync(outputPath, buffer);
    return outputPath;
}

/**
 * Quick check if an image file is LLM-compatible without loading full file
 */
export function isLLMCompatible(filePath: string): {
    compatible: boolean;
    format: string | null;
    issues: string[];
} {
    const issues: string[] = [];

    if (!fs.existsSync(filePath)) {
        return { compatible: false, format: null, issues: ["File not found"] };
    }

    // Read only first 24 bytes for format detection
    const fd = fs.openSync(filePath, "r");
    const header = Buffer.alloc(24);
    fs.readSync(fd, header, 0, 24, 0);
    fs.closeSync(fd);

    const format = detectFormat(header);
    if (!format) {
        return { compatible: false, format: null, issues: ["Unknown format"] };
    }

    if (!isSupported(format)) {
        issues.push(`Format '${format}' not universally supported`);
    }

    const stats = fs.statSync(filePath);
    if (stats.size > LLM_LIMITS.maxFileSize) {
        issues.push(`File too large: ${(stats.size / 1024 / 1024).toFixed(1)}MB`);
    }

    return {
        compatible: issues.length === 0,
        format,
        issues,
    };
}

/**
 * Create LLM-ready image data URL
 * 
 * @example
 * ```typescript
 * const dataUrl = await createImageDataUrl('/path/to/image.png');
 * // Returns: "data:image/png;base64,iVBORw0KGgo..."
 * ```
 */
export async function createImageDataUrl(
    input: Buffer | string,
    options?: ImageNormalizeOptions
): Promise<string> {
    const result = await normalizeImage(input, options);
    return `data:${result.mimeType};base64,${result.base64}`;
}
