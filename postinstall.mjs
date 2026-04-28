// postinstall.mjs
// Runs after npm install to verify OpenCode compatibility

import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const MIN_OPENCODE_VERSION = "1.0.0";

/**
 * Parse version string into numeric parts
 */
function parseVersion(version) {
  return version
    .replace(/^v/, "")
    .split("-")[0]
    .split(".")
    .map((part) => Number.parseInt(part, 10) || 0);
}

/**
 * Compare two version strings
 */
function compareVersions(current, minimum) {
  const currentParts = parseVersion(current);
  const minimumParts = parseVersion(minimum);
  const length = Math.max(currentParts.length, minimumParts.length);

  for (let index = 0; index < length; index++) {
    const currentPart = currentParts[index] ?? 0;
    const minimumPart = minimumParts[index] ?? 0;
    if (currentPart > minimumPart) return true;
    if (currentPart < minimumPart) return false;
  }

  return true;
}

/**
 * Check if opencode version meets minimum requirement
 */
function checkOpenCodeVersion() {
  try {
    const result = spawnSync("opencode", ["--version"], {
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "ignore"],
      timeout: 5000,
    });

    if (result.error) {
      return { ok: null, version: null };
    }

    const version = result.stdout.trim();
    const ok = compareVersions(version, MIN_OPENCODE_VERSION);
    return { ok, version };
  } catch {
    return { ok: null, version: null };
  }
}

function getPackageVersion() {
  try {
    const dir = fileURLToPath(new URL(".", import.meta.url));
    const pkg = JSON.parse(readFileSync(new URL("package.json", import.meta.url), "utf8"));
    return pkg.version || "unknown";
  } catch {
    return "unknown";
  }
}

function main() {
  const pkgVersion = getPackageVersion();
  const versionCheck = checkOpenCodeVersion();

  if (versionCheck.ok === null) {
    console.log(`⚠ maskweaver v${pkgVersion}: OpenCode를 감지할 수 없습니다.`);
    console.log(`  OpenCode가 설치되어 있지 않다면 https://opencode.ai/docs 를 참조하세요.`);
    console.log(`  maskweaver는 OpenCode 플러그인으로 동작합니다.`);
    return;
  }

  if (!versionCheck.ok) {
    console.warn(`⚠ maskweaver v${pkgVersion}: OpenCode >= ${MIN_OPENCODE_VERSION} 이 필요합니다.`);
    console.warn(`  감지된 버전: ${versionCheck.version}`);
    console.warn(`  최신 버전으로 업데이트하세요: opencode --upgrade`);
    return;
  }

  if (versionCheck.version) {
    console.log(`✓ maskweaver v${pkgVersion}: OpenCode ${versionCheck.version} 호환됨`);
  }

  console.log(`  maskweaver install 로 플러그인을 등록하세요.`);
}

main();
