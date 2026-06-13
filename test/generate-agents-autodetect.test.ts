import { describe, expect, test } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { writeAutoDetectedConfig } from "../src/shared/generate-agents.js";

function makeTempDir(prefix: string) {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function withFakeOpencode<T>(fn: (sentinelPath: string) => T): T {
  const binDir = makeTempDir("maskweaver-fake-opencode-");
  const sentinelPath = path.join(binDir, "called.txt");
  const oldPath = process.env.PATH;
  const oldSentinel = process.env.OPENCODE_SENTINEL;

  fs.writeFileSync(
    path.join(binDir, "opencode.cmd"),
    '@echo off\r\necho %*>> "%OPENCODE_SENTINEL%"\r\nexit /b 1\r\n',
    "utf-8"
  );
  fs.writeFileSync(
    path.join(binDir, "opencode"),
    '#!/bin/sh\necho "$@" >> "$OPENCODE_SENTINEL"\nexit 1\n',
    { encoding: "utf-8", mode: 0o755 }
  );

  process.env.PATH = `${binDir}${path.delimiter}${oldPath ?? ""}`;
  process.env.OPENCODE_SENTINEL = sentinelPath;

  try {
    return fn(sentinelPath);
  } finally {
    process.env.PATH = oldPath;
    if (oldSentinel === undefined) {
      delete process.env.OPENCODE_SENTINEL;
    } else {
      process.env.OPENCODE_SENTINEL = oldSentinel;
    }
    fs.rmSync(binDir, { recursive: true, force: true });
  }
}

describe("writeAutoDetectedConfig", () => {
  test("does not call opencode when an existing pool config is present", () => {
    const projectDir = makeTempDir("maskweaver-existing-config-");
    const configPath = path.join(projectDir, "maskweaver.config.json");
    const existing = {
      dummyHumans: {
        pool: [
          {
            id: "existing",
            model: "opencode-go/deepseek-v4-flash",
            tier: "flash",
            maxConcurrent: 1,
          },
        ],
      },
    };
    fs.writeFileSync(configPath, JSON.stringify(existing, null, 2), "utf-8");

    try {
      withFakeOpencode((sentinelPath) => {
        const result = writeAutoDetectedConfig(projectDir);

        expect(result).toBeNull();
        expect(fs.existsSync(sentinelPath)).toBe(false);
        expect(JSON.parse(fs.readFileSync(configPath, "utf-8"))).toEqual(existing);
      });
    } finally {
      fs.rmSync(projectDir, { recursive: true, force: true });
    }
  });

  test("uses opencode.json model hints before any opencode CLI probing", () => {
    const projectDir = makeTempDir("maskweaver-opencode-config-");
    fs.writeFileSync(
      path.join(projectDir, "opencode.json"),
      JSON.stringify({ model: "zai-coding-plan/glm-5.1" }, null, 2),
      "utf-8"
    );

    try {
      withFakeOpencode((sentinelPath) => {
        const result = writeAutoDetectedConfig(projectDir);

        expect(result?.detection.primary).toBe("zai-coding-plan");
        expect(result?.detection.evidence).toContain("model: zai-coding-plan/glm-5.1");
        expect(fs.existsSync(sentinelPath)).toBe(false);

        const generated = JSON.parse(
          fs.readFileSync(path.join(projectDir, "maskweaver.config.json"), "utf-8")
        );
        expect(generated.dummyHumans.pool.some((entry: { model: string }) =>
          entry.model.startsWith("zai-coding-plan/")
        )).toBe(true);
      });
    } finally {
      fs.rmSync(projectDir, { recursive: true, force: true });
    }
  });

  test("defaults without probing opencode CLI during plugin startup", () => {
    const projectDir = makeTempDir("maskweaver-no-opencode-config-");

    try {
      withFakeOpencode((sentinelPath) => {
        const result = writeAutoDetectedConfig(projectDir);

        expect(result?.detection.primary).toBe("opencode-go");
        expect(result?.detection.evidence).toContain(
          "No opencode config found, defaulting to opencode-go"
        );
        expect(fs.existsSync(sentinelPath)).toBe(false);

        const generated = JSON.parse(
          fs.readFileSync(path.join(projectDir, "maskweaver.config.json"), "utf-8")
        );
        expect(generated.dummyHumans.pool.some((entry: { model: string }) =>
          entry.model.startsWith("opencode-go/")
        )).toBe(true);
      });
    } finally {
      fs.rmSync(projectDir, { recursive: true, force: true });
    }
  });
});
