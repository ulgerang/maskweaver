import { readChangeMetadata, writeChangeArchiveReport } from '../change-artifacts.js';

export interface ArchiveChangeOptions {
    basePath: string;
    changeId: string;
    summaryLines?: string[];
}

export interface ArchiveChangeResult {
    ok: boolean;
    alreadyArchived?: boolean;
    reason?: string;
    archivePath?: string;
    changeId: string;
}

export async function archiveChange(options: ArchiveChangeOptions): Promise<ArchiveChangeResult> {
    const metadata = await readChangeMetadata(options.basePath, options.changeId);
    if (!metadata) {
        return {
            ok: false,
            reason: `Change not found: ${options.changeId}`,
            changeId: options.changeId,
        };
    }

    if (metadata.status === 'archived') {
        return {
            ok: true,
            alreadyArchived: true,
            archivePath: metadata.archivePath,
            changeId: options.changeId,
        };
    }

    if (metadata.status !== 'verified') {
        return {
            ok: false,
            reason: `Change must be verified before archive. Current status: ${metadata.status}`,
            changeId: options.changeId,
        };
    }

    const updated = await writeChangeArchiveReport({
        basePath: options.basePath,
        changeId: options.changeId,
        summaryLines: options.summaryLines,
    });

    return {
        ok: Boolean(updated),
        archivePath: updated?.archivePath,
        changeId: options.changeId,
        reason: updated ? undefined : `Failed to archive change: ${options.changeId}`,
    };
}
