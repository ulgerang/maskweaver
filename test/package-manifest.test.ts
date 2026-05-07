import { describe, expect, test } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function readJson<T>(file: string): T {
  return JSON.parse(fs.readFileSync(path.join(repoRoot, file), "utf-8")) as T;
}

describe("opencode package manifest", () => {
  test("exposes an explicit server entrypoint for opencode plugin installs", () => {
    const pkg = readJson<{
      exports: Record<string, { import?: string; types?: string }>;
    }>("package.json");

    expect(pkg.exports["./server"]).toEqual({
      types: "./dist/plugin/index.d.ts",
      import: "./dist/plugin/index.js",
      require: "./dist/plugin/index.js",
    });
  });

  test("does not publish sourcemaps that point to missing TypeScript sources", () => {
    const tsconfig = readJson<{
      compilerOptions: {
        sourceMap?: boolean;
        declarationMap?: boolean;
        removeComments?: boolean;
      };
    }>("tsconfig.json");

    expect(tsconfig.compilerOptions.sourceMap).toBe(false);
    expect(tsconfig.compilerOptions.declarationMap).toBe(false);
    expect(tsconfig.compilerOptions.removeComments).toBe(true);
  });

  test("keeps the runtime version constant aligned with package.json", () => {
    const pkg = readJson<{ version: string }>("package.json");
    const versionSource = fs.readFileSync(path.join(repoRoot, "src", "version.ts"), "utf-8");

    expect(versionSource).toContain(`export const VERSION = '${pkg.version}'`);
  });

  test("ships a direct build command file for opencode slash-command discovery", () => {
    const commandPath = path.join(repoRoot, "assets", "commands", "build.md");
    const command = fs.readFileSync(commandPath, "utf-8");

    expect(command).toContain("description:");
    expect(command).toContain('command="build"');
  });

  test("command registry points to packaged markdown files", () => {
    const registry = readJson<{
      commands: Array<{ name: string; description: string; mdFile: string }>;
    }>("assets/commands/meta/commands.json");

    for (const command of registry.commands) {
      const commandPath = path.join(repoRoot, "assets", "commands", command.mdFile);
      expect(fs.existsSync(commandPath), `${command.name} md file is missing`).toBe(true);
      expect(command.description, `${command.name} description is empty`).toMatch(/\S/);
    }
  });

  test("packaged command markdown is readable and not mojibake", () => {
    const commandsDir = path.join(repoRoot, "assets", "commands");
    const commandFiles = fs
      .readdirSync(commandsDir)
      .filter((file) => file.endsWith(".md"));

    expect(commandFiles).toContain("weave-approve.md");
    expect(commandFiles).toContain("weave-archive.md");

    const mojibakePattern = /[�]|(?:[肄鍮吏媛濡諛湲怨])/u;
    for (const file of commandFiles) {
      const command = fs.readFileSync(path.join(commandsDir, file), "utf-8");
      expect(command, `${file} should have frontmatter`).toMatch(/^---\r?\n/);
      expect(command, `${file} contains mojibake`).not.toMatch(mojibakePattern);
    }
  });
});
