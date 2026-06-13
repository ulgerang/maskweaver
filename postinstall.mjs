// postinstall.mjs
// Runs after npm install to create/migrate Maskweaver config.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

function getPackageVersion() {
  try {
    const dir = fileURLToPath(new URL(".", import.meta.url));
    const pkg = JSON.parse(readFileSync(new URL("package.json", import.meta.url), "utf8"));
    return pkg.version || "unknown";
  } catch {
    return "unknown";
  }
}

const ZAI_POOL = [
  {
    id: 'glm-flash',
    model: 'zai-coding-plan/glm-5-turbo',
    tier: 'flash',
    maxConcurrent: 1,
    capabilities: ['search', 'formatting', 'simple-coding', 'file-ops'],
    costTier: 'low',
    description: 'GLM-5 Turbo - 빠름. 단순 검색/포매팅/파일작업',
  },
  {
    id: 'glm-general',
    model: 'zai-coding-plan/glm-5.1',
    tier: 'human',
    maxConcurrent: 10,
    capabilities: ['coding', 'testing', 'refactoring', 'backend'],
    costTier: 'medium',
    description: 'GLM-5.1 - 일반. 코딩/리팩토링/백엔드',
  },
  {
    id: 'glm-premium',
    model: 'zai-coding-plan/glm-5.1',
    tier: 'premium',
    maxConcurrent: 10,
    capabilities: ['architecture', 'debugging', 'reasoning', 'complex-coding', 'refactoring'],
    costTier: 'high',
    description: 'GLM-5.1 - 고급 추론. 아키텍처/복잡 디버깅',
  },
];

const OPENCODE_GO_POOL = [
  {
    id: 'deepseek-flash',
    model: 'opencode-go/deepseek-v4-flash',
    tier: 'flash',
    maxConcurrent: 5,
    capabilities: ['search', 'formatting', 'simple-coding', 'file-ops'],
    costTier: 'low',
    description: 'DeepSeek V4 Flash - 빠름. 단순 검색/포매팅/파일작업',
  },
  {
    id: 'deepseek-general',
    model: 'opencode-go/deepseek-v4-flash',
    tier: 'human',
    maxConcurrent: 3,
    capabilities: ['coding', 'testing', 'refactoring', 'backend'],
    costTier: 'medium',
    description: 'DeepSeek V4 Flash - 일반. 코딩/리팩토링/백엔드',
  },
  {
    id: 'qwen-vision',
    model: 'opencode-go/qwen3.6-plus',
    tier: 'human',
    maxConcurrent: 3,
    capabilities: ['vision', 'frontend', 'testing'],
    costTier: 'medium',
    description: 'Qwen 3.6 Plus - 비전. 이미지 분석/프론트엔드/테스트',
  },
  {
    id: 'deepseek-pro',
    model: 'opencode-go/deepseek-v4-pro',
    tier: 'premium',
    maxConcurrent: 2,
    capabilities: ['architecture', 'debugging', 'reasoning', 'complex-coding', 'refactoring'],
    costTier: 'high',
    description: 'DeepSeek V4 Pro - 고급 추론. 아키텍처/복잡 디버깅',
  },
  {
    id: 'kimi-vision',
    model: 'opencode-go/kimi-k2.6',
    tier: 'premium',
    maxConcurrent: 2,
    capabilities: ['vision', 'reasoning', 'complex-coding', 'architecture', 'debugging'],
    costTier: 'high',
    description: 'Kimi K2.6 - 비전 고급. 이미지 분석/복잡 추론',
  },
];

function detectSubscription() {
  let hasOpencodeGo = false;
  let hasZai = false;

  const initCwd = process.env.INIT_CWD;
  const candidates = [
    ...(initCwd ? [
      join(initCwd, 'opencode.json'),
      join(initCwd, 'opencode.jsonc'),
    ] : []),
    join(homedir(), '.config', 'opencode', 'opencode.json'),
    join(homedir(), '.config', 'opencode', 'opencode.jsonc'),
  ];

  for (const candidate of candidates) {
    if (!existsSync(candidate)) continue;
    try {
      let content = readFileSync(candidate, 'utf-8');
      content = content.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
      const parsed = JSON.parse(content);
      if (!parsed || typeof parsed !== 'object') continue;

      const modelFields = ['model', 'small_model', 'large_model'];
      const configs = [parsed];
      if (parsed.agent && typeof parsed.agent === 'object') {
        for (const agentConfig of Object.values(parsed.agent)) {
          if (agentConfig && typeof agentConfig === 'object') configs.push(agentConfig);
        }
      }

      for (const cfg of configs) {
        for (const field of modelFields) {
          const val = cfg[field];
          if (typeof val !== 'string' || !val) continue;
          if (val.startsWith('opencode-go/')) hasOpencodeGo = true;
          if (val.startsWith('zai-coding-plan/')) hasZai = true;
        }
      }
    } catch { continue; }
  }

  if (hasZai) return 'zai-coding-plan';
  if (hasOpencodeGo) return 'opencode-go';
  return 'opencode-go';
}

