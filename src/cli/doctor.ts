import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { spawnSync } from "node:child_process";
import { VERSION } from "../version.js";

// ============================================================================
// Constants
// ============================================================================

const MIN_OPENCODE_VERSION = "1.0.0";
const PLUGIN_NAME = "maskweaver";

const colors = {
  reset: "\x1b[0m",
  bright: "\x1b[1m",
  dim: "\x1b[2m",
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  cyan: "\x1b[36m",
};

// ============================================================================
// Types
// ============================================================================

interface CheckResult {
  status: "pass" | "fail" | "warn";
  name: string;
  message: string;
  hint?: string;
}

interface DoctorReport {
  results: CheckResult[];
  passed: number;
  failed: number;
  warnings: number;
}

// ============================================================================
// Utilities
// ============================================================================

function icon(status: "pass" | "fail" | "warn"): string {
  switch (status) {
    case "pass": return `${colors.green}✓${colors.reset}`;
    case "fail": return `${colors.red}✗${colors.reset}`;
    case "warn": return `${colors.yellow}⚠${colors.reset}`;
  }
}

function getConfigDir(): string {
  const homeDir = process.env.HOME || process.env.USERPROFILE || os.homedir();
  return path.join(homeDir, ".config", "opencode");
}

function getProjectDir(): string {
  return path.join(process.cwd(), ".opencode");
}

function parseVersion(version: string): number[] {
  return version
    .replace(/^v/, "")
    .split("-")[0]
    .split(".")
    .map((part) => Number.parseInt(part, 10) || 0);
}

function compareVersions(current: string, minimum: string): boolean {
  const currentParts = parseVersion(current);
  const minimumParts = parseVersion(minimum);
  const length = Math.max(currentParts.length, minimumParts.length);

  for (let i = 0; i < length; i++) {
    const c = currentParts[i] ?? 0;
    const m = minimumParts[i] ?? 0;
    if (c > m) return true;
    if (c < m) return false;
  }
  return true;
}

// ============================================================================
// Checks
// ============================================================================

function checkOpenCodeVersion(): CheckResult {
  try {
    const result = spawnSync("opencode", ["--version"], {
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "ignore"],
    });
    if (result.error) {
      return {
        status: "fail",
        name: "OpenCode Version",
        message: "OpenCode가 설치되지 않았거나 PATH에 없습니다",
        hint: "https://opencode.ai/docs 에서 설치하세요",
      };
    }

    const version = result.stdout.trim();
    const ok = compareVersions(version, MIN_OPENCODE_VERSION);

    if (ok) {
      return {
        status: "pass",
        name: "OpenCode Version",
        message: `OpenCode ${version} (최소 요구: ${MIN_OPENCODE_VERSION})`,
      };
    } else {
      return {
        status: "fail",
        name: "OpenCode Version",
        message: `OpenCode ${version} — 최소 ${MIN_OPENCODE_VERSION} 이상이 필요합니다`,
        hint: "opencode --upgrade 로 업데이트하세요",
      };
    }
  } catch {
    return {
      status: "fail",
      name: "OpenCode Version",
      message: "OpenCode를 확인할 수 없습니다",
      hint: "https://opencode.ai/docs",
    };
  }
}

