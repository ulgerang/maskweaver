#!/usr/bin/env node

/**
 * Maskweaver CLI Installer
 * 
 * Commands:
 * - maskweaver install   - Register plugin in opencode.json
 * - maskweaver uninstall - Remove plugin from opencode.json
 * - maskweaver status    - Show current installation status
 */

import { Command } from "commander";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { VERSION } from "../version.js";

// ============================================================================
// Constants
// ============================================================================

const PLUGIN_NAME = "@maskweaver/plugin";
const CONFIG_NAME = "opencode.json";

// ANSI Colors
const colors = {
  reset: "\x1b[0m",
  bright: "\x1b[1m",
  dim: "\x1b[2m",
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  magenta: "\x1b[35m",
  cyan: "\x1b[36m",
  white: "\x1b[37m",
};

// ============================================================================
// Utilities
// ============================================================================

function log(message: string, color?: keyof typeof colors) {
  const colorCode = color ? colors[color] : "";
  console.log(`${colorCode}${message}${colors.reset}`);
}

function success(message: string) {
  log(`✅ ${message}`, "green");
}

function error(message: string) {
  log(`❌ ${message}`, "red");
}

function info(message: string) {
  log(`ℹ️  ${message}`, "cyan");
}

function warning(message: string) {
  log(`⚠️  ${message}`, "yellow");
}

function getConfigPath(isLocal: boolean): string {
  if (isLocal) {
    return path.join(process.cwd(), ".opencode", CONFIG_NAME);
  } else {
    const homeDir = process.env.HOME || process.env.USERPROFILE || os.homedir();
    return path.join(homeDir, ".config", "opencode", CONFIG_NAME);
  }
}

function ensureDir(filePath: string) {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function readConfig(configPath: string): any {
  if (!fs.existsSync(configPath)) {
    return {};
  }
  
  try {
    const content = fs.readFileSync(configPath, "utf-8");
    return JSON.parse(content);
  } catch (err) {
    error(`설정 파일을 읽는 중 오류가 발생했습니다: ${configPath}`);
    throw err;
  }
}

function writeConfig(configPath: string, config: any) {
  try {
    ensureDir(configPath);
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2) + "\n", "utf-8");
  } catch (err) {
    error(`설정 파일을 쓰는 중 오류가 발생했습니다: ${configPath}`);
    throw err;
  }
}

function isPluginInstalled(config: any): boolean {
  if (!config.plugin || !Array.isArray(config.plugin)) {
    return false;
  }
  return config.plugin.includes(PLUGIN_NAME);
}

// ============================================================================
// Commands
// ============================================================================

