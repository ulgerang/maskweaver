/**
 * Verification Command Recommendation
 *
 * Weave should not assume `npm run build/test` (web-centric). Instead, it
 * recommends build/test commands based on detected project tooling.
 *
 * This module is intentionally heuristic-based and conservative:
 * - Prefer project-defined scripts (package.json scripts)
 * - Fall back to common ecosystem defaults when evidence is strong
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

export type DetectedProjectType = 'node' | 'go' | 'rust' | 'python' | 'dotnet' | 'unknown';

export type VerificationStepName = 'GdcSync' | 'GdcCheck' | 'TypeCheck' | 'Lint' | 'Build' | 'UnitTests';

export interface VerificationCommandStep {
    name: VerificationStepName;
    cmd: string;
    /** If false, this step may be skipped in lenient mode. */
    required: boolean;
    /** Human-readable reason used for logs/debugging. */
    reason?: string;
}

export interface VerificationCommandRecommendation {
    detectedType: DetectedProjectType;
    evidence: string[];
    packageManager?: 'npm' | 'pnpm' | 'yarn' | 'bun';
    preflightSteps: VerificationCommandStep[];
    buildSteps: VerificationCommandStep[];
    testSteps: VerificationCommandStep[];
    notes: string[];
}

function exists(projectPath: string, rel: string): boolean {
    return fs.existsSync(path.join(projectPath, rel));
}

function safeReadText(filePath: string): string {
    try {
        return fs.readFileSync(filePath, 'utf-8');
    } catch {
        return '';
    }
}

function toLower(input?: string): string {
    return (input || '').toLowerCase().trim();
}

function detectFromHint(projectTypeHint?: string): DetectedProjectType {
    const hint = toLower(projectTypeHint);
    if (!hint) return 'unknown';
    if (hint.includes('go')) return 'go';
    if (hint.includes('rust')) return 'rust';
    if (hint.includes('python') || hint.includes('py')) return 'python';
    if (hint.includes('dotnet') || hint.includes('c#') || hint.includes('csharp')) return 'dotnet';
    if (hint.includes('node') || hint.includes('typescript') || hint.includes('javascript') || hint.includes('next')) return 'node';
    return 'unknown';
}

function detectProjectType(projectPath: string, projectTypeHint?: string): { type: DetectedProjectType; evidence: string[] } {
    const evidence: string[] = [];
    const hinted = detectFromHint(projectTypeHint);
    if (hinted !== 'unknown') {
        evidence.push(`hint:${projectTypeHint}`);
        return { type: hinted, evidence };
    }

    // Prefer strong ecosystem markers over package.json (monorepos often contain a package.json for tooling).
    if (exists(projectPath, 'go.mod')) {
        evidence.push('go.mod');
        return { type: 'go', evidence };
    }
    if (exists(projectPath, 'Cargo.toml')) {
        evidence.push('Cargo.toml');
        return { type: 'rust', evidence };
    }
    if (exists(projectPath, 'pyproject.toml') || exists(projectPath, 'requirements.txt') || exists(projectPath, 'setup.py')) {
        if (exists(projectPath, 'pyproject.toml')) evidence.push('pyproject.toml');
        if (exists(projectPath, 'requirements.txt')) evidence.push('requirements.txt');
        if (exists(projectPath, 'setup.py')) evidence.push('setup.py');
        return { type: 'python', evidence };
    }

    // .NET (top-level scan for typical files)
    try {
        const entries = fs.readdirSync(projectPath, { withFileTypes: true });
        const hasSln = entries.some(e => e.isFile() && e.name.toLowerCase().endsWith('.sln'));
        const hasProj = entries.some(e => e.isFile() && (e.name.toLowerCase().endsWith('.csproj') || e.name.toLowerCase().endsWith('.fsproj') || e.name.toLowerCase().endsWith('.vbproj')));
        if (hasSln || hasProj) {
            if (hasSln) evidence.push('*.sln');
            if (hasProj) evidence.push('*.*proj');
            return { type: 'dotnet', evidence };
        }
    } catch {
        // ignore
    }

    if (exists(projectPath, 'package.json')) {
        evidence.push('package.json');
        return { type: 'node', evidence };
    }

    return { type: 'unknown', evidence };
}

