/**
 * Environment Detector
 * 
 * Proactive environment analysis for Weave workflow.
 * Detects OS, shell, runtime versions, and project tech stack.
 */

import * as os from 'node:os';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { execSync } from 'node:child_process';
import type { EnvironmentContext } from '../types.js';

// ============================================================================
// OS Detection
// ============================================================================

export function detectOS(): EnvironmentContext['os'] {
    const platform = os.platform();
    switch (platform) {
        case 'win32':
            return 'windows';
        case 'darwin':
            return 'macos';
        case 'linux':
            return 'linux';
        default:
            return 'linux'; // Default fallback
    }
}

// ============================================================================
// Shell Detection
// ============================================================================

export function detectShell(): EnvironmentContext['shell'] {
    const currentOS = detectOS();

    if (currentOS === 'windows') {
        // Check environment variables for shell hints
        const comspec = process.env.COMSPEC || '';
        const psModulePath = process.env.PSModulePath;
        const shellEnv = process.env.SHELL || '';

        // PowerShell detection
        if (psModulePath || process.env.PSExecutionPolicyPreference) {
            return 'powershell';
        }

        // Git Bash or WSL bash
        if (shellEnv.includes('bash')) {
            return 'bash';
        }

        // CMD fallback
        if (comspec.toLowerCase().includes('cmd.exe')) {
            return 'cmd';
        }

        return 'powershell'; // Default for Windows
    }

    // Unix-like systems
    const shell = process.env.SHELL || '';
    if (shell.includes('zsh')) {
        return 'zsh';
    }
    if (shell.includes('bash')) {
        return 'bash';
    }

    return 'bash'; // Default for Unix
}

// ============================================================================
// Runtime Version Detection
// ============================================================================

export function detectNodeVersion(): string {
    try {
        return process.version; // e.g., "v20.10.0"
    } catch {
        return 'unknown';
    }
}

export function detectBunVersion(): string | undefined {
    try {
        // Check if running in Bun
        if ((globalThis as any).Bun) {
            return (globalThis as any).Bun.version;
        }

        // Try to detect installed bun
        const output = execSync('bun --version', {
            encoding: 'utf-8',
            timeout: 5000,
            stdio: ['pipe', 'pipe', 'pipe'],
        }).trim();

        return output || undefined;
    } catch {
        return undefined;
    }
}

// ============================================================================
// Package Manager Detection
// ============================================================================

export function detectPackageManager(projectPath: string): EnvironmentContext['packageManager'] {
    // Check lockfiles (order matters - most specific first)
    const lockfiles = [
        { file: 'bun.lockb', manager: 'bun' as const },
        { file: 'pnpm-lock.yaml', manager: 'pnpm' as const },
        { file: 'yarn.lock', manager: 'yarn' as const },
        { file: 'package-lock.json', manager: 'npm' as const },
    ];

    for (const { file, manager } of lockfiles) {
        if (fs.existsSync(path.join(projectPath, file))) {
            return manager;
        }
    }

    // Check packageManager field in package.json
    try {
        const pkgPath = path.join(projectPath, 'package.json');
        if (fs.existsSync(pkgPath)) {
            const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
            if (pkg.packageManager) {
                const pm = pkg.packageManager.split('@')[0];
                if (['npm', 'pnpm', 'yarn', 'bun'].includes(pm)) {
                    return pm as EnvironmentContext['packageManager'];
                }
            }
        }
    } catch {
        // Ignore parse errors
    }

    return 'unknown';
}

// ============================================================================
// Tech Stack Detection
// ============================================================================

interface StackDetection {
    name: string;
    patterns: {
        dependencies?: string[];
        devDependencies?: string[];
        files?: string[];
    };
}

