import * as fs from 'node:fs';
import * as path from 'node:path';
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { stringify as stringifyYaml } from 'yaml';

import type { MapResult, StructuralIssue, CodebaseCluster } from '../types.js';
import {
    getEffectiveGdcConfig,
    runGdcMachineCommand,
    countGdcCheckIssues,
    getGraphNodeIds,
    getGraphEdges,
} from '../gdc.js';
import {
    getMapDir,
    getMapResultPath,
    getMapReportPath,
    getGraphifyReportPath,
} from '../change-artifacts.js';

export interface MapOptions {
    basePath?: string;
    onMessage?: (msg: string) => void;
    useGraphify?: boolean;
    /** If true, runs graphify-windows skill for deep knowledge graph analysis */
    deep?: boolean;
}

function log(messages: string[], msg: string): void {
    messages.push(msg);
}

async function analyzeDirectoryStructure(basePath: string): Promise<{
    projectType: string;
    techStack: string[];
}> {
    const files = await readdir(basePath, { withFileTypes: true });
    const topLevelNames = new Set<string>();

    for (const entry of files) {
        topLevelNames.add(entry.name);
    }

    const techStack: string[] = [];
    let projectType = 'unknown';

    if (topLevelNames.has('package.json')) projectType = 'node';
    if (topLevelNames.has('package.json') && topLevelNames.has('tsconfig.json')) projectType = 'typescript';
    if (topLevelNames.has('Cargo.toml')) { projectType = 'rust'; techStack.push('rust'); }
    if (topLevelNames.has('go.mod')) { projectType = 'go'; techStack.push('go'); }
    if (topLevelNames.has('pom.xml') || topLevelNames.has('build.gradle')) { projectType = 'java'; techStack.push('java'); }
    if (topLevelNames.has('requirements.txt') || topLevelNames.has('pyproject.toml')) { projectType = 'python'; techStack.push('python'); }

    if (fs.existsSync(path.join(basePath, 'package.json'))) {
        try {
            const pkg = JSON.parse(await readFile(path.join(basePath, 'package.json'), 'utf-8'));
            const deps = { ...pkg.dependencies, ...pkg.devDependencies };
            if (deps) {
                const allDeps = Object.keys(deps);
                if (allDeps.some(d => /^react(-|$)/i.test(d))) techStack.push('react');
                if (allDeps.some(d => /^next/i.test(d))) techStack.push('nextjs');
                if (allDeps.some(d => /^vue/i.test(d))) techStack.push('vue');
                if (allDeps.some(d => /^@?angular/i.test(d))) techStack.push('angular');
                if (allDeps.some(d => /^express/i.test(d))) techStack.push('express');
                if (allDeps.some(d => /^prisma/i.test(d))) techStack.push('prisma');
                if (allDeps.some(d => /^typeorm/i.test(d))) techStack.push('typeorm');
                if (allDeps.some(d => /^tailwindcss/i.test(d))) techStack.push('tailwind');
            }
        } catch { }
    }

    return { projectType, techStack };
}

async function runGdcGraph(basePath: string): Promise<{ nodes: string[]; edges: Array<{ from: string; to: string }> }> {
    const gdc = getEffectiveGdcConfig(basePath);
    if (!gdc.enabled) {
        return { nodes: [], edges: [] };
    }

    try {
        const result = await runGdcMachineCommand({
            basePath,
            command: 'graph',
            timeoutMs: 30_000,
            config: gdc,
        });

        if (result.exitCode !== 0) {
            return { nodes: [], edges: [] };
        }

        const nodes = getGraphNodeIds(result.data);
        const edges = getGraphEdges(result.data);
        return { nodes, edges };
    } catch {
        return { nodes: [], edges: [] };
    }
}