function detectPackageManager(projectPath: string): 'npm' | 'pnpm' | 'yarn' | 'bun' {
    if (exists(projectPath, 'pnpm-lock.yaml')) return 'pnpm';
    if (exists(projectPath, 'yarn.lock')) return 'yarn';
    if (exists(projectPath, 'bun.lockb') || exists(projectPath, 'bun.lock')) return 'bun';
    if (exists(projectPath, 'package-lock.json') || exists(projectPath, 'npm-shrinkwrap.json')) return 'npm';
    return 'npm';
}

function detectGdcRuntime(projectPath: string): {
    enabled: boolean;
    strictVerify: boolean;
    reason: string;
} {
    const hasGdcWorkspace = exists(projectPath, '.gdc')
        || exists(projectPath, path.join('.gdc', 'config.yaml'))
        || exists(projectPath, path.join('.gdc', 'nodes'));
    if (!hasGdcWorkspace) {
        return { enabled: false, strictVerify: false, reason: 'no .gdc workspace' };
    }

    const configCandidates = [
        path.join(projectPath, 'maskweaver.config.json'),
        path.join(projectPath, '.opencode', 'maskweaver.config.json'),
    ];

    let enabledMode: boolean | 'auto' | undefined;
    let strictVerify = false;

    for (const configPath of configCandidates) {
        if (!fs.existsSync(configPath)) continue;
        try {
            const config = JSON.parse(fs.readFileSync(configPath, 'utf-8')) as {
                gdc?: { enabled?: boolean | 'auto'; strictVerify?: boolean };
            };
            enabledMode = config.gdc?.enabled;
            strictVerify = config.gdc?.strictVerify ?? strictVerify;
            break;
        } catch {
            continue;
        }
    }

    const enabled = enabledMode === true || (enabledMode !== false && hasGdcWorkspace);
    const mode = enabledMode === undefined ? 'auto (implicit)' : String(enabledMode);
    return {
        enabled,
        strictVerify,
        reason: `workspace detected, mode=${mode}`,
    };
}

function pmRun(pm: 'npm' | 'pnpm' | 'yarn' | 'bun', script: string): string {
    switch (pm) {
        case 'pnpm': return `pnpm run ${script}`;
        case 'yarn': return `yarn run ${script}`;
        case 'bun': return `bun run ${script}`;
        default: return `npm run ${script}`;
    }
}

function isDefaultNpmInitTestScript(cmd: string): boolean {
    const s = cmd.toLowerCase();
    return s.includes('no test specified') && s.includes('exit 1');
}

function recommendNode(projectPath: string): { pm: 'npm' | 'pnpm' | 'yarn' | 'bun'; build: VerificationCommandStep[]; test: VerificationCommandStep[]; notes: string[] } {
    const notes: string[] = [];
    const pm = detectPackageManager(projectPath);
    const pkgPath = path.join(projectPath, 'package.json');

    let scripts: Record<string, string> = {};
    try {
        const raw = fs.readFileSync(pkgPath, 'utf-8');
        const pkg = JSON.parse(raw);
        scripts = (pkg && typeof pkg === 'object' ? pkg.scripts : {}) || {};
    } catch {
        notes.push('package.json could not be parsed; falling back to minimal Node recommendations');
    }

    const build: VerificationCommandStep[] = [];
    const test: VerificationCommandStep[] = [];

    // TypeCheck
    if (scripts.typecheck) {
        build.push({ name: 'TypeCheck', cmd: pmRun(pm, 'typecheck'), required: true, reason: 'package.json scripts.typecheck' });
    } else if (scripts.check) {
        build.push({ name: 'TypeCheck', cmd: pmRun(pm, 'check'), required: true, reason: 'package.json scripts.check' });
    }

    // Lint
    if (scripts.lint) {
        build.push({ name: 'Lint', cmd: pmRun(pm, 'lint'), required: true, reason: 'package.json scripts.lint' });
    }

    // Build
    if (scripts.build) {
        build.push({ name: 'Build', cmd: pmRun(pm, 'build'), required: true, reason: 'package.json scripts.build' });
    } else {
        // Many Node repos are runtime-only and have no build step.
        notes.push('No build script detected; skipping Build step recommendation');
    }

    // Unit tests
    if (scripts.test && !isDefaultNpmInitTestScript(String(scripts.test))) {
        test.push({ name: 'UnitTests', cmd: pmRun(pm, 'test'), required: true, reason: 'package.json scripts.test' });
    } else {
        notes.push('No meaningful test script detected; skipping UnitTests recommendation');
    }

    return { pm, build, test, notes };
}