function buildConfigForSubscription(subscription) {
  const pool = subscription === 'zai-coding-plan'
    ? [...ZAI_POOL, ...OPENCODE_GO_POOL]
    : [...OPENCODE_GO_POOL];

  const operatorModel = subscription === 'zai-coding-plan'
    ? 'zai-coding-plan/glm-5.1'
    : 'opencode-go/deepseek-v4-pro';

  const operatorConcurrent = subscription === 'zai-coding-plan' ? 10 : 2;

  return {
    dummyHumans: { pool },
    operator: {
      model: operatorModel,
      maxConcurrent: operatorConcurrent,
      description: 'Squad Operator model - 작업 오케스트레이션 및 고급 추론',
    },
    memory: { provider: 'text-only', enabled: false },
    gdc: { enabled: 'auto', strictVerify: false, autoSyncOnPrepare: true },
    language: 'ko',
  };
}

const DEFAULT_GLOBAL_CONFIG_TEMPLATE = buildConfigForSubscription('opencode-go');

function ensureGlobalConfig() {
  const globalDir = join(homedir(), '.config', 'opencode');
  const globalConfigPath = join(globalDir, 'maskweaver.config.json');

  if (!existsSync(globalConfigPath)) {
    const subscription = detectSubscription();
    const template = buildConfigForSubscription(subscription);
    try {
      if (!existsSync(globalDir)) {
        mkdirSync(globalDir, { recursive: true });
      }
      writeFileSync(
        globalConfigPath,
        JSON.stringify(template, null, 2) + '\n',
        'utf-8'
      );
      return { created: true, migrated: false, subscription };
    } catch {
      return { created: false, migrated: false, subscription };
    }
  }

  try {
    const existing = JSON.parse(readFileSync(globalConfigPath, 'utf-8'));
    let changed = false;

    if (!existing.operator) {
      existing.operator = DEFAULT_GLOBAL_CONFIG_TEMPLATE.operator;
      changed = true;
    }

    if (!existing.gdc) {
      existing.gdc = DEFAULT_GLOBAL_CONFIG_TEMPLATE.gdc;
      changed = true;
    }

    if (!existing.dummyHumans) {
      existing.dummyHumans = DEFAULT_GLOBAL_CONFIG_TEMPLATE.dummyHumans;
      changed = true;
    }

    if (changed) {
      writeFileSync(
        globalConfigPath,
        JSON.stringify(existing, null, 2) + '\n',
        'utf-8'
      );
    }

    const subscription = detectSubscription();
    return { created: false, migrated: changed, subscription };
  } catch {
    return { created: false, migrated: false, subscription: 'opencode-go' };
  }
}

function main() {
  const pkgVersion = getPackageVersion();

  // Always create/migrate global config — regardless of OpenCode detection
  const configResult = ensureGlobalConfig();
  if (configResult.created) {
    console.log(`✓ maskweaver v${pkgVersion}: 글로벌 설정 파일 생성됨`);
    console.log(`  → ~/.config/opencode/maskweaver.config.json`);
    console.log(`  감지된 구독: ${configResult.subscription}`);
    console.log(`  편집 후 프로젝트에서 \`weave sync-agents\`를 실행하세요`);
    console.log('');
  } else if (configResult.migrated) {
    console.log(`✓ maskweaver v${pkgVersion}: 글로벌 설정 파일 업데이트됨`);
    console.log(`  → ~/.config/opencode/maskweaver.config.json`);
    console.log(`  operator 및 gdc 설정이 추가되었습니다.`);
    console.log('');
  } else if (configResult.subscription === 'zai-coding-plan') {
    console.log(`✓ maskweaver v${pkgVersion}: zai-coding-plan 구독 감지됨`);
    console.log(`  GLM-5.1 모델이 풀에 포함되어 있습니다.`);
    console.log('');
  }

  console.log(`✓ maskweaver v${pkgVersion}: 설치 후 설정 점검 완료`);
  console.log(`  OpenCode 호환성은 플러그인 로드 시 확인됩니다.`);
  console.log(`  maskweaver install 로 플러그인을 등록하세요.`);
}

main();