async function runGdcStats(basePath: string): Promise<{ total: number; implemented: number; tested: number }> {
    const gdc = getEffectiveGdcConfig(basePath);
    if (!gdc.enabled) return { total: 0, implemented: 0, tested: 0 };

    try {
        const result = await runGdcMachineCommand({
            basePath,
            command: 'stats',
            timeoutMs: 30_000,
            config: gdc,
        });

        if (result.exitCode !== 0) return { total: 0, implemented: 0, tested: 0 };

        const payload = result.data && typeof result.data === 'object' ? (result.data as Record<string, unknown>) : {};
        const nodes = payload.nodes && typeof payload.nodes === 'object' ? (payload.nodes as Record<string, unknown>) : {};
        const byStatus = nodes.byStatus && typeof nodes.byStatus === 'object' ? (nodes.byStatus as Record<string, unknown>) : {};

        return {
            total: typeof nodes.total === 'number' ? nodes.total : 0,
            implemented: typeof byStatus.implemented === 'number' ? byStatus.implemented : 0,
            tested: typeof byStatus.tested === 'number' ? byStatus.tested : 0,
        };
    } catch {
        return { total: 0, implemented: 0, tested: 0 };
    }
}

async function detectStructuralIssues(
    basePath: string,
    files: string[],
    edges: Array<{ from: string; to: string }>
): Promise<StructuralIssue[]> {
    const issues: StructuralIssue[] = [];
    const srcDir = path.join(basePath, 'src');
    if (!fs.existsSync(srcDir)) return issues;

    const srcFiles = await walkDir(srcDir, ['.ts', '.tsx', '.js', '.jsx']);

    const allDeps = new Map<string, Set<string>>();
    for (const file of srcFiles) {
        const content = await readFile(file, 'utf-8');
        const relativePath = path.relative(basePath, file).replace(/\\/g, '/');
        const imported = findImportPaths(content);

        const existing = allDeps.get(relativePath) || new Set();
        for (const imp of imported) existing.add(imp);
        allDeps.set(relativePath, existing);
    }

    const circularIssues = detectCircularDependencies(allDeps);
    for (const issue of circularIssues) {
        issues.push(issue);
    }

    if (issues.length === 0) {
        issues.push({
            area: 'project',
            severity: 'info',
            title: '구조적 문제 없음',
            description: '순환 의존성이나 명백한 레이어 위반이 감지되지 않았습니다.',
            suggestion: '현재 구조를 유지하세요.',
            affectedFiles: [],
        });
    }

    return issues;
}

function findImportPaths(content: string): string[] {
    const imports: string[] = [];
    const regex = /(?:import\s+(?:[\w*\s{},]*\s+from\s+)?['"]([^'"]+)['"]|require\(['"]([^'"]+)['"]\))/g;
    let match;
    while ((match = regex.exec(content)) !== null) {
        const p = match[1] || match[2];
        if (p && !p.startsWith('.')) continue;
        imports.push(p);
    }
    return imports;
}

function detectCircularDependencies(deps: Map<string, Set<string>>): StructuralIssue[] {
    const issues: StructuralIssue[] = [];
    const visited = new Set<string>();
    const inStack = new Set<string>();

    function dfs(node: string, path: string[]): string[] | null {
        if (inStack.has(node)) {
            const cycleStart = path.indexOf(node);
            if (cycleStart >= 0) return path.slice(cycleStart);
            return null;
        }
        if (visited.has(node)) return null;

        visited.add(node);
        inStack.add(node);
        path.push(node);

        const neighbors = deps.get(node);
        if (neighbors) {
            for (const neighbor of neighbors) {
                if (deps.has(neighbor) || neighbor.startsWith('.')) {
                    const resolved = resolveRelativePath(node, neighbor);
                    if (resolved && deps.has(resolved)) {
                        const result = dfs(resolved, [...path]);
                        if (result) return result;
                    }
                }
            }
        }

        inStack.delete(node);
        return null;
    }

    for (const entry of deps.keys()) {
        const cycle = dfs(entry, []);
        if (cycle && cycle.length >= 3) {
            issues.push({
                area: 'dependencies',
                severity: 'warning',
                title: `순환 의존성 감지: ${cycle.length}개 파일`,
                description: `순환 경로: ${cycle.join(' → ')}`,
                suggestion: '공통 의존성을 별도 모듈로 추출하고 방향을 단방향으로 정리하세요.',
                affectedFiles: cycle,
            });
        }
    }

    return issues;
}