async function installPlugin(options: { local?: boolean; tui?: boolean }) {
  const isLocal = options.local || false;
  const configPath = getConfigPath(isLocal);
  const scope = isLocal ? "프로젝트" : "전역";

  log("");
  log(`🎭 Maskweaver Installer`, "bright");
  log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`, "dim");
  info(`설치 위치: ${scope}`);
  info(`설정 파일: ${configPath}`);
  log("");

  try {
    // Read or create config
    let config = readConfig(configPath);

    // Initialize plugin array if not exists
    if (!config.plugin) {
      config.plugin = [];
    }

    // Check if already installed
    if (isPluginInstalled(config)) {
      warning(`플러그인이 이미 설치되어 있습니다.`);
      info(`현재 ${scope} 설정에 등록되어 있습니다: ${PLUGIN_NAME}`);
      log("");
      return;
    }

    // Add plugin
    config.plugin.push(PLUGIN_NAME);

    // Save config
    writeConfig(configPath, config);

    success(`플러그인이 성공적으로 설치되었습니다!`);
    log("");
    log(`📦 설치된 플러그인: ${PLUGIN_NAME}`, "bright");
    log(`📍 위치: ${configPath}`, "dim");
    log("");
    log(`다음 단계:`, "bright");
    log(`  1. OpenCode를 재시작하세요`, "dim");
    log(`  2. /maskweaver 명령으로 가면을 선택하세요`, "dim");
    log("");
  } catch (err) {
    error(`설치 중 오류가 발생했습니다.`);
    console.error(err);
    process.exit(1);
  }
}

async function uninstallPlugin(options: { local?: boolean; tui?: boolean }) {
  const isLocal = options.local || false;
  const configPath = getConfigPath(isLocal);
  const scope = isLocal ? "프로젝트" : "전역";

  log("");
  log(`🎭 Maskweaver Uninstaller`, "bright");
  log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`, "dim");
  info(`제거 위치: ${scope}`);
  info(`설정 파일: ${configPath}`);
  log("");

  try {
    // Read config
    if (!fs.existsSync(configPath)) {
      warning(`설정 파일이 존재하지 않습니다.`);
      info(`플러그인이 설치되어 있지 않습니다.`);
      log("");
      return;
    }

    let config = readConfig(configPath);

    // Check if installed
    if (!isPluginInstalled(config)) {
      warning(`플러그인이 설치되어 있지 않습니다.`);
      log("");
      return;
    }

    // Remove plugin
    config.plugin = config.plugin.filter((p: string) => p !== PLUGIN_NAME);

    // Save config
    writeConfig(configPath, config);

    success(`플러그인이 성공적으로 제거되었습니다.`);
    log("");

    // Cleanup notice
    log(`📋 정리 안내`, "bright");
    log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`, "dim");
    log("");
    log(`플러그인이 비활성화되었습니다.`, "dim");
    log("");
    log(`(선택) 설정 파일도 삭제하려면:`, "yellow");
    
    const homeDir = process.env.HOME || process.env.USERPROFILE || os.homedir();
    const globalConfig = path.join(homeDir, ".config", "opencode", "maskweaver.json");
    const localConfig = path.join(process.cwd(), ".opencode", "maskweaver.json");
    const localMasks = path.join(process.cwd(), ".opencode", "masks");
    const localAgents = path.join(process.cwd(), ".opencode", "agents");

    log(`  ${colors.dim}전역 설정:${colors.reset}`);
    log(`    - ${globalConfig}`, "dim");
    log("");
    log(`  ${colors.dim}프로젝트 설정:${colors.reset}`);
    log(`    - ${localConfig}`, "dim");
    log(`    - ${localMasks}/ (사용자 정의 가면)`, "dim");
    log(`    - ${localAgents}/ (사용자 정의 에이전트)`, "dim");
    log("");
  } catch (err) {
    error(`제거 중 오류가 발생했습니다.`);
    console.error(err);
    process.exit(1);
  }
}

async function showStatus(options: { local?: boolean }) {
  const isLocal = options.local || false;
  const configPath = getConfigPath(isLocal);
  const scope = isLocal ? "프로젝트" : "전역";

  log("");
  log(`🎭 Maskweaver Status`, "bright");
  log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`, "dim");
  log("");

  try {
    // Check global installation
    const globalPath = getConfigPath(false);
    const globalConfig = readConfig(globalPath);
    const globalInstalled = isPluginInstalled(globalConfig);

    log(`📦 전역 설치:`, "bright");
    if (globalInstalled) {
      success(`설치됨`);
      log(`   위치: ${globalPath}`, "dim");
    } else {
      log(`   ❌ 미설치`, "dim");
    }
    log("");

    // Check local installation
    const localPath = getConfigPath(true);
    const localInstalled = fs.existsSync(localPath) && isPluginInstalled(readConfig(localPath));

    log(`📂 프로젝트 설치:`, "bright");
    if (localInstalled) {
      success(`설치됨`);
      log(`   위치: ${localPath}`, "dim");
    } else {
      log(`   ❌ 미설치`, "dim");
    }
    log("");

    // Show plugin info
    if (globalInstalled || localInstalled) {
      log(`ℹ️  플러그인 정보:`, "cyan");
      log(`   이름: ${PLUGIN_NAME}`, "dim");
      log(`   버전: ${VERSION}`, "dim");
      log("");
    }

    // Installation hint
    if (!globalInstalled && !localInstalled) {
      log(`설치하려면:`, "yellow");
      log(`  maskweaver install          # 전역 설치`, "dim");
      log(`  maskweaver install --local  # 프로젝트 설치`, "dim");
      log("");
    }
  } catch (err) {
    error(`상태 확인 중 오류가 발생했습니다.`);
    console.error(err);
    process.exit(1);
  }
}

// ============================================================================
// CLI Program
// ============================================================================

const program = new Command();

program
  .name("maskweaver")
  .version(VERSION)
  .description(`🎭 Maskweaver Plugin Installer for OpenCode (v${VERSION})`);

program
  .command("install")
  .description("플러그인을 opencode.json에 등록합니다")
  .option("-g, --global", "전역 설정에 설치 (기본값)")
  .option("-l, --local", "프로젝트 설정에 설치")
  .option("--no-tui", "비대화형 모드")
  .action(async (options) => {
    await installPlugin(options);
  });

program
  .command("uninstall")
  .description("플러그인을 opencode.json에서 제거합니다")
  .option("-g, --global", "전역 설정에서 제거 (기본값)")
  .option("-l, --local", "프로젝트 설정에서 제거")
  .option("--no-tui", "비대화형 모드")
  .action(async (options) => {
    await uninstallPlugin(options);
  });

program
  .command("status")
  .description("현재 설치 상태를 표시합니다")
  .option("-g, --global", "전역 설정 상태 확인")
  .option("-l, --local", "프로젝트 설정 상태 확인")
  .action(async (options) => {
    await showStatus(options);
  });

// Default action: show help
program.action(() => {
  program.help();
});

// Parse command line arguments
program.parse(process.argv);

// Show help if no command provided
if (!process.argv.slice(2).length) {
  program.help();
}