function recommendGo(): { build: VerificationCommandStep[]; test: VerificationCommandStep[]; notes: string[] } {
    return {
        build: [
            { name: 'Build', cmd: 'go build ./...', required: true, reason: 'go.mod detected' },
            { name: 'Lint', cmd: 'go vet ./...', required: false, reason: 'go vet (built-in)' },
        ],
        test: [
            { name: 'UnitTests', cmd: 'go test ./...', required: true, reason: 'go test (built-in)' },
        ],
        notes: [],
    };
}

function recommendRust(): { build: VerificationCommandStep[]; test: VerificationCommandStep[]; notes: string[] } {
    return {
        build: [
            { name: 'TypeCheck', cmd: 'cargo check', required: true, reason: 'Cargo.toml detected' },
            { name: 'Build', cmd: 'cargo build', required: false, reason: 'cargo build (optional)' },
        ],
        test: [
            { name: 'UnitTests', cmd: 'cargo test', required: true, reason: 'cargo test' },
        ],
        notes: ['Optional: cargo clippy -- -D warnings'],
    };
}

function recommendDotnet(): { build: VerificationCommandStep[]; test: VerificationCommandStep[]; notes: string[] } {
    return {
        build: [
            { name: 'Build', cmd: 'dotnet build', required: true, reason: '.NET project detected' },
        ],
        test: [
            { name: 'UnitTests', cmd: 'dotnet test', required: true, reason: '.NET project detected' },
        ],
        notes: [],
    };
}

function recommendPython(projectPath: string): { build: VerificationCommandStep[]; test: VerificationCommandStep[]; notes: string[] } {
    const notes: string[] = [];

    const pyprojectPath = path.join(projectPath, 'pyproject.toml');
    const pyproject = exists(projectPath, 'pyproject.toml') ? safeReadText(pyprojectPath) : '';

    let prefix = '';
    if (exists(projectPath, 'poetry.lock') || pyproject.includes('[tool.poetry]')) {
        prefix = 'poetry run ';
        notes.push('Using poetry runner prefix');
    } else if (exists(projectPath, 'uv.lock') || pyproject.includes('[tool.uv]')) {
        prefix = 'uv run ';
        notes.push('Using uv runner prefix');
    } else if (exists(projectPath, 'Pipfile')) {
        prefix = 'pipenv run ';
        notes.push('Using pipenv runner prefix');
    }

    const hasRuff = exists(projectPath, 'ruff.toml')
        || exists(projectPath, '.ruff.toml')
        || pyproject.includes('[tool.ruff]')
        || pyproject.includes('ruff');
    const hasMypy = exists(projectPath, 'mypy.ini')
        || pyproject.includes('[tool.mypy]')
        || pyproject.includes('mypy');
    const hasPytest = exists(projectPath, 'pytest.ini')
        || exists(projectPath, 'tox.ini')
        || exists(projectPath, 'tests')
        || pyproject.includes('[tool.pytest.ini_options]')
        || pyproject.includes('pytest');

    const build: VerificationCommandStep[] = [];
    const test: VerificationCommandStep[] = [];

    if (hasMypy) {
        build.push({ name: 'TypeCheck', cmd: `${prefix}mypy .`.trim(), required: true, reason: 'mypy config detected' });
    }
    if (hasRuff) {
        build.push({ name: 'Lint', cmd: `${prefix}ruff check .`.trim(), required: true, reason: 'ruff config detected' });
    }

    // "Build" in Python is often packaging-specific; compileall is a safe baseline.
    build.push({ name: 'Build', cmd: `${prefix}python -m compileall .`.trim(), required: false, reason: 'python compileall baseline' });

    if (hasPytest) {
        test.push({ name: 'UnitTests', cmd: `${prefix}pytest`.trim(), required: true, reason: 'pytest config/tests detected' });
    } else {
        notes.push('No pytest signals detected; recommending unittest baseline');
        test.push({ name: 'UnitTests', cmd: `${prefix}python -m unittest`.trim(), required: true, reason: 'unittest baseline' });
    }

    return { build, test, notes };
}