function resolveRelativePath(fromFile: string, relativeImport: string): string | null {
    if (!relativeImport.startsWith('.')) return null;
    const dir = path.dirname(fromFile);
    const resolved = path.normalize(path.join(dir, relativeImport));
    return resolved.replace(/\\/g, '/');
}

async function walkDir(dir: string, extensions: string[]): Promise<string[]> {
    const results: string[] = [];
    if (!fs.existsSync(dir)) return results;

    const entries = await readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory() && !entry.name.startsWith('.')) {
            results.push(...await walkDir(full, extensions));
        } else if (entry.isFile()) {
            const ext = path.extname(entry.name).toLowerCase();
            if (extensions.includes(ext)) results.push(full);
        }
    }
    return results;
}

function buildClusters(edges: Array<{ from: string; to: string }>): CodebaseCluster[] {
    if (edges.length === 0) {
        return [{
            name: 'all',
            nodeCount: 0,
            description: 'GDC 의존성 그래프 없음',
            keyFiles: [],
            dependencies: [],
        }];
    }

    const adjacency = new Map<string, Set<string>>();
    for (const edge of edges) {
        if (!adjacency.has(edge.from)) adjacency.set(edge.from, new Set());
        adjacency.get(edge.from)!.add(edge.to);
        if (!adjacency.has(edge.to)) adjacency.set(edge.to, new Set());
    }

    const visited = new Set<string>();
    const clusters: CodebaseCluster[] = [];

    for (const node of adjacency.keys()) {
        if (visited.has(node)) continue;
        const cluster = new Set<string>();
        const queue = [node];
        while (queue.length > 0) {
            const current = queue.shift()!;
            if (visited.has(current)) continue;
            visited.add(current);
            cluster.add(current);
            for (const neighbor of adjacency.get(current) || []) {
                if (!visited.has(neighbor)) queue.push(neighbor);
            }
        }
        if (cluster.size > 1) {
            clusters.push({
                name: `cluster-${clusters.length + 1}`,
                nodeCount: cluster.size,
                description: `${cluster.size}개 GDC 노드 클러스터`,
                keyFiles: Array.from(cluster).slice(0, 10),
                dependencies: Array.from(cluster).slice(0, 10),
            });
        }
    }

    return clusters;
}

function generateMapReport(result: MapResult): string {
    const lines: string[] = [];
    lines.push('# 코드베이스 분석 리포트');
    lines.push('');
    lines.push(`- 생성: ${result.generatedAt}`);
    lines.push(`- 프로젝트 타입: ${result.projectType}`);
    lines.push(`- 기술 스택: ${result.techStack.join(', ') || '알 수 없음'}`);
    lines.push(`- GDC: ${result.gdcDetected ? '활성' : '비활성'}`);
    lines.push('');

    lines.push('## 의존성 그래프');
    lines.push('');
    lines.push(`- 노드: ${result.dependencyGraph.nodes}`);
    lines.push(`- 엣지: ${result.dependencyGraph.edges}`);
    lines.push(`- 클러스터: ${result.dependencyGraph.clusters.length}개`);
    lines.push('');

    if (result.dependencyGraph.clusters.length > 0) {
        lines.push('### 클러스터');
        lines.push('');
        for (const cluster of result.dependencyGraph.clusters) {
            lines.push(`- **${cluster.name}**: ${cluster.description}`);
            if (cluster.keyFiles.length > 0) {
                lines.push(`  - 주요 파일: ${cluster.keyFiles.join(', ')}`);
            }
        }
        lines.push('');
    }

    lines.push('## 구조적 이슈');
    lines.push('');
    if (result.structuralIssues.length === 0) {
        lines.push('감지된 이슈 없음');
    } else {
        for (const issue of result.structuralIssues) {
            const icon = issue.severity === 'critical' ? '🔴' : issue.severity === 'warning' ? '🟡' : '🔵';
            lines.push(`- ${icon} **[${issue.severity}]** ${issue.title}`);
            lines.push(`  - 영역: ${issue.area}`);
            lines.push(`  - 설명: ${issue.description}`);
            lines.push(`  - 제안: ${issue.suggestion}`);
            if (issue.affectedFiles.length > 0) {
                lines.push(`  - 영향 파일: ${issue.affectedFiles.join(', ')}`);
            }
        }
    }
    lines.push('');

    if (result.reuseCandidates.length > 0) {
        lines.push('## 재사용 가능한 코드');
        lines.push('');
        for (const candidate of result.reuseCandidates) {
            lines.push(`- **${candidate.filePath}** (점수: ${candidate.score})`);
            if (candidate.snippet) lines.push(`  - \`${candidate.snippet}\``);
        }
        lines.push('');
    }

    return lines.join('\n');
}

