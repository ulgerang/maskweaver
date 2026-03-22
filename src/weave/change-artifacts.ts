import * as fs from 'node:fs';
import * as path from 'node:path';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';

import type { WeaveChangeMetadata } from './types.js';

const CHANGE_FILES = {
    proposalPath: 'proposal.md',
    designPath: 'design.md',
    tasksPath: 'tasks.md',
    verifyPath: 'verify.md',
    archivePath: 'archive.md',
} as const;

type ChangeFileKey = keyof typeof CHANGE_FILES;

export function getChangesDir(basePath: string): string {
    return path.join(basePath, '.opencode', 'weave', 'changes');
}

export function getChangeArtifactDir(basePath: string, changeId: string): string {
    return path.join(getChangesDir(basePath), changeId);
}

export function toChangeArtifactPath(changeId: string, filename: string): string {
    return path.posix.join('.opencode', 'weave', 'changes', changeId, filename);
}

export function toChangeContextPath(changeId: string, filename: string): string {
    return path.posix.join('.opencode', 'weave', 'changes', changeId, 'context', filename);
}

export async function readChangeMetadata(
    basePath: string,
    changeId: string
): Promise<WeaveChangeMetadata | null> {
    const metadataPath = path.join(getChangeArtifactDir(basePath, changeId), 'metadata.yaml');
    if (!fs.existsSync(metadataPath)) {
        return null;
    }

    const raw = await readFile(metadataPath, 'utf-8');
    const parsed = parseYaml(raw);
    if (!parsed || typeof parsed !== 'object') {
        return null;
    }

    return {
        changeId: String((parsed as any).change_id || changeId),
        planName: String((parsed as any).plan_name || changeId),
        projectName: String((parsed as any).project_name || 'Unknown'),
        status: ((parsed as any).status || 'active') as WeaveChangeMetadata['status'],
        createdAt: String((parsed as any).created_at || new Date().toISOString()),
        updatedAt: String((parsed as any).updated_at || new Date().toISOString()),
        verifiedAt: (parsed as any).verified_at ? String((parsed as any).verified_at) : undefined,
        archivedAt: (parsed as any).archived_at ? String((parsed as any).archived_at) : undefined,
        proposalPath: String((parsed as any).proposal_path || toChangeArtifactPath(changeId, CHANGE_FILES.proposalPath)),
        designPath: String((parsed as any).design_path || toChangeArtifactPath(changeId, CHANGE_FILES.designPath)),
        tasksPath: String((parsed as any).tasks_path || toChangeArtifactPath(changeId, CHANGE_FILES.tasksPath)),
        verifyPath: String((parsed as any).verify_path || toChangeArtifactPath(changeId, CHANGE_FILES.verifyPath)),
        archivePath: String((parsed as any).archive_path || toChangeArtifactPath(changeId, CHANGE_FILES.archivePath)),
    };
}

export async function ensureChangeArtifact(input: {
    basePath: string;
    changeId: string;
    planName: string;
    projectName: string;
}): Promise<WeaveChangeMetadata> {
    const changeDir = getChangeArtifactDir(input.basePath, input.changeId);
    await mkdir(changeDir, { recursive: true });

    await Promise.all(
        (Object.entries(CHANGE_FILES) as Array<[ChangeFileKey, string]>).map(async ([key, filename]) => {
            const absolutePath = path.join(changeDir, filename);
            if (fs.existsSync(absolutePath)) {
                return;
            }

            const title = filename.replace('.md', '').replace(/(^|-)([a-z])/g, (_, sep, char) => `${sep} ${char.toUpperCase()}`).trim();
            const body = [
                `# ${title}`,
                '',
                `- Change ID: \`${input.changeId}\``,
                `- Plan: \`${input.planName}\``,
                '',
            ].join('\n');
            await writeFile(absolutePath, body, 'utf-8');
        })
    );

    const existing = await readChangeMetadata(input.basePath, input.changeId);
    const metadata: WeaveChangeMetadata = {
        changeId: input.changeId,
        planName: input.planName,
        projectName: input.projectName,
        status: existing?.status || 'active',
        createdAt: existing?.createdAt || new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        proposalPath: toChangeArtifactPath(input.changeId, CHANGE_FILES.proposalPath),
        designPath: toChangeArtifactPath(input.changeId, CHANGE_FILES.designPath),
        tasksPath: toChangeArtifactPath(input.changeId, CHANGE_FILES.tasksPath),
        verifyPath: toChangeArtifactPath(input.changeId, CHANGE_FILES.verifyPath),
        archivePath: toChangeArtifactPath(input.changeId, CHANGE_FILES.archivePath),
    };

    const metadataPath = path.join(changeDir, 'metadata.yaml');
    await writeFile(
        metadataPath,
        stringifyYaml({
            change_id: metadata.changeId,
            plan_name: metadata.planName,
            project_name: metadata.projectName,
            status: metadata.status,
            created_at: metadata.createdAt,
            updated_at: metadata.updatedAt,
            ...(metadata.verifiedAt ? { verified_at: metadata.verifiedAt } : {}),
            ...(metadata.archivedAt ? { archived_at: metadata.archivedAt } : {}),
            proposal_path: metadata.proposalPath,
            design_path: metadata.designPath,
            tasks_path: metadata.tasksPath,
            verify_path: metadata.verifyPath,
            archive_path: metadata.archivePath,
        }),
        'utf-8'
    );

    return metadata;
}

