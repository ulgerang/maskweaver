#!/usr/bin/env bun
/**
 * 🎭 Maskweaver Setup Wizard
 * 
 * Beautiful, intuitive CLI for setting up maskweaver configuration.
 * Inspired by Sindre Sorhus's excellent CLI tools.
 * 
 * @author Maskweaver Team
 */

import * as readline from 'readline';
import * as fs from 'fs';
import * as path from 'path';

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 🎨 CLI Utilities (Sindre Sorhus style - simple, beautiful, zero deps)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

// ANSI colors
const c = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  
  // Colors
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  white: '\x1b[37m',
  gray: '\x1b[90m',
  
  // Background
  bgGreen: '\x1b[42m',
  bgBlue: '\x1b[44m',
};

// Styled text helpers
const style = {
  success: (text: string) => `${c.green}${text}${c.reset}`,
  error: (text: string) => `${c.red}${text}${c.reset}`,
  warning: (text: string) => `${c.yellow}${text}${c.reset}`,
  info: (text: string) => `${c.cyan}${text}${c.reset}`,
  dim: (text: string) => `${c.dim}${text}${c.reset}`,
  bold: (text: string) => `${c.bold}${text}${c.reset}`,
  highlight: (text: string) => `${c.cyan}${c.bold}${text}${c.reset}`,
};

// Icons
const icon = {
  success: style.success('✓'),
  error: style.error('✗'),
  warning: style.warning('⚠'),
  info: style.info('ℹ'),
  arrow: style.info('→'),
  pointer: style.cyan('›'),
  mask: '🎭',
  rocket: '🚀',
  gear: '⚙️',
  save: '💾',
  check: '📋',
  sparkles: '✨',
};

// Box drawing
const box = {
  topLine: '━'.repeat(70),
  bottomLine: '━'.repeat(70),
  doubleLine: '═'.repeat(70),
};

// Readline interface
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

function ask(question: string): Promise<string> {
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      resolve(answer.trim());
    });
  });
}

function print(message = '') {
  console.log(message);
}