function checkPluginRegistration(): CheckResult {
  const configDir = getConfigDir();
  const projectDir = getProjectDir();

  const globalConfig = path.join(configDir, "opencode.json");
  const projectConfig = path.join(projectDir, "opencode.json");

  let foundIn = "";
  let legacyEntry = "";

  // Check global
  if (fs.existsSync(globalConfig)) {
    try {
      const config = JSON.parse(fs.readFileSync(globalConfig, "utf-8"));
      if (config.plugin && Array.isArray(config.plugin)) {
        if (config.plugin.includes(PLUGIN_NAME)) foundIn = "전역";
        else if (config.plugin.includes("maskweaver/plugin") || config.plugin.includes("@maskweaver/plugin")) {
          foundIn = "전역";
          legacyEntry = config.plugin.find((p: string) => p !== "maskweaver" && (p === "maskweaver/plugin" || p === "@maskweaver/plugin"));
        }
      }
    } catch { /* ignore */ }
  }

  // Check project
  if (!foundIn && fs.existsSync(projectConfig)) {
    try {
      const config = JSON.parse(fs.readFileSync(projectConfig, "utf-8"));
      if (config.plugin && Array.isArray(config.plugin)) {
        if (config.plugin.includes(PLUGIN_NAME)) foundIn = "프로젝트";
        else if (config.plugin.includes("maskweaver/plugin") || config.plugin.includes("@maskweaver/plugin")) {
          foundIn = "프로젝트";
          legacyEntry = config.plugin.find((p: string) => p !== "maskweaver" && (p === "maskweaver/plugin" || p === "@maskweaver/plugin"));
        }
      }
    } catch { /* ignore */ }
  }

  if (foundIn && legacyEntry) {
    return {
      status: "warn",
      name: "플러그인 등록",
      message: `${foundIn} 설정에 등록됨 (구형 항목: "${legacyEntry}")`,
      hint: "maskweaver install 로 마이그레이션하세요",
    };
  }

  if (foundIn) {
    return {
      status: "pass",
      name: "플러그인 등록",
      message: `${foundIn} 설정에 등록됨`,
    };
  }

  return {
    status: "fail",
    name: "플러그인 등록",
    message: "opencode.json에 등록되지 않음",
    hint: "maskweaver install 로 설치하세요",
  };
}

function checkConfigFile(): CheckResult {
  const configDir = getConfigDir();
  const projectDir = getProjectDir();

  const globalJsonc = path.join(configDir, "maskweaver.jsonc");
  const globalJson = path.join(configDir, "maskweaver.json");
  const projectJsonc = path.join(projectDir, "maskweaver.jsonc");
  const projectJson = path.join(projectDir, "maskweaver.json");

  const configs = [globalJsonc, globalJson, projectJsonc, projectJson];
  const found = configs.filter((f: string) => fs.existsSync(f));

  if (found.length > 0) {
    return {
      status: "pass",
      name: "플러그인 설정",
      message: `설정 파일 있음: ${found.map(f => path.basename(path.dirname(f)) + "/" + path.basename(f)).join(", ")}`,
    };
  }

  return {
    status: "warn",
    name: "플러그인 설정",
    message: "maskweaver.json[c] 설정 파일이 없습니다 (기본값 사용)",
    hint: "선택사항입니다 — maskweaver.jsonc를 만들어 가면/툴을 커스터마이즈할 수 있습니다",
  };
}

function checkMasksDirectory(): CheckResult {
  const configDir = getConfigDir();
  const projectDir = getProjectDir();

  const globalMasks = path.join(configDir, "masks");
  const projectMasks = path.join(projectDir, "masks");

  let count = 0;
  let location = "";

  for (const [label, dir] of [["전역", globalMasks], ["프로젝트", projectMasks]] as const) {
    if (fs.existsSync(dir)) {
      try {
        const indexPath = path.join(dir, "index.json");
        if (fs.existsSync(indexPath)) {
          const catalog = JSON.parse(fs.readFileSync(indexPath, "utf-8"));
          let total = 0;
          for (const cat of Object.values(catalog.categories || {}) as any[]) {
            total += (cat as any).masks?.length || 0;
          }
          count += total;
          location = label;
        }
      } catch { /* ignore */ }
    }
  }

  if (count > 0) {
    return {
      status: "pass",
      name: "가면 디렉토리",
      message: `${location} 디렉토리에 ${count}개 가면 있음`,
    };
  }

  return {
    status: "warn",
    name: "가면 디렉토리",
    message: "가면이 설치되지 않았습니다",
    hint: "OpenCode를 재시작하면 maskweaver가 자동으로 가면을 설치합니다",
  };
}

function checkAgentFiles(): CheckResult {
  const configDir = getConfigDir();
  const projectDir = getProjectDir();

  let count = 0;

  for (const dir of [path.join(configDir, "agents"), path.join(projectDir, "agents")]) {
    if (fs.existsSync(dir)) {
      try {
        const files = fs.readdirSync(dir).filter((f: string) => f.endsWith(".md"));
        count += files.length;
      } catch { /* ignore */ }
    }
  }

  if (count > 0) {
    return {
      status: "pass",
      name: "에이전트 파일",
      message: `${count}개 에이전트 파일 있음`,
    };
  }

  return {
    status: "warn",
    name: "에이전트 파일",
    message: "에이전트 파일이 없습니다",
    hint: "OpenCode를 재시작하면 maskweaver가 자동으로 에이전트를 설치합니다",
  };
}

