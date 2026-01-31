#!/usr/bin/env bun
/**
 * Build script for maskweaver monorepo
 * Builds all packages in dependency order
 */

import { execSync } from "child_process";
import { existsSync, readFileSync } from "fs";
import { join } from "path";

const PACKAGES = [
  "shared",
  "core", 
  "i18n",
  "memory",
  "context",
  "retrospect",
  "verify",
  "plugin",
];

console.log("🔨 Building Maskweaver packages...\n");

let successCount = 0;
let skipCount = 0;

for (const pkg of PACKAGES) {
  console.log(`📦 Building @maskweaver/${pkg}...`);
  
  const pkgDir = join("packages", pkg);
  const pkgJsonPath = join(pkgDir, "package.json");
  
  if (existsSync(pkgJsonPath)) {
    const pkgJson = JSON.parse(readFileSync(pkgJsonPath, "utf-8"));
    const buildCmd = pkgJson.scripts?.build;
    
    if (buildCmd) {
      try {
        execSync(buildCmd, { 
          cwd: pkgDir,
          stdio: "inherit"
        });
        console.log(`✅ ${pkg} built successfully\n`);
        successCount++;
      } catch (error) {
        console.error(`❌ Failed to build ${pkg}`);
        process.exit(1);
      }
    } else {
      console.log(`⚠️  No build script found for ${pkg}\n`);
      skipCount++;
    }
  } else {
    console.log(`⚠️  package.json not found for ${pkg}\n`);
    skipCount++;
  }
}

console.log("✨ Build Summary:");
console.log(`   ✅ Successfully built: ${successCount} packages`);
if (skipCount > 0) {
  console.log(`   ⚠️  Skipped: ${skipCount} packages`);
}
console.log("\n🎉 All packages built successfully!");
