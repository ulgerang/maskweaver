/**
 * Weave Spec Stage
 *
 * Converts intake analysis into a structured spec file.
 *
 * NOTE:
 * - This is intentionally conservative and heuristic-based.
 * - The goal is to produce a usable baseline spec (requirements + ACs)
 *   that can be refined later.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { stringify } from 'yaml';

import type { IntakeResult } from './intake.js';
import { safeWriteFile } from '../yaml-repair.js';

// ============================================================================
// Types
// ============================================================================

export type RequirementCategory = 'functional' | 'constraint' | 'performance' | 'ux';
export type RequirementPriority = 'must' | 'should' | 'could' | 'wont';
export type AcceptanceType = 'e2e' | 'integration' | 'script' | 'performance' | 'manual';

export interface WeaveSpec {
    spec_name: string;
    project_name: string;
    created_at: string;
    source_docs: string[];
    requirements: Array<{
        id: string;
        description: string;
        category: RequirementCategory;
        priority: RequirementPriority;
        acceptance: Array<{
            id: string;
            scenario: string;
            type: AcceptanceType;
        }>;
    }>;
}

export interface SpecOptions {
    intake: IntakeResult;
    projectName: string;
    /** Spec name (kebab-case). Defaults to "weave-spec". */
    specName?: string;
    /** Base path for .opencode/weave (defaults to process.cwd()). */
    basePath?: string;
}

export interface SpecResult {
    spec: WeaveSpec;
    specPath: string;
    summary: string;
}

// ============================================================================
// Helpers
// ============================================================================

const WEAVE_DIR = path.join('.opencode', 'weave');

function toKebabCase(input: string): string {
    return input
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');
}

function today(): string {
    return new Date().toISOString().slice(0, 10);
}

function ensureDirSync(dirPath: string): void {
    if (!fs.existsSync(dirPath)) {
        fs.mkdirSync(dirPath, { recursive: true });
    }
}

function detectCategory(text: string): RequirementCategory {
    const lower = text.toLowerCase();

    if (/performance|latency|benchmark|lighthouse|ms\b|\bsec\b|\bseconds?\b|\d+\s*ms|\d+\s*s/.test(lower)
        || /성능|빠르|로딩|지연|ms|초\s*이내/.test(text)) {
        return 'performance';
    }

    if (/ux|usability|a11y|accessibility|responsive|mobile/.test(lower)
        || /사용성|접근성|반응형|모바일/.test(text)) {
        return 'ux';
    }

    if (/must not|should not|no\s+|privacy|security|constraint|forbid/.test(lower)
        || /하지\s*않|금지|제약|보안|개인정보/.test(text)) {
        return 'constraint';
    }

    return 'functional';
}

function defaultAcceptanceType(category: RequirementCategory): AcceptanceType {
    switch (category) {
        case 'performance': return 'performance';
        case 'constraint': return 'manual';
        case 'ux': return 'manual';
        default: return 'e2e';
    }
}

function defaultScenario(desc: string, category: RequirementCategory): string {
    // Keep the scenario concise; downstream plan/craft can refine.
    switch (category) {
        case 'performance':
            return `${desc} (성능 기준을 만족한다)`;
        case 'constraint':
            return `${desc} (제약이 지켜진다)`;
        case 'ux':
            return `${desc} (사용자가 문제 없이 사용할 수 있다)`;
        default:
            return `${desc} (정상 동작)`;
    }
}

function assignPriority(index: number): RequirementPriority {
    if (index < 3) return 'must';
    if (index < 5) return 'should';
    return 'could';
}

function formatSpecSummary(spec: WeaveSpec, specPath: string): string {
    const totalReq = spec.requirements.length;
    const totalAC = spec.requirements.reduce((sum, r) => sum + (r.acceptance?.length || 0), 0);
    const byType = new Map<AcceptanceType, number>();

    for (const r of spec.requirements) {
        for (const ac of r.acceptance) {
            byType.set(ac.type, (byType.get(ac.type) || 0) + 1);
        }
    }

    const typeLine = Array.from(byType.entries())
        .sort((a, b) => b[1] - a[1])
        .map(([t, c]) => `${t} ${c}`)
        .join(', ');

    return [
        '## 요구사항 명세가 생성되었습니다',
        '',
        `- 파일: \`${specPath}\``,
        `- 요구사항: ${totalReq}개`,
        `- 검증 기준: ${totalAC}개${typeLine ? ` (${typeLine})` : ''}`,
    ].join('\n');
}

// ============================================================================
// Main
// ============================================================================

export async function spec(options: SpecOptions): Promise<SpecResult> {
    const basePath = options.basePath || process.cwd();
    const specsDir = path.join(basePath, WEAVE_DIR, 'specs');
    ensureDirSync(specsDir);

    const specName = toKebabCase(options.specName || '') || 'weave-spec';
    const specPath = path.join(specsDir, `${specName}.yaml`);

    const features = (options.intake.features || [])
        .map(f => f.trim())
        .filter(f => f.length > 0)
        .slice(0, 20);

    const sourceDocs = (options.intake.documents || [])
        .map(d => d.path)
        .filter(Boolean);

    const requirements = features.length > 0
        ? features
        : ['요구사항을 문서에서 자동 추출하지 못했습니다. 수동으로 추가가 필요합니다.'];

    const specData: WeaveSpec = {
        spec_name: specName,
        project_name: options.projectName,
        created_at: today(),
        source_docs: sourceDocs,
        requirements: requirements.map((desc, i) => {
            const category = detectCategory(desc);
            const priority = assignPriority(i);
            const type = defaultAcceptanceType(category);

            return {
                id: `R${i + 1}`,
                description: desc,
                category,
                priority,
                acceptance: [
                    {
                        id: `AC-R${i + 1}-1`,
                        scenario: defaultScenario(desc, category),
                        type,
                    },
                ],
            };
        }),
    };

    const yamlContent = stringify(specData);
    safeWriteFile(specPath, yamlContent);

    return {
        spec: specData,
        specPath,
        summary: formatSpecSummary(specData, specPath),
    };
}