function checkCommandFiles(): CheckResult {
  const configDir = getConfigDir();
  const projectDir = getProjectDir();

  let count = 0;

  for (const dir of [path.join(configDir, "commands"), path.join(projectDir, "commands")]) {
    if (fs.existsSync(dir)) {
      try {
        const files = fs.readdirSync(dir).filter((f: string) => f.endsWith(".md"));
        count += files.length;
      } catch { /* ignore */ }
    }
  }

  if (count > 0) {
    return {
      status: "pass",
      name: "커맨드 파일",
      message: `${count}개 커맨드 파일 있음`,
    };
  }

  return {
    status: "warn",
    name: "커맨드 파일",
    message: "커맨드 파일이 없습니다",
    hint: "OpenCode를 재시작하면 maskweaver가 자동으로 커맨드를 설치합니다",
  };
}

function checkGdcIntegration(): CheckResult {
  const projectDir = getProjectDir();

  // Check for GDC-related files in .opencode
  const weaveDir = path.join(projectDir, "weave");
  if (fs.existsSync(weaveDir)) {
    return {
      status: "pass",
      name: "Weave/GDC 통합",
      message: "weave/ 디렉토리 있음",
    };
  }

  // Check for AGENTS.md (used by /init-deep)
  const agentsMd = path.join(process.cwd(), "AGENTS.md");
  if (fs.existsSync(agentsMd)) {
    return {
      status: "pass",
      name: "Weave/GDC 통합",
      message: "AGENTS.md 있음 — 프로젝트가 초기화됨",
    };
  }

  return {
    status: "warn",
    name: "Weave/GDC 통합",
    message: "Weave/GDC 워크플로우가 초기화되지 않음",
    hint: "/weave init 으로 초기화하세요",
  };
}

// ============================================================================
// Doctor Command
// ============================================================================

export function runDoctor(): DoctorReport {
  const results: CheckResult[] = [
    checkOpenCodeVersion(),
    checkPluginRegistration(),
    checkConfigFile(),
    checkMasksDirectory(),
    checkAgentFiles(),
    checkCommandFiles(),
    checkGdcIntegration(),
  ];

  return {
    results,
    passed: results.filter(r => r.status === "pass").length,
    failed: results.filter(r => r.status === "fail").length,
    warnings: results.filter(r => r.status === "warn").length,
  };
}

export function printDoctorReport(report: DoctorReport): void {
  console.log("");
  console.log(`${colors.bright}🎭 Maskweaver Doctor v${VERSION}${colors.reset}`);
  console.log(`${colors.dim}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${colors.reset}`);
  console.log("");

  for (const result of report.results) {
    const prefix = icon(result.status);
    console.log(`  ${prefix} ${result.name}`);
    console.log(`     ${colors.dim}${result.message}${colors.reset}`);
    if (result.hint) {
      console.log(`     ${colors.yellow}→ ${result.hint}${colors.reset}`);
    }
    console.log("");
  }

  console.log(`${colors.dim}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${colors.reset}`);
  console.log("");
  console.log(`  ${colors.green}통과: ${report.passed}${colors.reset}  ${colors.red}실패: ${report.failed}${colors.reset}  ${colors.yellow}경고: ${report.warnings}${colors.reset}`);
  console.log("");

  if (report.failed > 0) {
    console.log(`${colors.yellow}일부 진단이 실패했습니다. 위 안내를 따라 문제를 해결하세요.${colors.reset}`);
    console.log("");
  } else if (report.warnings > 0) {
    console.log(`${colors.green}모든 핵심 진단을 통과했습니다. 경고는 선택사항입니다.${colors.reset}`);
    console.log("");
  } else {
    console.log(`${colors.green}🎉 모든 진단을 통과했습니다! Maskweaver가 올바르게 설정되었습니다.${colors.reset}`);
    console.log("");
  }
}