export function recommendVerificationCommands(options: {
    projectPath: string;
    projectTypeHint?: string;
}): VerificationCommandRecommendation {
    const projectPath = path.resolve(options.projectPath);
    const detected = detectProjectType(projectPath, options.projectTypeHint);

    const notes: string[] = [];
    const preflightSteps: VerificationCommandStep[] = [];
    let buildSteps: VerificationCommandStep[] = [];
    let testSteps: VerificationCommandStep[] = [];
    let packageManager: VerificationCommandRecommendation['packageManager'];

    const gdcRuntime = detectGdcRuntime(projectPath);
    if (gdcRuntime.enabled) {
        preflightSteps.push(
            {
                name: 'GdcSync',
                cmd: 'gdc sync --machine',
                required: gdcRuntime.strictVerify,
                reason: `GDC pre-verify sync (${gdcRuntime.reason})`,
            },
            {
                name: 'GdcCheck',
                cmd: 'gdc check --machine',
                required: true,
                reason: `GDC pre-verify check (${gdcRuntime.strictVerify ? 'strict gate' : 'recommended'})`,
            },
        );
        notes.push(`GDC preflight enabled (${gdcRuntime.strictVerify ? 'strict' : 'lenient'} mode).`);
    }

    switch (detected.type) {
        case 'node': {
            const node = recommendNode(projectPath);
            buildSteps = node.build;
            testSteps = node.test;
            notes.push(...node.notes);
            packageManager = node.pm;
            break;
        }
        case 'go': {
            const go = recommendGo();
            buildSteps = go.build;
            testSteps = go.test;
            notes.push(...go.notes);
            break;
        }
        case 'rust': {
            const rust = recommendRust();
            buildSteps = rust.build;
            testSteps = rust.test;
            notes.push(...rust.notes);
            break;
        }
        case 'python': {
            const py = recommendPython(projectPath);
            buildSteps = py.build;
            testSteps = py.test;
            notes.push(...py.notes);
            break;
        }
        case 'dotnet': {
            const dn = recommendDotnet();
            buildSteps = dn.build;
            testSteps = dn.test;
            notes.push(...dn.notes);
            break;
        }
        default: {
            notes.push('No supported build system detected; provide custom verify commands manually');
            break;
        }
    }

    return {
        detectedType: detected.type,
        evidence: detected.evidence,
        packageManager,
        preflightSteps,
        buildSteps,
        testSteps,
        notes,
    };
}

export function formatRecommendedCommandsAsBash(rec: VerificationCommandRecommendation): string {
    const cmds: string[] = [];
    for (const s of rec.preflightSteps) cmds.push(s.cmd);
    for (const s of rec.buildSteps) cmds.push(s.cmd);
    for (const s of rec.testSteps) cmds.push(s.cmd);

    if (cmds.length === 0) {
        return '# (no recommended commands detected)';
    }
    return cmds.join('\n');
}
