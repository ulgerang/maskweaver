/**
 * Secret Scan (Best-effort)
 *
 * This is a lightweight pre-commit guard. It is not a full DLP solution.
 *
 * Design goals:
 * - Scan only the files we are about to commit (staged list)
 * - Avoid dumping secrets in logs; always mask
 * - Keep false-positives low by using strong signatures
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { parse as parseYaml } from 'yaml';

export type SecretKind =
    | 'private_key'
    | 'aws_access_key_id'
    | 'github_token'
    | 'google_api_key'
    | 'openai_api_key'
    | 'slack_token'
    | 'generic_password';

export type SecretSeverity = 'high' | 'medium';

export interface SecretFinding {
    kind: SecretKind;
    severity: SecretSeverity;
    file: string; // repo-relative path if possible
    line: number; // 1-based
    matchMasked: string;
    preview: string; // masked line preview
}

interface Pattern {
    kind: SecretKind;
    regex: RegExp;
    severity: SecretSeverity;
}

// Prefer strong signatures.
const PATTERNS: Pattern[] = [
    {
        kind: 'private_key',
        regex: /-----BEGIN (?:RSA |EC |OPENSSH |)PRIVATE KEY-----/,
        severity: 'high',
    },
    {
        kind: 'aws_access_key_id',
        regex: /\bAKIA[0-9A-Z]{16}\b/,
        severity: 'high',
    },
    {
        kind: 'github_token',
        regex: /\bghp_[A-Za-z0-9]{36}\b/,
        severity: 'high',
    },
    {
        kind: 'google_api_key',
        regex: /\bAIza[0-9A-Za-z\-_]{35}\b/,
        severity: 'high',
    },
    {
        kind: 'openai_api_key',
        regex: /\bsk-[A-Za-z0-9]{20,}\b/,
        severity: 'high',
    },
    {
        kind: 'slack_token',
        regex: /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/,
        severity: 'high',
    },
    // Lower confidence: password-like assignments.
    // Keep strict: require key name + quotes.
    {
        kind: 'generic_password',
        regex: /\b(?:password|passwd|pwd)\b\s*[:=]\s*['"][^'"]{8,}['"]/i,
        severity: 'medium',
    },
];

export interface SecretScanConfig {
    version: 1;
    ignore?: {
        /** Glob-like patterns (/, *, ** supported). */
        paths?: string[];
        /** Ignore specific kinds entirely. */
        kinds?: SecretKind[];
    };
    allow?: {
        /** Allowed matches by substring or `re:<regex>` */
        matches?: string[];
    };
    mode?: {
        /** Which severities should block a commit. Default: ['high'] */
        blockSeverities?: SecretSeverity[];
    };
}

const DEFAULT_CONFIG: SecretScanConfig = {
    version: 1,
    ignore: {
        paths: [
            'node_modules/**',
            'dist/**',
            '.git/**',
            '.opencode/**',
            '.worktrees/**',
            '.next/**',
            'target/**',
            'vendor/**',
        ],
        kinds: [],
    },
    allow: {
        matches: [],
    },
    mode: {
        blockSeverities: ['high'],
    },
};

function normalizePath(input: string): string {
    return input.replace(/\\/g, '/');
}

function escapeRegexChar(ch: string): string {
    return /[\\^$.*+?()[\]{}|]/.test(ch) ? `\\${ch}` : ch;
}

function globToRegExp(glob: string): RegExp {
    const g = normalizePath(glob).trim();
    let out = '^';
    for (let i = 0; i < g.length; i++) {
        const ch = g[i];
        const next = g[i + 1];
        if (ch === '*' && next === '*') {
            out += '.*';
            i++;
            continue;
        }
        if (ch === '*') {
            out += '[^/]*';
            continue;
        }
        if (ch === '?') {
            out += '[^/]';
            continue;
        }
        out += escapeRegexChar(ch);
    }
    out += '$';
    return new RegExp(out);
}

function matchesAnyGlob(globs: string[] | undefined, filePath: string): boolean {
    if (!globs || globs.length === 0) return false;
    const p = normalizePath(filePath);
    for (const g of globs) {
        if (!g || !g.trim()) continue;
        try {
            if (globToRegExp(g).test(p)) return true;
        } catch {
            // ignore invalid glob
        }
    }
    return false;
}

function matchAllowed(allowList: string[] | undefined, match: string): boolean {
    if (!allowList || allowList.length === 0) return false;
    for (const rule of allowList) {
        const r = (rule || '').trim();
        if (!r) continue;
        if (r.startsWith('re:')) {
            try {
                const re = new RegExp(r.slice(3));
                if (re.test(match)) return true;
            } catch {
                continue;
            }
        } else {
            if (match.includes(r)) return true;
        }
    }
    return false;
}