export async function updateChangeMetadata(
    basePath: string,
    changeId: string,
    updater: (metadata: WeaveChangeMetadata) => WeaveChangeMetadata
): Promise<WeaveChangeMetadata | null> {
    const existing = await readChangeMetadata(basePath, changeId);
    if (!existing) {
        return null;
    }

    const next = updater({
        ...existing,
        updatedAt: new Date().toISOString(),
    });

    const metadataPath = path.join(getChangeArtifactDir(basePath, changeId), 'metadata.yaml');
    await writeFile(
        metadataPath,
        stringifyYaml({
            change_id: next.changeId,
            plan_name: next.planName,
            project_name: next.projectName,
            status: next.status,
            created_at: next.createdAt,
            updated_at: next.updatedAt,
            ...(next.verifiedAt ? { verified_at: next.verifiedAt } : {}),
            ...(next.archivedAt ? { archived_at: next.archivedAt } : {}),
            proposal_path: next.proposalPath,
            design_path: next.designPath,
            tasks_path: next.tasksPath,
            verify_path: next.verifyPath,
            archive_path: next.archivePath,
        }),
        'utf-8'
    );

    return next;
}

export async function writeChangeVerificationReport(input: {
    basePath: string;
    changeId: string;
    reportMarkdown: string;
    passed: boolean;
}): Promise<void> {
    const metadata = await readChangeMetadata(input.basePath, input.changeId);
    if (!metadata) {
        return;
    }

    const verifyPathAbs = path.join(input.basePath, metadata.verifyPath);
    const sections = [
        '# Verify',
        '',
        `- Change ID: \`${metadata.changeId}\``,
        `- Plan: \`${metadata.planName}\``,
        `- Status: ${input.passed ? 'verified' : 'active'}`,
        `- Updated: ${new Date().toISOString()}`,
        '',
        '## Report',
        '',
        input.reportMarkdown.trim(),
        '',
    ];
    await writeFile(verifyPathAbs, sections.join('\n'), 'utf-8');

    await updateChangeMetadata(input.basePath, input.changeId, current => ({
        ...current,
        status: input.passed ? 'verified' : current.status,
        verifiedAt: input.passed ? new Date().toISOString() : current.verifiedAt,
        updatedAt: new Date().toISOString(),
    }));
}

export async function writeChangeArchiveReport(input: {
    basePath: string;
    changeId: string;
    summaryLines?: string[];
}): Promise<WeaveChangeMetadata | null> {
    const metadata = await readChangeMetadata(input.basePath, input.changeId);
    if (!metadata) {
        return null;
    }

    const archivedAt = new Date().toISOString();
    const archivePathAbs = path.join(input.basePath, metadata.archivePath);
    const sections = [
        '# Archive',
        '',
        `- Change ID: \`${metadata.changeId}\``,
        `- Plan: \`${metadata.planName}\``,
        '- Status: archived',
        `- Archived at: ${archivedAt}`,
        '',
        '## Summary',
        '',
        ...(input.summaryLines && input.summaryLines.length > 0
            ? input.summaryLines.map(line => `- ${line}`)
            : ['- Change archived from verified state.']),
        '',
    ];
    await writeFile(archivePathAbs, sections.join('\n'), 'utf-8');

    return updateChangeMetadata(input.basePath, input.changeId, current => ({
        ...current,
        status: 'archived',
        archivedAt,
        updatedAt: archivedAt,
    }));
}
