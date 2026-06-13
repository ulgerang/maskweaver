import { spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

export type DetectedSubscription = 'opencode-go' | 'zai-coding-plan';

export interface SubscriptionDetectionResult {
    subscriptions: DetectedSubscription[];
    primary: DetectedSubscription;
    evidence: string[];
    allProviders: ProviderInfo[];
}

export interface ProviderInfo {
    name: string;
    subscription: DetectedSubscription | null;
    authType: string;
    active: boolean;
}

type JsonObject = Record<string, unknown>;

const MODEL_FIELDS = ['model', 'small_model', 'large_model'] as const;

function isJsonObject(value: unknown): value is JsonObject {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function stripJsonComments(content: string): string {
    return content.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
}

export function defaultSubscriptionDetection(evidence: string): SubscriptionDetectionResult {
    return {
        subscriptions: ['opencode-go'],
        primary: 'opencode-go',
        evidence: [evidence],
        allProviders: [],
    };
}

export function readOpencodeConfig(basePath: string): JsonObject | null {
    const candidates = [
        path.join(basePath, 'opencode.json'),
        path.join(basePath, 'opencode.jsonc'),
        path.join(os.homedir(), '.config', 'opencode', 'opencode.json'),
        path.join(os.homedir(), '.config', 'opencode', 'opencode.jsonc'),
    ];

    for (const candidate of candidates) {
        if (!fs.existsSync(candidate)) continue;
        try {
            const content = stripJsonComments(fs.readFileSync(candidate, 'utf-8'));
            const parsed: unknown = JSON.parse(content);
            if (isJsonObject(parsed)) return parsed;
        } catch {
            continue;
        }
    }

    return null;
}

function collectConfigObjects(opencodeConfig: JsonObject): JsonObject[] {
    const configs = [opencodeConfig];
    const agent = opencodeConfig.agent;
    if (!isJsonObject(agent)) return configs;

    for (const agentConfig of Object.values(agent)) {
        if (isJsonObject(agentConfig)) configs.push(agentConfig);
    }

    return configs;
}

function collectModelValues(opencodeConfig: JsonObject): string[] {
    const values: string[] = [];
    for (const cfg of collectConfigObjects(opencodeConfig)) {
        for (const field of MODEL_FIELDS) {
            const value = cfg[field];
            if (typeof value === 'string' && value) values.push(value);
        }
    }

    return values;
}

export function hasSubscriptionHints(opencodeConfig: JsonObject): boolean {
    return collectModelValues(opencodeConfig).some(
        (value) => value.startsWith('opencode-go/') || value.startsWith('zai-coding-plan/')
    );
}

const PROVIDER_MAP: Record<string, DetectedSubscription> = {
    'opencode go': 'opencode-go',
    'opencode-go': 'opencode-go',
    'z.ai coding plan': 'zai-coding-plan',
    'zai-coding-plan': 'zai-coding-plan',
    'z.ai': 'zai-coding-plan',
};

function parseProvidersList(output: string): ProviderInfo[] {
    const providers: ProviderInfo[] = [];

    for (const line of output.split('\n')) {
        const stripped = line.replace(/\x1b\[[0-9;]*m/g, '').trim();
        if (!stripped || stripped.startsWith('┌') || stripped.startsWith('└') || stripped.startsWith('│') || stripped.includes('credentials') || stripped.includes('environment')) continue;

        const match = stripped.match(/[●○◉◘]\s+(.+?)\s+(api|oauth|env)$/i);
        if (!match) continue;

        const name = match[1].trim();
        const authType = match[2].trim();
        const nameLower = name.toLowerCase();
        let subscription: DetectedSubscription | null = null;
        for (const [key, sub] of Object.entries(PROVIDER_MAP)) {
            if (nameLower.includes(key)) {
                subscription = sub;
                break;
            }
        }

        providers.push({
            name,
            subscription,
            authType,
            active: stripped.includes('●'),
        });
    }

    return providers;
}

export function detectSubscriptionsFromCli(): SubscriptionDetectionResult {
    const result = spawnSync('opencode', ['providers', 'list'], {
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'pipe'],
        timeout: 5000,
        windowsHide: true,
        env: {
            ...process.env,
            OPENCODE_DISABLE_AUTOUPDATE: '1',
        },
    });

    if (result.error || result.status !== 0) {
        return defaultSubscriptionDetection('No subscription detected via provider list, defaulting to opencode-go');
    }

    const providers = parseProvidersList(result.stdout || '');
    const subscriptions = new Set<DetectedSubscription>();
    const evidence: string[] = [];

    for (const provider of providers) {
        if (!provider.subscription) continue;
        subscriptions.add(provider.subscription);
        evidence.push(`provider: ${provider.name} (${provider.authType})`);
    }

    if (subscriptions.size === 0) {
        return defaultSubscriptionDetection('No subscription detected via provider list, defaulting to opencode-go');
    }

    return {
        subscriptions: Array.from(subscriptions),
        primary: subscriptions.has('zai-coding-plan') ? 'zai-coding-plan' : 'opencode-go',
        evidence,
        allProviders: providers,
    };
}

export function detectSubscriptionsFromConfig(opencodeConfig: JsonObject): SubscriptionDetectionResult {
    const subscriptions = new Set<DetectedSubscription>();
    const evidence: string[] = [];

    for (const cfg of collectConfigObjects(opencodeConfig)) {
        for (const field of MODEL_FIELDS) {
            const value = cfg[field];
            if (typeof value !== 'string' || !value) continue;

            if (value.startsWith('opencode-go/')) {
                subscriptions.add('opencode-go');
                evidence.push(`${field}: ${value}`);
            } else if (value.startsWith('zai-coding-plan/')) {
                subscriptions.add('zai-coding-plan');
                evidence.push(`${field}: ${value}`);
            }
        }
    }

    if (subscriptions.size === 0) {
        return defaultSubscriptionDetection('No provider detected in config, defaulting to opencode-go');
    }

    return {
        subscriptions: Array.from(subscriptions),
        primary: subscriptions.has('zai-coding-plan') ? 'zai-coding-plan' : 'opencode-go',
        evidence,
        allProviders: [],
    };
}
