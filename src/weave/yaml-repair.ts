/**
 * YAML Repair Utility
 * 
 * Provides YAML string escaping, corruption detection, and auto-repair
 * for Weave plan files. Handles common YAML corruption patterns:
 * - Unclosed/mismatched quotes
 * - Unescaped special characters in string values
 * - Tab→space conversion
 * - Truncated files
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

// ============================================================================
// Types
// ============================================================================

export interface RepairResult {
    file: string;
    status: 'ok' | 'repaired' | 'unrecoverable';
    error?: string;
    details?: string;
    /** Structured info about what's missing for user-assisted repair */
    missingInfo?: MissingInfo[];
}

export interface MissingInfo {
    field: string;
    description: string;
    lineHint?: number;
}

// ============================================================================
// YAML String Escaping
// ============================================================================

/**
 * Properly escape a string value for YAML double-quoted format.
 * Handles all YAML special characters that would break parsing.
 */
export function yamlEscapeString(value: string): string {
    if (value === undefined || value === null) return '""';
    
    const str = String(value);
    
    // If the string is simple (no special chars), return as-is with quotes
    if (/^[a-zA-Z0-9가-힣ぁ-んァ-ヶ\s.,;:!?@#%^&*()_+=\-\[\]{}/<>~`|']+$/.test(str) 
        && !str.includes('"') 
        && !str.includes('\\')
        && !str.startsWith(' ')
        && !str.endsWith(' ')) {
        return `"${str}"`;
    }
    
    // Escape special characters for YAML double-quoted strings
    const escaped = str
        .replace(/\\/g, '\\\\')     // backslash first
        .replace(/"/g, '\\"')       // double quotes
        .replace(/\n/g, '\\n')      // newlines
        .replace(/\r/g, '\\r')      // carriage returns
        .replace(/\t/g, '\\t')      // tabs
        .replace(/\0/g, '\\0');     // null bytes
    
    return `"${escaped}"`;
}

// ============================================================================
// YAML Corruption Detection
// ============================================================================

/**
 * Detect common YAML corruption patterns and return error details.
 */
function detectCorruption(content: string): {
    corrupted: boolean;
    issues: string[];
} {
    const issues: string[] = [];
    const lines = content.split('\n');
    
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const lineNum = i + 1;
        
        // Check for unclosed double quotes in value positions
        const valueMatch = line.match(/^(\s*[\w_-]+:\s*)"(.*)/);
        if (valueMatch) {
            const afterColon = valueMatch[2];
            // Count unescaped quotes
            const unescaped = afterColon.replace(/\\"/g, '');
            const quoteCount = (unescaped.match(/"/g) || []).length;
            if (quoteCount % 2 !== 0) {
                issues.push(`Line ${lineNum}: Unclosed double quote in value`);
            }
        }
        
        // Check for array items with unclosed quotes
        const arrayMatch = line.match(/^(\s*-\s*)"(.*)/);
        if (arrayMatch && !line.match(/^(\s*-\s*\w+:\s*)/)) {
            const afterDash = arrayMatch[2];
            const unescaped = afterDash.replace(/\\"/g, '');
            const quoteCount = (unescaped.match(/"/g) || []).length;
            if (quoteCount % 2 !== 0) {
                issues.push(`Line ${lineNum}: Unclosed double quote in array item`);
            }
        }
        
        // Check for tabs (YAML requires spaces)
        if (line.includes('\t') && !line.match(/:\s*".*\t.*"/)) {
            issues.push(`Line ${lineNum}: Tab character in indentation`);
        }
    }
    
    return {
        corrupted: issues.length > 0,
        issues,
    };
}

// ============================================================================
// YAML Content Repair
// ============================================================================

/**
 * Attempt to repair corrupted YAML content.
 * Returns the repaired content or null if unrecoverable.
 */
export function repairYamlContent(content: string): {
    repaired: string | null;
    changes: string[];
    missingInfo: MissingInfo[];
} {
    const changes: string[] = [];
    const missingInfo: MissingInfo[] = [];
    let repaired = content;
    
    // 1. Convert tabs to spaces (YAML requires spaces)
    if (repaired.includes('\t')) {
        repaired = repaired.replace(/\t/g, '  ');
        changes.push('Converted tabs to spaces');
    }
    
    // 2. Normalize line endings
    if (repaired.includes('\r\n')) {
        repaired = repaired.replace(/\r\n/g, '\n');
        changes.push('Normalized line endings (CRLF→LF)');
    } else if (repaired.includes('\r')) {
        repaired = repaired.replace(/\r/g, '\n');
        changes.push('Normalized line endings (CR→LF)');
    }
    
    // 3. Fix unclosed quotes in key-value pairs
    const lines = repaired.split('\n');
    const fixedLines: string[] = [];
    
    for (let i = 0; i < lines.length; i++) {
        let line = lines[i];
        const lineNum = i + 1;
        
        // Pattern: key: "value with "embedded" quotes or unclosed
        const kvMatch = line.match(/^(\s*)([\w_-]+):\s*"(.*)$/);
        if (kvMatch) {
            const [, indent, key, rest] = kvMatch;
            
            // Check if the rest ends with a properly closed quote
            if (!rest.endsWith('"') || hasUnbalancedQuotes(rest)) {
                // Fix: escape internal quotes and ensure closure
                const fixedValue = rest
                    .replace(/"$/g, '')           // remove trailing quote if any
                    .replace(/(?<!\\)"/g, '\\"');  // escape unescaped internal quotes
                
                line = `${indent}${key}: "${fixedValue}"`;
                changes.push(`Line ${lineNum}: Fixed unclosed/mismatched quotes in '${key}'`);
            }
        }
        
        // Pattern: array item - "value with unclosed quotes
        const arrayMatch = line.match(/^(\s*-\s*)"(.*)$/);
        if (arrayMatch && !line.match(/^(\s*-\s*\w+:\s*)/)) {
            const [, prefix, rest] = arrayMatch;
            
            if (!rest.endsWith('"') || hasUnbalancedQuotes(rest)) {
                const fixedValue = rest
                    .replace(/"$/g, '')
                    .replace(/(?<!\\)"/g, '\\"');
                
                line = `${prefix}"${fixedValue}"`;
                changes.push(`Line ${lineNum}: Fixed unclosed quotes in array item`);
            }
        }
        
        // Pattern: array item key: "value with unclosed quotes
        const arrayKvMatch = line.match(/^(\s*-?\s*)([\w_-]+):\s*"(.*)$/);
        if (arrayKvMatch) {
            const [, indent, key, rest] = arrayKvMatch;
            if (!rest.endsWith('"') || hasUnbalancedQuotes(rest)) {
                const fixedValue = rest
                    .replace(/"$/g, '')
                    .replace(/(?<!\\)"/g, '\\"');
                
                line = `${indent}${key}: "${fixedValue}"`;
                changes.push(`Line ${lineNum}: Fixed unclosed quotes in '${key}'`);
            }
        }
        
        fixedLines.push(line);
    }
    
    repaired = fixedLines.join('\n');
    
    // 4. Validate the repaired content by attempting a parse
    try {
        // Dynamic import would be async, so we do a basic structural check
        if (!hasBasicYamlStructure(repaired)) {
            missingInfo.push({
                field: 'structure',
                description: 'YAML file appears to be severely corrupted or truncated',
            });
        }
    } catch {
        // ignore validation errors at this stage
    }
    
    if (changes.length === 0 && missingInfo.length > 0) {
        return { repaired: null, changes, missingInfo };
    }
    
    return { repaired, changes, missingInfo };
}

/**
 * Check if a string (after the opening quote) has unbalanced quotes.
 */
function hasUnbalancedQuotes(str: string): boolean {
    // Remove escaped quotes
    const cleaned = str.replace(/\\"/g, '');
    // Count remaining quotes (should be odd number since the opening was already stripped)
    const count = (cleaned.match(/"/g) || []).length;
    // After opening quote was stripped, remaining should have odd count
    // (one for closing). Even count means unbalanced.
    return count % 2 === 0;
}

/**
 * Basic structural validation for a Weave plan YAML.
 */
function hasBasicYamlStructure(content: string): boolean {
    return content.includes('project_name:') && content.includes('phases:');
}

// ============================================================================
// Safe File I/O
// ============================================================================

/**
 * Write a file atomically with backup.
 * 1. Copy existing file to .bak
 * 2. Write to .tmp
 * 3. Rename .tmp to target
 */
export function safeWriteFile(filePath: string, content: string): void {
    // Create backup of existing file
    if (fs.existsSync(filePath)) {
        try {
            fs.copyFileSync(filePath, `${filePath}.bak`);
        } catch {
            // Backup failed, continue anyway
        }
    }
    
    const tmpPath = `${filePath}.tmp`;
    try {
        fs.writeFileSync(tmpPath, content, 'utf-8');
        // Atomic rename
        try {
            fs.renameSync(tmpPath, filePath);
        } catch {
            // Windows fallback: rename can fail if target exists
            fs.writeFileSync(filePath, content, 'utf-8');
            try { fs.unlinkSync(tmpPath); } catch { /* ignore */ }
        }
    } catch (e) {
        // Last resort: direct write
        fs.writeFileSync(filePath, content, 'utf-8');
    }
}

/**
 * Safely read and parse a YAML file with auto-repair on failure.
 * Returns the parsed object, or an error message.
 */
export async function safeReadYaml(filePath: string): Promise<{
    data: any | null;
    repaired: boolean;
    error?: string;
    changes?: string[];
    missingInfo?: MissingInfo[];
}> {
    const { parse } = await import('yaml');
    
    // 1. Try normal read + parse
    try {
        const content = fs.readFileSync(filePath, 'utf-8');
        const data = parse(content);
        return { data, repaired: false };
    } catch (parseError) {
        const errorMsg = parseError instanceof Error ? parseError.message : String(parseError);
        
        // 2. Try auto-repair
        try {
            const rawContent = fs.readFileSync(filePath, 'utf-8');
            const repair = repairYamlContent(rawContent);
            
            if (repair.repaired) {
                try {
                    const data = parse(repair.repaired);
                    
                    // Save corrupted backup and write repaired content
                    try {
                        fs.copyFileSync(filePath, `${filePath}.corrupted`);
                    } catch { /* ignore backup failure */ }
                    
                    safeWriteFile(filePath, repair.repaired);
                    
                    console.log(`[PhaseManager] Auto-repaired ${path.basename(filePath)}: ${repair.changes.join(', ')}`);
                    
                    return {
                        data,
                        repaired: true,
                        changes: repair.changes,
                        missingInfo: repair.missingInfo.length > 0 ? repair.missingInfo : undefined,
                    };
                } catch (repairParseError) {
                    // Repair didn't fix the parse error
                }
            }
        } catch { /* repair attempt failed */ }
        
        // 3. Try .bak file
        const bakPath = `${filePath}.bak`;
        if (fs.existsSync(bakPath)) {
            try {
                const bakContent = fs.readFileSync(bakPath, 'utf-8');
                const data = parse(bakContent);
                
                // Save corrupted file and restore from backup
                try {
                    fs.copyFileSync(filePath, `${filePath}.corrupted`);
                } catch { /* ignore */ }
                
                fs.copyFileSync(bakPath, filePath);
                
                console.log(`[PhaseManager] Restored ${path.basename(filePath)} from backup`);
                
                return { data, repaired: true, changes: ['Restored from .bak backup'] };
            } catch { /* .bak also corrupted */ }
        }
        
        // 4. Unrecoverable
        return {
            data: null,
            repaired: false,
            error: `${path.basename(filePath)} is corrupted (no backup available). Error: ${errorMsg}`,
            missingInfo: [{
                field: 'entire_file',
                description: `The plan file is corrupted and cannot be auto-repaired. Original error: ${errorMsg}. You may need to recreate it with /weave design.`,
            }],
        };
    }
}

// ============================================================================
// Plan File Repair
// ============================================================================

/**
 * Repair a single plan YAML file.
 */
export async function repairPlanFile(filePath: string): Promise<RepairResult> {
    const fileName = path.basename(filePath);
    
    if (!fs.existsSync(filePath)) {
        return { file: fileName, status: 'unrecoverable', error: 'File not found' };
    }
    
    const result = await safeReadYaml(filePath);
    
    if (result.data && !result.repaired) {
        return { file: fileName, status: 'ok' };
    }
    
    if (result.data && result.repaired) {
        return {
            file: fileName,
            status: 'repaired',
            details: result.changes?.join(', '),
            missingInfo: result.missingInfo,
        };
    }
    
    return {
        file: fileName,
        status: 'unrecoverable',
        error: result.error,
        missingInfo: result.missingInfo,
    };
}

/**
 * Scan and repair all plan YAML files in the plans/ directory.
 */
export async function repairAllPlans(basePath: string = process.cwd()): Promise<{
    results: RepairResult[];
    summary: string;
}> {
    const weaveDir = path.join(basePath, '.opencode', 'weave');
    const plansDir = path.join(weaveDir, 'plans');
    const results: RepairResult[] = [];
    
    // Check legacy PLAN.yaml
    const legacyPath = path.join(weaveDir, 'PLAN.yaml');
    if (fs.existsSync(legacyPath)) {
        results.push(await repairPlanFile(legacyPath));
    }
    
    // Check state.yaml
    const statePath = path.join(weaveDir, 'state.yaml');
    if (fs.existsSync(statePath)) {
        results.push(await repairPlanFile(statePath));
    }
    
    // Scan plans/ directory
    if (fs.existsSync(plansDir)) {
        try {
            const files = fs.readdirSync(plansDir).filter(f => f.endsWith('.yaml'));
            for (const file of files) {
                const filePath = path.join(plansDir, file);
                results.push(await repairPlanFile(filePath));
            }
        } catch (e) {
            console.error('[YamlRepair] Failed to scan plans directory:', e);
        }
    }
    
    // Generate summary
    const ok = results.filter(r => r.status === 'ok').length;
    const repaired = results.filter(r => r.status === 'repaired').length;
    const unrecoverable = results.filter(r => r.status === 'unrecoverable').length;
    
    const lines: string[] = [];
    lines.push('## YAML Repair Report\n');
    
    if (results.length === 0) {
        lines.push('No plan files found.');
    } else {
        lines.push(`Scanned **${results.length}** file(s):\n`);
        lines.push(`- OK: ${ok}`);
        lines.push(`- Repaired: ${repaired}`);
        lines.push(`- Unrecoverable: ${unrecoverable}`);
        lines.push('');
        
        for (const r of results) {
            const icon = r.status === 'ok' ? 'OK' : r.status === 'repaired' ? 'FIXED' : 'FAIL';
            lines.push(`### [${icon}] ${r.file}`);
            if (r.details) lines.push(`  Changes: ${r.details}`);
            if (r.error) lines.push(`  Error: ${r.error}`);
            if (r.missingInfo && r.missingInfo.length > 0) {
                lines.push('  Missing info for full recovery:');
                for (const info of r.missingInfo) {
                    lines.push(`  - **${info.field}**: ${info.description}`);
                }
            }
            lines.push('');
        }
    }
    
    // Advice for unrecoverable files
    if (unrecoverable > 0) {
        lines.push('---');
        lines.push('### Recovery Options for Unrecoverable Files\n');
        lines.push('1. If you have the original requirements, run `/weave design` to recreate the plan');
        lines.push('2. Check if a `.corrupted` backup exists in the plans directory');
        lines.push('3. Provide the plan details manually and I can reconstruct the YAML');
    }
    
    return { results, summary: lines.join('\n') };
}

/**
 * Validate and sanitize plan structure after parsing.
 * Filters out invalid phases and ensures required fields exist.
 */
export function validatePlanStructure(raw: any): any {
    if (!raw || typeof raw !== 'object') return null;
    
    // Ensure required fields
    if (!raw.project_name && !raw.projectName) {
        raw.project_name = 'Unknown (recovered)';
    }
    
    // Filter invalid phases
    if (Array.isArray(raw.phases)) {
        raw.phases = raw.phases.filter((p: any) => {
            if (!p || typeof p !== 'object') return false;
            if (!p.id) return false;
            return true;
        });
        
        // Sanitize each phase
        for (const phase of raw.phases) {
            if (!phase.name) phase.name = phase.id;
            if (!phase.status) phase.status = 'pending';
            if (!phase.done_when && !phase.doneWhen) phase.done_when = '';
            if (!Array.isArray(phase.checklist)) phase.checklist = [];
            if (!Array.isArray(phase.tasks)) phase.tasks = [];
        }
    } else {
        raw.phases = [];
    }
    
    return raw;
}
