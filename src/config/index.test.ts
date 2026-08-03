import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadConfig } from "@config";

describe("loadConfig (filesystem-backed)", () => {
  let dir: string;
  const originalXdgConfig = process.env.XDG_CONFIG_HOME;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "pharos-config-test-"));
    process.env.XDG_CONFIG_HOME = dir;
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
    if (originalXdgConfig === undefined) delete process.env.XDG_CONFIG_HOME;
    else process.env.XDG_CONFIG_HOME = originalXdgConfig;
  });

  test("falls back to defaults when no config file exists", async () => {
    const config = await loadConfig();
    expect(config.fieldOrder).toEqual([
      "diff",
      "tools",
      "toolErrors",
      "cost",
      "tokens",
      "context",
      "permission",
      "model",
      "rate",
    ]);
  });

  test("falls back to defaults when the config file is invalid JSON", async () => {
    mkdirSync(join(dir, "pharos"), { recursive: true });
    writeFileSync(join(dir, "pharos", "config.json"), "{not valid json");
    const config = await loadConfig();
    expect(config.widths.diff).toBe(7);
  });

  test("loads and merges a real config file", async () => {
    mkdirSync(join(dir, "pharos"), { recursive: true });
    writeFileSync(join(dir, "pharos", "config.json"), JSON.stringify({ widths: { diff: 99 }, fieldOrder: ["model"] }));
    const config = await loadConfig();
    expect(config.widths.diff).toBe(99);
    expect(config.fieldOrder).toEqual(["model"]);
  });
});