export async function analyzeCodebase(options: MapOptions): Promise<MapResult> {
    const basePath = options.basePath || process.cwd();
    const messages: string[] = [];
    const onMsg = options.onMessage || ((msg: string) => { });

    log(messages, '코드베이스 분석 시작...');
    onMsg('Starting codebase analysis...');

    const mapDir = getMapDir(basePath);
    await mkdir(mapDir, { recursive: true });

    const { projectType, techStack } = await analyzeDirectoryStructure(basePath);
    log(messages, `  프로젝트 타입: ${projectType}`);
    log(messages, `  기술 스택: ${techStack.join(', ')}`);
    onMsg(`Project type: ${projectType}`);

    const gdc = getEffectiveGdcConfig(basePath);
    const gdcDetected = gdc.enabled && gdc.detected;

    let gdcNodes: string[] = [];
    let gdcEdges: Array<{ from: string; to: string }> = [];

    if (gdcDetected) {
        log(messages, 'GDC 그래프 조회 중...');
        onMsg('Querying GDC dependency graph...');
        const graph = await runGdcGraph(basePath);
        gdcNodes = graph.nodes;
        gdcEdges = graph.edges;

        const stats = await runGdcStats(basePath);
        log(messages, `  노드: ${stats.total}, 구현됨: ${stats.implemented}, 테스트됨: ${stats.tested}`);
        onMsg(`GDC: ${stats.total} nodes, ${stats.implemented} implemented`);
    } else {
        log(messages, '  GDC 비활성 — 의존성 그래프 생략');
        onMsg('GDC not enabled, skipping dependency graph');
    }

    log(messages, '구조적 이슈 감지 중...');
    onMsg('Detecting structural issues...');
    const structuralIssues = await detectStructuralIssues(basePath, [], gdcEdges);
    log(messages, `  감지된 이슈: ${structuralIssues.length}개`);

    const clusters = buildClusters(gdcEdges);

    const result: MapResult = {
        mapPath: getMapReportPath(basePath),
        generatedAt: new Date().toISOString(),
        projectType,
        techStack,
        gdcDetected,
        dependencyGraph: {
            nodes: gdcNodes.length,
            edges: gdcEdges.length,
            clusters,
        },
        structuralIssues,
        reuseCandidates: [],
        summary: [
            `프로젝트 타입: ${projectType}`,
            `기술 스택: ${techStack.join(', ') || '감지 안 됨'}`,
            `GDC: ${gdcDetected ? `활성 (${gdcNodes.length} 노드, ${gdcEdges.length} 엣지)` : '비활성'}`,
            `구조적 이슈: ${structuralIssues.length}개`,
        ].join(' | '),
    };

    const resultYaml = stringifyYaml({
        generated_at: result.generatedAt,
        project_type: result.projectType,
        tech_stack: result.techStack,
        gdc_detected: result.gdcDetected,
        dependency_graph: {
            nodes: result.dependencyGraph.nodes,
            edges: result.dependencyGraph.edges,
            cluster_count: result.dependencyGraph.clusters.length,
        },
        structural_issues: result.structuralIssues.map(i => ({
            area: i.area,
            severity: i.severity,
            title: i.title,
        })),
        summary: result.summary,
    });
    await writeFile(getMapResultPath(basePath), resultYaml, 'utf-8');

    const reportMd = generateMapReport(result);
    await writeFile(getMapReportPath(basePath), reportMd, 'utf-8');

    log(messages, '완료');
    onMsg('Codebase analysis complete');

    return result;
}

