/**
 * Gherkin/BDD Utilities for Weave
 *
 * Handles parsing, formatting, and generating Gherkin acceptance criteria
 * and .feature files throughout the weave workflow.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { mkdir, writeFile } from 'node:fs/promises';
import type { GherkinScenario, WeavePhase, WeaveTask } from './types.js';

// ============================================================================
// Gherkin Text Parsing
// ============================================================================

export interface ParsedFeature {
    feature: string;
    description: string;
    scenarios: ParsedScenario[];
}

export interface ParsedScenario {
    name: string;
    given: string[];
    when: string[];
    then: string[];
}

export function parseGherkinText(text: string): ParsedFeature | null {
    const lines = text.split(/\r?\n/).map(l => l.trim());
    let feature = '';
    let description = '';
    const scenarios: ParsedScenario[] = [];
    let current: ParsedScenario | null = null;
    let inFeature = false;

    for (const line of lines) {
        if (!line || line.startsWith('#')) continue;

        const featureMatch = /^Feature:\s*(.+)$/i.exec(line);
        if (featureMatch) {
            feature = featureMatch[1].trim();
            inFeature = true;
            current = null;
            continue;
        }

        if (!inFeature) continue;

        const scenarioMatch = /^Scenario:\s*(.+)$/i.exec(line);
        if (scenarioMatch) {
            if (current) scenarios.push(current);
            current = { name: scenarioMatch[1].trim(), given: [], when: [], then: [] };
            continue;
        }

        if (!current) {
            if (!scenarioMatch && feature && !line.startsWith('Given') && !line.startsWith('When') && !line.startsWith('Then') && !line.startsWith('And')) {
                description += (description ? ' ' : '') + line;
            }
            continue;
        }

        const stepMatch = /^(Given|When|Then|And)\s+(.+)$/i.exec(line);
        if (stepMatch) {
            const keyword = stepMatch[1].toLowerCase();
            const step = stepMatch[2].trim();
            switch (keyword) {
                case 'given':
                    current.given.push(step);
                    break;
                case 'when':
                    current.when.push(step);
                    break;
                case 'then':
                    current.then.push(step);
                    break;
                case 'and':
                    if (current.then.length > 0) current.then.push(step);
                    else if (current.when.length > 0) current.when.push(step);
                    else current.given.push(step);
                    break;
            }
        }
    }

    if (current) scenarios.push(current);

    if (!feature && scenarios.length === 0) return null;

    return { feature: feature || 'Untitled', description, scenarios };
}

export function parseGherkinBlock(block: string): GherkinScenario[] {
    const parsed = parseGherkinText(block);
    if (!parsed) return [];

    return parsed.scenarios.map(scenario => ({
        feature: parsed.feature,
        scenario: scenario.name,
        given: scenario.given,
        when: scenario.when,
        then: scenario.then,
    }));
}

// ============================================================================
// Gherkin Formatting
// ============================================================================

export function formatGherkinScenario(scenario: GherkinScenario): string {
    const lines: string[] = [];
    lines.push(`  Scenario: ${scenario.scenario}`);
    for (const g of scenario.given) lines.push(`    Given ${g}`);
    for (const w of scenario.when) lines.push(`    When ${w}`);
    for (const t of scenario.then) lines.push(`    Then ${t}`);
    return lines.join('\n');
}

export function formatGherkinFeature(featureName: string, scenarios: GherkinScenario[]): string {
    const lines: string[] = [];
    lines.push(`Feature: ${featureName}`);
    lines.push('');

    for (const scenario of scenarios) {
        lines.push(formatGherkinScenario(scenario));
        lines.push('');
    }

    return lines.join('\n');
}

export function formatGherkinForTask(task: WeaveTask): string {
    if (!task.acceptanceCriteria || task.acceptanceCriteria.length === 0) return '';
    return formatGherkinFeature(task.name, task.acceptanceCriteria);
}

export function formatGherkinChecklist(scenarios: GherkinScenario[]): string {
    const lines: string[] = [];
    for (const scenario of scenarios) {
        lines.push(`- [ ] ${scenario.scenario}`);
        for (const t of scenario.then) {
            lines.push(`    - Then ${t}`);
        }
    }
    return lines.join('\n');
}

// ============================================================================
// .feature File Generation
// ============================================================================

const FEATURES_DIR = '.opencode/weave/features';

function getFeaturesDir(basePath: string): string {
    return path.join(basePath, FEATURES_DIR);
}

export async function ensureFeaturesDir(basePath: string): Promise<string> {
    const dir = getFeaturesDir(basePath);
    await mkdir(dir, { recursive: true });
    return dir;
}

export async function writeFeatureFile(
    basePath: string,
    phaseId: string,
    phaseName: string,
    scenarios: GherkinScenario[],
): Promise<string> {
    if (scenarios.length === 0) return '';

    const dir = await ensureFeaturesDir(basePath);
    const fileName = `${phaseId.toLowerCase()}.feature`;
    const filePath = path.join(dir, fileName);

    const content = formatGherkinFeature(phaseName, scenarios);
    await writeFile(filePath, content, 'utf-8');

    return path.relative(basePath, filePath).replace(/\\/g, '/');
}

export async function writeAllFeatureFiles(
    basePath: string,
    phases: WeavePhase[],
): Promise<Map<string, string>> {
    const results = new Map<string, string>();

    for (const phase of phases) {
        const allScenarios = collectPhaseScenarios(phase);
        if (allScenarios.length === 0) continue;

        const featurePath = await writeFeatureFile(
            basePath,
            phase.id,
            phase.name,
            allScenarios,
        );
        if (featurePath) {
            results.set(phase.id, featurePath);
        }
    }

    return results;
}

function collectPhaseScenarios(phase: WeavePhase): GherkinScenario[] {
    const scenarios: GherkinScenario[] = [];

    if (phase.acceptanceCriteria) {
        scenarios.push(...phase.acceptanceCriteria);
    }

    for (const task of phase.tasks) {
        if (task.acceptanceCriteria) {
            scenarios.push(...task.acceptanceCriteria);
        }
    }

    return scenarios;
}

// ============================================================================
// Gherkin Generation from Phase/Task Metadata
// ============================================================================

export function generateGherkinForPhase(phase: { id: string; name: string; doneWhen: string }): GherkinScenario[] {
    return [
        {
            feature: phase.name,
            scenario: `${phase.name} - 정상 동작`,
            given: [`${phase.name} 관련 기능이 구현되어 있다`],
            when: [`유저가 ${phase.name} 기능을 사용한다`],
            then: [`${phase.doneWhen}`],
        },
        {
            feature: phase.name,
            scenario: `${phase.name} - 에러 처리`,
            given: [`${phase.name} 관련 기능이 구현되어 있다`],
            when: [`유저가 ${phase.name} 기능을 비정상적으로 사용한다`],
            then: ['적절한 에러 메시지가 표시된다'],
        },
    ];
}

export function generateGherkinForTask(
    task: { id: string; name: string; testCase?: string },
    phase: { id: string; name: string; doneWhen: string },
): GherkinScenario {
    return {
        feature: phase.name,
        scenario: task.name,
        given: [`${phase.name} 기능의 기본 환경이 준비되어 있다`],
        when: [`${task.name}을/를 실행한다`],
        then: [task.testCase || phase.doneWhen],
    };
}

// ============================================================================
// BDD Framework Detection
// ============================================================================

export interface BDDFrameworkInfo {
    detected: boolean;
    framework: 'cucumber' | 'jest-cucumber' | 'pytest-bdd' | 'behave' | 'unknown' | null;
    testCommand: string | null;
    featureDir: string | null;
}

export function detectBDDFramework(projectPath: string): BDDFrameworkInfo {
    const checks: Array<() => BDDFrameworkInfo> = [
        () => detectCucumber(projectPath),
        () => detectJestCucumber(projectPath),
        () => detectPytestBdd(projectPath),
    ];

    for (const check of checks) {
        const result = check();
        if (result.detected) return result;
    }

    const featureDir = findFeatureDir(projectPath);
    if (featureDir) {
        return {
            detected: true,
            framework: 'unknown',
            testCommand: null,
            featureDir,
        };
    }

    return { detected: false, framework: null, testCommand: null, featureDir: null };
}

function detectCucumber(projectPath: string): BDDFrameworkInfo {
    try {
        const pkgPath = path.join(projectPath, 'package.json');
        if (!fs.existsSync(pkgPath)) return { detected: false, framework: null, testCommand: null, featureDir: null };

        const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
        const deps = { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) };

        if (deps['@cucumber/cucumber']) {
            const featureDir = findFeatureDir(projectPath) || 'features';
            return {
                detected: true,
                framework: 'cucumber',
                testCommand: `npx cucumber-js`,
                featureDir,
            };
        }
    } catch { }

    return { detected: false, framework: null, testCommand: null, featureDir: null };
}

function detectJestCucumber(projectPath: string): BDDFrameworkInfo {
    try {
        const pkgPath = path.join(projectPath, 'package.json');
        if (!fs.existsSync(pkgPath)) return { detected: false, framework: null, testCommand: null, featureDir: null };

        const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
        const deps = { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) };

        if (deps['jest-cucumber'] || deps['@jest-cucumber/core']) {
            const featureDir = findFeatureDir(projectPath) || 'features';
            return {
                detected: true,
                framework: 'jest-cucumber',
                testCommand: `npx jest`,
                featureDir,
            };
        }
    } catch { }

    return { detected: false, framework: null, testCommand: null, featureDir: null };
}

function detectPytestBdd(projectPath: string): BDDFrameworkInfo {
    const indicators = [
        path.join(projectPath, 'pyproject.toml'),
        path.join(projectPath, 'requirements.txt'),
    ];

    for (const indicator of indicators) {
        if (!fs.existsSync(indicator)) continue;
        try {
            const content = fs.readFileSync(indicator, 'utf-8');
            if (content.includes('pytest-bdd')) {
                const featureDir = findFeatureDir(projectPath) || 'features';
                return {
                    detected: true,
                    framework: 'pytest-bdd',
                    testCommand: 'pytest',
                    featureDir,
                };
            }
        } catch { break; }
    }

    return { detected: false, framework: null, testCommand: null, featureDir: null };
}

function findFeatureDir(projectPath: string): string | null {
    const candidates = ['features', 'test/features', 'tests/features', 'specs/features'];
    for (const candidate of candidates) {
        if (fs.existsSync(path.join(projectPath, candidate))) {
            return candidate;
        }
    }
    return null;
}

// ============================================================================
// Gherkin Verification Checklist for AI
// ============================================================================

export function generateGherkinVerificationPrompt(
    phase: WeavePhase,
    task?: WeaveTask,
): string {
    const scenarios = task?.acceptanceCriteria || phase.acceptanceCriteria || [];
    if (scenarios.length === 0) return '';

    const lines: string[] = [];
    lines.push('### Acceptance Criteria (Gherkin)');
    lines.push('');
    lines.push('Verify each scenario is satisfied by the implementation:');
    lines.push('');

    for (const scenario of scenarios) {
        lines.push(`**${scenario.scenario}**`);
        for (const g of scenario.given) lines.push(`- Given: ${g}`);
        for (const w of scenario.when) lines.push(`- When: ${w}`);
        for (const t of scenario.then) lines.push(`- Then: ${t}`);
        lines.push('');
    }

    lines.push('For each scenario, check:');
    lines.push('1. Are all "Given" preconditions met?');
    lines.push('2. Can the "When" action be performed?');
    lines.push('3. Do all "Then" expected outcomes hold?');

    return lines.join('\n');
}