const STACK_DETECTIONS: StackDetection[] = [
    // Frameworks
    { name: 'Next.js', patterns: { dependencies: ['next'] } },
    { name: 'React', patterns: { dependencies: ['react'] } },
    { name: 'Vue', patterns: { dependencies: ['vue'] } },
    { name: 'Svelte', patterns: { dependencies: ['svelte'] } },
    { name: 'Angular', patterns: { dependencies: ['@angular/core'] } },
    { name: 'Astro', patterns: { dependencies: ['astro'] } },
    { name: 'Remix', patterns: { dependencies: ['@remix-run/react'] } },
    { name: 'Nuxt', patterns: { dependencies: ['nuxt'] } },

    // Runtime & Build
    { name: 'TypeScript', patterns: { devDependencies: ['typescript'] } },
    { name: 'Bun', patterns: { devDependencies: ['bun-types'], files: ['bun.lockb'] } },
    { name: 'Vite', patterns: { devDependencies: ['vite'] } },
    { name: 'Webpack', patterns: { devDependencies: ['webpack'] } },
    { name: 'ESBuild', patterns: { devDependencies: ['esbuild'] } },

    // Styling
    { name: 'Tailwind CSS', patterns: { devDependencies: ['tailwindcss'] } },
    { name: 'Sass', patterns: { devDependencies: ['sass'] } },
    { name: 'PostCSS', patterns: { devDependencies: ['postcss'] } },
    { name: 'Styled Components', patterns: { dependencies: ['styled-components'] } },

    // Database & ORM
    { name: 'Prisma', patterns: { devDependencies: ['prisma'], files: ['prisma/schema.prisma'] } },
    { name: 'Drizzle', patterns: { devDependencies: ['drizzle-kit'] } },
    { name: 'TypeORM', patterns: { dependencies: ['typeorm'] } },
    { name: 'Mongoose', patterns: { dependencies: ['mongoose'] } },
    { name: 'SQLite', patterns: { dependencies: ['better-sqlite3', 'sql.js'] } },

    // Backend
    { name: 'Express', patterns: { dependencies: ['express'] } },
    { name: 'Fastify', patterns: { dependencies: ['fastify'] } },
    { name: 'NestJS', patterns: { dependencies: ['@nestjs/core'] } },
    { name: 'Hono', patterns: { dependencies: ['hono'] } },

    // Testing
    { name: 'Jest', patterns: { devDependencies: ['jest'] } },
    { name: 'Vitest', patterns: { devDependencies: ['vitest'] } },
    { name: 'Playwright', patterns: { devDependencies: ['@playwright/test', 'playwright'] } },
    { name: 'Cypress', patterns: { devDependencies: ['cypress'] } },

    // Linting & Formatting
    { name: 'ESLint', patterns: { devDependencies: ['eslint'], files: ['.eslintrc.js', '.eslintrc.json', 'eslint.config.js'] } },
    { name: 'Prettier', patterns: { devDependencies: ['prettier'] } },
    { name: 'Biome', patterns: { devDependencies: ['@biomejs/biome'] } },

    // Auth & Services
    { name: 'Supabase', patterns: { dependencies: ['@supabase/supabase-js'] } },
    { name: 'Firebase', patterns: { dependencies: ['firebase'] } },
    { name: 'Clerk', patterns: { dependencies: ['@clerk/nextjs', '@clerk/clerk-react'] } },
    { name: 'NextAuth', patterns: { dependencies: ['next-auth'] } },
];

export function detectTechStack(projectPath: string): string[] {
    const detected: string[] = [];

    // Read package.json
    let pkg: {
        dependencies?: Record<string, string>;
        devDependencies?: Record<string, string>;
    } = {};

    try {
        const pkgPath = path.join(projectPath, 'package.json');
        if (fs.existsSync(pkgPath)) {
            pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
        }
    } catch {
        // Return empty if no package.json
        return detected;
    }

    const deps = pkg.dependencies || {};
    const devDeps = pkg.devDependencies || {};
    const allDeps = { ...deps, ...devDeps };

    for (const stack of STACK_DETECTIONS) {
        let found = false;

        // Check dependencies
        if (stack.patterns.dependencies) {
            for (const dep of stack.patterns.dependencies) {
                if (dep in deps || dep in allDeps) {
                    found = true;
                    break;
                }
            }
        }

        // Check devDependencies
        if (!found && stack.patterns.devDependencies) {
            for (const dep of stack.patterns.devDependencies) {
                if (dep in devDeps || dep in allDeps) {
                    found = true;
                    break;
                }
            }
        }

        // Check files
        if (!found && stack.patterns.files) {
            for (const file of stack.patterns.files) {
                if (fs.existsSync(path.join(projectPath, file))) {
                    found = true;
                    break;
                }
            }
        }

        if (found) {
            detected.push(stack.name);
        }
    }

    return detected;
}

// ============================================================================
// Main Detection Function
// ============================================================================

export interface DetectorOptions {
    projectPath?: string;
}

export function detectEnvironment(options: DetectorOptions = {}): EnvironmentContext {
    const projectPath = options.projectPath || process.cwd();

    return {
        os: detectOS(),
        shell: detectShell(),
        nodeVersion: detectNodeVersion(),
        bunVersion: detectBunVersion(),
        packageManager: detectPackageManager(projectPath),
        stack: detectTechStack(projectPath),
        cwd: projectPath,
    };
}