export function loadSecretScanConfig(projectPath: string): SecretScanConfig {
    const base = path.resolve(projectPath);
    const candidates = [
        path.join(base, '.opencode', 'weave', 'secret-scan.yaml'),
        path.join(base, '.opencode', 'weave', 'secret-scan.yml'),
    ];

    for (const p of candidates) {
        if (!fs.existsSync(p)) continue;
        try {
            const raw = fs.readFileSync(p, 'utf-8');
            const parsed = parseYaml(raw);
            if (!parsed || typeof parsed !== 'object') break;

            const cfg = parsed as Partial<SecretScanConfig>;
            return {
                version: 1,
                ignore: {
                    paths: cfg.ignore?.paths || DEFAULT_CONFIG.ignore?.paths,
                    kinds: cfg.ignore?.kinds || DEFAULT_CONFIG.ignore?.kinds,
                },
                allow: {
                    matches: cfg.allow?.matches || DEFAULT_CONFIG.allow?.matches,
                },
                mode: {
                    blockSeverities: cfg.mode?.blockSeverities || DEFAULT_CONFIG.mode?.blockSeverities,
                },
            };
        } catch {
            break;
        }
    }

    return DEFAULT_CONFIG;
}

function isProbablyBinary(buf: Buffer): boolean {
    const max = Math.min(buf.length, 8000);
    let nonPrintable = 0;
    for (let i = 0; i < max; i++) {
        const b = buf[i];
        // NUL
        if (b === 0) return true;
        // allow tabs/newlines/cr
        if (b === 9 || b === 10 || b === 13) continue;
        // printable ASCII range
        if (b >= 32 && b <= 126) continue;
        nonPrintable++;
    }
    return (nonPrintable / max) > 0.3;
}

function maskValue(value: string): string {
    const v = value.trim();
    if (v.length <= 8) return '***';
    return `${v.slice(0, 4)}...${v.slice(-4)}`;
}

function maskLine(line: string, match: string): string {
    const masked = maskValue(match);
    // Replace only first occurrence to keep context
    return line.replace(match, masked);
}

export function scanFilesForSecrets(options: {
    projectPath: string;
    files: string[]; // repo-relative paths
    maxBytesPerFile?: number;
    config?: SecretScanConfig;
}): SecretFinding[] {
    const projectPath = path.resolve(options.projectPath);
    const maxBytesPerFile = options.maxBytesPerFile ?? 1_000_000;
    const config = options.config || loadSecretScanConfig(projectPath);

    const findings: SecretFinding[] = [];

    for (const rel of options.files) {
        if (!rel) continue;

        const norm = normalizePath(rel);
        if (matchesAnyGlob(config.ignore?.paths, norm)) continue;

        const abs = path.join(projectPath, rel);
        let stat: fs.Stats;
        try {
            stat = fs.statSync(abs);
        } catch {
            continue;
        }

        if (!stat.isFile()) continue;
        if (stat.size > maxBytesPerFile) continue;

        let buf: Buffer;
        try {
            buf = fs.readFileSync(abs);
        } catch {
            continue;
        }

        if (isProbablyBinary(buf)) continue;

        const text = buf.toString('utf-8');
        const lines = text.split(/\r?\n/);

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            if (!line) continue;

            for (const p of PATTERNS) {
                if (config.ignore?.kinds?.includes(p.kind)) continue;

                const m = line.match(p.regex);
                if (!m) continue;

                const rawMatch = m[0];
                if (matchAllowed(config.allow?.matches, rawMatch)) continue;

                findings.push({
                    kind: p.kind,
                    severity: p.severity,
                    file: rel,
                    line: i + 1,
                    matchMasked: maskValue(rawMatch),
                    preview: maskLine(line, rawMatch).slice(0, 300),
                });

                // Only one finding per pattern per line.
                break;
            }
        }
    }

    return findings;
}

export function shouldBlockOnFindings(findings: SecretFinding[], config: SecretScanConfig): boolean {
    const block = new Set<SecretSeverity>(config.mode?.blockSeverities || ['high']);
    return findings.some(f => block.has(f.severity));
}

export function formatSecretScanReport(findings: SecretFinding[]): string {
    if (findings.length === 0) {
        return '✅ Secret scan: no suspicious secrets detected.';
    }

    const high = findings.filter(f => f.severity === 'high');
    const medium = findings.filter(f => f.severity === 'medium');

    const lines: string[] = [];
    lines.push('⚠️ Secret scan findings');
    lines.push('');
    if (high.length > 0) lines.push(`- High: ${high.length}`);
    if (medium.length > 0) lines.push(`- Medium: ${medium.length}`);
    lines.push('');

    for (const f of findings.slice(0, 20)) {
        lines.push(`- [${f.severity}] ${f.kind}: ${f.file}:${f.line} (${f.matchMasked})`);
        lines.push(`  ${f.preview}`);
    }

    if (findings.length > 20) {
        lines.push('');
        lines.push(`…and ${findings.length - 20} more finding(s)`);
    }

    lines.push('');
    lines.push('Fix: remove the secret, move it to environment variables, or add an allow/ignore rule in `.opencode/weave/secret-scan.yaml`.');

    return lines.join('\n');
}