function clearScreen() {
  console.clear();
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 🌍 Internationalization
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

type Language = 'ko' | 'en';

const i18n = {
  ko: {
    // Header
    welcome: '🎭 Maskweaver 설치 마법사에 오신 것을 환영합니다!',
    subtitle: '전문가 가면으로 AI 코딩 어시스턴트를 강화하세요',
    
    // Steps
    step: '단계',
    
    // Language selection
    selectLanguage: '언어를 선택하세요 | Select your language',
    korean: '한국어',
    english: 'English',
    
    // Mode selection
    modeTitle: '설치 모드 선택',
    modeQuestion: '설치 모드를 선택하세요',
    beginner: '초보자 모드 (추천)',
    beginnerDesc: '간단한 질문만 - 대부분의 사용자에게 적합',
    advanced: '고급 모드',
    advancedDesc: '모든 옵션 제어 - 세밀한 설정 필요 시',
    
    // Context system
    contextTitle: '컨텍스트 시스템',
    contextDesc: '작업 컨텍스트 추적 (필수 기능)',
    contextEnabled: '✓ 활성화됨 (필수)',
    
    // Memory system
    memoryTitle: '메모리 시스템',
    memoryQuestion: '메모리 시스템을 사용하시겠습니까?',
    memoryDesc: '대화 기록, 결정사항, 코드베이스 기억',
    enable: '사용',
    disable: '사용 안 함',
    recommended: '(추천)',
    
    // Provider selection
    providerTitle: '메모리 Provider 선택',
    providerQuestion: 'Embedding Provider를 선택하세요',
    providerOllama: '로컬 Ollama (무료, 설치 필요)',
    providerVoyage: 'VoyageAI (코드 검색 최적화!)',
    providerOpenAI: 'OpenAI API',
    providerOpenRouter: 'OpenRouter (다중 모델)',
    providerTextOnly: '텍스트 검색만 (가장 단순)',
    devRecommended: '← 개발자 추천',
    
    // API Key
    apiKeyTitle: 'API 키 설정',
    apiKeyQuestion: 'API 키를 입력하세요',
    apiKeySkip: '(환경 변수로 설정하려면 Enter)',
    apiKeyEnvVar: '환경 변수',
    apiKeySet: '설정됨',
    apiKeyNotSet: '미설정 - 나중에 환경 변수로 설정 필요',
    
    // Retrospect system
    retrospectTitle: '회고 시스템',
    retrospectQuestion: '회고 시스템을 사용하시겠습니까?',
    retrospectDesc: '작업 후 자동으로 배운 점 기록',
    
    // Verify system
    verifyTitle: '검증 시스템',
    verifyQuestion: '검증 시스템을 사용하시겠습니까?',
    verifyDesc: '더미인간의 작업 결과를 자동 리뷰',
    verifyWarning: '주의: 추가 API 비용 발생',
    
    // Summary
    summaryTitle: '설정 요약',
    mode: '모드',
    context: '컨텍스트',
    memory: '메모리',
    retrospect: '회고',
    verify: '검증',
    activated: '✓ 활성화',
    deactivated: '✗ 비활성화',
    
    // Completion
    setupComplete: '✅ 설정 완료!',
    configSaved: '💾 설정이 저장되었습니다',
    canChange: '언제든 `bun run setup`으로 변경할 수 있습니다',
    gettingStarted: '🚀 시작하기',
    nextSteps: 'opencode를 실행하고 @dummy-human을 호출해보세요!',
    
    // Errors
    invalidChoice: '잘못된 선택입니다. 다시 입력해주세요.',
  },
  
  en: {
    // Header
    welcome: '🎭 Welcome to Maskweaver Setup Wizard!',
    subtitle: 'Empower your AI coding assistant with expert masks',
    
    // Steps
    step: 'Step',
    
    // Language selection
    selectLanguage: '언어를 선택하세요 | Select your language',
    korean: '한국어',
    english: 'English',
    
    // Mode selection
    modeTitle: 'Choose Setup Mode',
    modeQuestion: 'Select installation mode',
    beginner: 'Beginner (recommended)',
    beginnerDesc: 'Simple questions - suitable for most users',
    advanced: 'Advanced',
    advancedDesc: 'Full control - for fine-tuned configuration',
    
    // Context system
    contextTitle: 'Context System',
    contextDesc: 'Track work context (required feature)',
    contextEnabled: '✓ Enabled (required)',
    
    // Memory system
    memoryTitle: 'Memory System',
    memoryQuestion: 'Enable memory system?',
    memoryDesc: 'Remember conversations, decisions, and codebase',
    enable: 'Enable',
    disable: 'Disable',
    recommended: '(recommended)',
    
    // Provider selection
    providerTitle: 'Memory Provider Selection',
    providerQuestion: 'Select embedding provider',
    providerOllama: 'Local Ollama (free, installation required)',
    providerVoyage: 'VoyageAI (code search optimized!)',
    providerOpenAI: 'OpenAI API',
    providerOpenRouter: 'OpenRouter (multi-model)',
    providerTextOnly: 'Text search only (simplest)',
    devRecommended: '← Developer recommended',
    
    // API Key
    apiKeyTitle: 'API Key Setup',
    apiKeyQuestion: 'Enter API key',
    apiKeySkip: '(Press Enter to use environment variable)',
    apiKeyEnvVar: 'Environment variable',
    apiKeySet: 'Set',
    apiKeyNotSet: 'Not set - configure via environment variable later',
    
    // Retrospect system
    retrospectTitle: 'Retrospect System',
    retrospectQuestion: 'Enable retrospect system?',
    retrospectDesc: 'Automatically record learnings after work',
    
    // Verify system
    verifyTitle: 'Verification System',
    verifyQuestion: 'Enable verification system?',
    verifyDesc: 'Auto-review dummy-human work results',
    verifyWarning: 'Warning: Additional API costs',
    
    // Summary
    summaryTitle: 'Configuration Summary',
    mode: 'Mode',
    context: 'Context',
    memory: 'Memory',
    retrospect: 'Retrospect',
    verify: 'Verify',
    activated: '✓ Enabled',
    deactivated: '✗ Disabled',
    
    // Completion
    setupComplete: '✅ Setup Complete!',
    configSaved: '💾 Configuration saved',
    canChange: 'You can change settings anytime with `bun run setup`',
    gettingStarted: '🚀 Getting Started',
    nextSteps: 'Run opencode and try calling @dummy-human!',
    
    // Errors
    invalidChoice: 'Invalid choice. Please try again.',
  },
};

let lang: Language = 'en';
const t = (key: keyof typeof i18n.ko): string => i18n[lang][key];

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 🎯 Configuration Types
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

type SetupMode = 'beginner' | 'advanced';
type MemoryProvider = 'ollama' | 'voyage' | 'openai' | 'openrouter' | 'text-only';

interface SetupConfig {
  mode: SetupMode;
  features: {
    context: { enabled: true };
    memory?: { enabled: boolean; provider: MemoryProvider };
    retrospect?: { enabled: boolean };
    verify?: { enabled: boolean };
  };
  memory?: {
    provider: MemoryProvider;
    ollama?: { model: string };
    openai?: { model: string };
    voyage?: { model: string };
    openrouter?: { model: string };
  };
  apiKeys?: {
    voyage?: string;
    openai?: string;
    openrouter?: string;
  };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 🎨 UI Components
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function showHeader() {
  clearScreen();
  print();
  print(style.bold(t('welcome')));
  print(style.dim(t('subtitle')));
  print();
  print(style.dim(box.topLine));
  print();
}

function showStep(current: number, total: number, title: string) {
  print();
  print(style.highlight(`[${current}/${total}] ${title}`));
  print();
}

async function askChoice(
  question: string,
  choices: Array<{ key: string; label: string; hint?: string }>,
  defaultKey?: string
): Promise<string> {
  // Show choices
  for (const choice of choices) {
    const isDefault = choice.key === defaultKey;
    const marker = isDefault ? style.cyan('→') : ' ';
    const hint = choice.hint ? style.dim(` ${choice.hint}`) : '';
    print(`  ${marker} ${choice.key}) ${choice.label}${hint}`);
  }
  print();
  
  // Ask for input
  const defaultHint = defaultKey ? style.dim(` [${defaultKey}]`) : '';
  const answer = await ask(`${icon.pointer} ${question}${defaultHint}: `);
  
  // Return default if empty
  if (!answer && defaultKey) {
    return defaultKey;
  }
  
  // Validate choice
  const choice = choices.find(c => c.key === answer);
  if (!choice) {
    print(style.error(`  ${t('invalidChoice')}`));
    print();
    return askChoice(question, choices, defaultKey);
  }
  
  return answer;
}

async function askYesNo(question: string, defaultYes = true): Promise<boolean> {
  const hint = defaultYes ? '[Y/n]' : '[y/N]';
  const answer = await ask(`${icon.pointer} ${question} ${style.dim(hint)}: `);
  
  if (!answer) {
    return defaultYes;
  }
  
  const normalized = answer.toLowerCase();
  return normalized === 'y' || normalized === 'yes';
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 🔧 Setup Steps
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

async function selectLanguage(): Promise<Language> {
  print();
  print(style.bold(t('selectLanguage')));
  print();
  
  const choice = await askChoice(
    'Language',
    [
      { key: '1', label: '🇰🇷 한국어' },
      { key: '2', label: '🇺🇸 English' },
    ],
    '1'
  );
  
  return choice === '1' ? 'ko' : 'en';
}

async function selectMode(): Promise<SetupMode> {
  showStep(1, 6, t('modeTitle'));
  
  const choice = await askChoice(
    t('modeQuestion'),
    [
      { key: '1', label: t('beginner'), hint: t('beginnerDesc') },
      { key: '2', label: t('advanced'), hint: t('advancedDesc') },
    ],
    '1'
  );
  
  return choice === '1' ? 'beginner' : 'advanced';
}

async function setupContext(): Promise<void> {
  showStep(2, 6, t('contextTitle'));
  print(style.dim(`  ${t('contextDesc')}`));
  print();
  print(`  ${icon.success} ${t('contextEnabled')}`);
}

async function setupMemory(): Promise<{ enabled: boolean; provider?: MemoryProvider }> {
  showStep(3, 6, t('memoryTitle'));
  print(style.dim(`  ${t('memoryDesc')}`));
  print();
  
  const enabled = await askYesNo(`${t('memoryQuestion')} ${style.dim(t('recommended'))}`, true);
  
  if (!enabled) {
    return { enabled: false };
  }
  
  // Select provider
  print();
  showStep(4, 6, t('providerTitle'));
  
  const choice = await askChoice(
    t('providerQuestion'),
    [
      { key: '1', label: `🆓 ${t('providerOllama')}` },
      { key: '2', label: `💰 ${t('providerVoyage')}`, hint: t('devRecommended') },
      { key: '3', label: `💰 ${t('providerOpenAI')}` },
      { key: '4', label: `💰 ${t('providerOpenRouter')}` },
      { key: '5', label: `🆓 ${t('providerTextOnly')}` },
    ],
    '2'
  );
  
  const providerMap: Record<string, MemoryProvider> = {
    '1': 'ollama',
    '2': 'voyage',
    '3': 'openai',
    '4': 'openrouter',
    '5': 'text-only',
  };
  
  return { enabled: true, provider: providerMap[choice] };
}

async function setupApiKey(provider: MemoryProvider): Promise<string | undefined> {
  if (provider === 'ollama' || provider === 'text-only') {
    return undefined;
  }
  
  print();
  const envVarMap: Record<string, string> = {
    voyage: 'VOYAGE_API_KEY',
    openai: 'OPENAI_API_KEY',
    openrouter: 'OPENROUTER_API_KEY',
  };
  
  const envVar = envVarMap[provider];
  const existing = process.env[envVar];
  
  if (existing) {
    print(style.success(`  ${icon.success} ${t('apiKeyEnvVar')} ${envVar}: ${t('apiKeySet')}`));
    return undefined; // Use env var
  }
  
  print(style.dim(`  ${t('apiKeySkip')}`));
  const apiKey = await ask(`${icon.pointer} ${envVar}: `);
  
  if (!apiKey) {
    print(style.warning(`  ${icon.warning} ${t('apiKeyNotSet')}`));
    return undefined;
  }
  
  return apiKey;
}

async function setupRetrospect(): Promise<boolean> {
  showStep(5, 6, t('retrospectTitle'));
  print(style.dim(`  ${t('retrospectDesc')}`));
  print();
  
  return await askYesNo(`${t('retrospectQuestion')} ${style.dim(t('recommended'))}`, true);
}

async function setupVerify(): Promise<boolean> {
  showStep(6, 6, t('verifyTitle'));
  print(style.dim(`  ${t('verifyDesc')}`));
  print(style.dim(`  ${t('verifyWarning')}`));
  print();
  
  return await askYesNo(t('verifyQuestion'), false);
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 💾 Config Generation
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function generateConfig(config: SetupConfig): string {
  const lines: string[] = [
    'import type { MaskweaverConfig } from "@maskweaver/shared";',
    '',
    'const config: MaskweaverConfig = {',
    '  features: {',
    '    context: { enabled: true },',
  ];
  
  // Memory feature
  if (config.features.memory?.enabled) {
    lines.push(`    memory: { enabled: true, provider: "${config.features.memory.provider}" },`);
  }
  
  // Retrospect feature
  if (config.features.retrospect?.enabled) {
    lines.push('    retrospect: { enabled: true },');
  }
  
  // Verify feature
  if (config.features.verify?.enabled) {
    lines.push('    verify: { enabled: true },');
  }
  
  lines.push('  },');
  
  // Memory config
  if (config.memory) {
    lines.push('  memory: {');
    lines.push(`    provider: "${config.memory.provider}",`);
    
    const providerDefaults: Record<MemoryProvider, string> = {
      ollama: 'nomic-embed-text',
      openai: 'text-embedding-3-small',
      voyage: 'voyage-code-3',
      openrouter: 'openai/text-embedding-3-small',
      'text-only': '',
    };
    
    const provider = config.memory.provider;
    if (provider !== 'text-only') {
      const configKey = provider;
      const model = providerDefaults[provider];
      lines.push(`    ${configKey}: {`);
      lines.push(`      model: "${model}",`);
      lines.push('    },');
    }
    
    lines.push('  },');
  }
  
  lines.push('};');
  lines.push('');
  lines.push('export default config;');
  lines.push('');
  
  return lines.join('\n');
}

function generateEnvTemplate(config: SetupConfig): string | null {
  const providers = config.features.memory?.provider;
  if (!providers || providers === 'ollama' || providers === 'text-only') {
    return null;
  }
  
  const lines: string[] = [
    '# Maskweaver API Keys',
    '# Add this to your .env file',
    '',
  ];
  
  if (providers === 'voyage') {
    lines.push('VOYAGE_API_KEY=your-voyage-api-key-here');
  } else if (providers === 'openai') {
    lines.push('OPENAI_API_KEY=your-openai-api-key-here');
  } else if (providers === 'openrouter') {
    lines.push('OPENROUTER_API_KEY=your-openrouter-api-key-here');
  }
  
  return lines.join('\n');
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 📊 Summary Display
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function showSummary(config: SetupConfig) {
  print();
  print(style.dim(box.bottomLine));
  print();
  print(style.bold(t('setupComplete')));
  print();
  print(style.bold(`${icon.check} ${t('summaryTitle')}`));
  print();
  
  const modeName = config.mode === 'beginner' ? t('beginner') : t('advanced');
  print(`  ${style.dim(t('mode') + ':')} ${modeName}`);
  print(`  ${style.dim(t('context') + ':')} ${t('activated')}`);
  
  const memoryStatus = config.features.memory?.enabled
    ? `${t('activated')} (${config.features.memory.provider})`
    : t('deactivated');
  print(`  ${style.dim(t('memory') + ':')} ${memoryStatus}`);
  
  const retrospectStatus = config.features.retrospect?.enabled ? t('activated') : t('deactivated');
  print(`  ${style.dim(t('retrospect') + ':')} ${retrospectStatus}`);
  
  const verifyStatus = config.features.verify?.enabled ? t('activated') : t('deactivated');
  print(`  ${style.dim(t('verify') + ':')} ${verifyStatus}`);
  
  print();
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 🚀 Main Flow
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

async function main() {
  showHeader();
  
  // Step 0: Language selection
  lang = await selectLanguage();
  showHeader(); // Refresh with selected language
  
  const config: SetupConfig = {
    mode: 'beginner',
    features: {
      context: { enabled: true },
    },
  };
  
  // Step 1: Mode selection
  config.mode = await selectMode();
  
  // Step 2: Context (always enabled)
  await setupContext();
  
  // Step 3 & 4: Memory + Provider
  const memoryConfig = await setupMemory();
  
  if (memoryConfig.enabled && memoryConfig.provider) {
    config.features.memory = {
      enabled: true,
      provider: memoryConfig.provider,
    };
    
    config.memory = {
      provider: memoryConfig.provider,
    };
    
    // API Key setup
    const apiKey = await setupApiKey(memoryConfig.provider);
    if (apiKey) {
      config.apiKeys = {
        ...config.apiKeys,
        [memoryConfig.provider]: apiKey,
      };
    }
  }
  
  // Step 5: Retrospect
  const retrospectEnabled = await setupRetrospect();
  if (retrospectEnabled) {
    config.features.retrospect = { enabled: true };
  }
  
  // Step 6: Verify
  const verifyEnabled = await setupVerify();
  if (verifyEnabled) {
    config.features.verify = { enabled: true };
  }
  
  // Show summary
  showSummary(config);
  
  // Generate and save config
  const configContent = generateConfig(config);
  const configPath = path.join(process.cwd(), 'maskweaver.config.ts');
  
  try {
    fs.writeFileSync(configPath, configContent, 'utf-8');
    print(style.success(`${icon.save} ${t('configSaved')}: ${style.bold('maskweaver.config.ts')}`));
    print(style.dim(`  ${t('canChange')}`));
  } catch (error) {
    print(style.error(`${icon.error} Failed to save config file`));
    print(style.dim(`  ${error}`));
  }
  
  // Show env template if needed
  const envTemplate = generateEnvTemplate(config);
  if (envTemplate && !config.apiKeys) {
    print();
    print(style.warning(`${icon.warning} Don't forget to set your API key:`));
    print(style.dim('  Add to .env file:'));
    print();
    envTemplate.split('\n').forEach(line => {
      if (line.startsWith('#') || line === '') {
        print(style.dim(`  ${line}`));
      } else {
        print(`  ${style.cyan(line)}`);
      }
    });
  }
  
  // Getting started
  print();
  print(style.bold(`${icon.rocket} ${t('gettingStarted')}`));
  print();
  print(style.dim('  ' + t('nextSteps')));
  print();
  print(style.dim(box.doubleLine));
  print();
  
  rl.close();
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 🎬 Entry Point
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

main().catch((error) => {
  console.error(style.error('\n❌ Setup failed:'));
  console.error(error);
  rl.close();
  process.exit(1);
});