export async function runGraphifyAnalysis(basePath: string): Promise<string | null> {
    const mapDir = getMapDir(basePath);
    await mkdir(mapDir, { recursive: true });

    try {
        const reportPath = getGraphifyReportPath(basePath);
        const { execFile } = await import('node:child_process');
        const { promisify } = await import('node:util');
        const execAsync = promisify(execFile);

        await execAsync('npx', [
            '--yes', 'graphify-windows',
            '--input', basePath,
            '--output', mapDir,
            '--format', 'html',
        ], { timeout: 120_000, windowsHide: true });

        if (fs.existsSync(reportPath)) {
            return reportPath;
        }
        return null;
    } catch {
        return null;
    }
}

export async function readMapResult(basePath: string): Promise<MapResult | null> {
    const resultPath = getMapResultPath(basePath);
    if (!fs.existsSync(resultPath)) return null;

    try {
        const { parse } = await import('yaml');
        const raw = await readFile(resultPath, 'utf-8');
        const parsed = parse(raw);
        if (!parsed) return null;

        return {
            mapPath: getMapReportPath(basePath),
            generatedAt: parsed.generated_at || '',
            projectType: parsed.project_type || 'unknown',
            techStack: parsed.tech_stack || [],
            gdcDetected: parsed.gdc_detected === true,
            dependencyGraph: {
                nodes: parsed.dependency_graph?.nodes || 0,
                edges: parsed.dependency_graph?.edges || 0,
                clusters: [],
            },
            structuralIssues: (parsed.structural_issues || []).map((i: any) => ({
                area: i.area || '',
                severity: i.severity || 'info',
                title: i.title || '',
                description: i.description || '',
                suggestion: i.suggestion || '',
                affectedFiles: i.affected_files || [],
            })),
            reuseCandidates: [],
            summary: parsed.summary || '',
        };
    } catch {
        return null;
    }
}

export async function lightReMap(basePath: string): Promise<void> {
    const existing = await readMapResult(basePath);
    if (!existing) return;

    const gdc = getEffectiveGdcConfig(basePath);
    if (!gdc.enabled) return;

    try {
        const graph = await runGdcGraph(basePath);
        const clusters = buildClusters(graph.edges);

        existing.dependencyGraph.nodes = graph.nodes.length;
        existing.dependencyGraph.edges = graph.edges.length;
        existing.dependencyGraph.clusters = clusters;
        existing.generatedAt = new Date().toISOString();

        const resultYaml = stringifyYaml({
            generated_at: existing.generatedAt,
            project_type: existing.projectType,
            tech_stack: existing.techStack,
            gdc_detected: existing.gdcDetected,
            dependency_graph: {
                nodes: existing.dependencyGraph.nodes,
                edges: existing.dependencyGraph.edges,
                cluster_count: existing.dependencyGraph.clusters.length,
            },
            structural_issues: existing.structuralIssues.map(i => ({
                area: i.area,
                severity: i.severity,
                title: i.title,
                description: i.description,
                suggestion: i.suggestion,
                affected_files: i.affectedFiles,
            })),
            summary: existing.summary,
        });
        await writeFile(getMapResultPath(basePath), resultYaml, 'utf-8');
    } catch { }
}
