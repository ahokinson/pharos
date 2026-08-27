import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { mergeConfig } from "@config";
import { loadPlugins } from "@plugin/load";
import { makeCtx } from "@test/context";

describe("loadPlugins (filesystem-backed)", () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "pharos-plugin-test-"));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  test("loads a plugin's metrics by id, tracking source path", async () => {
    const pluginPath = join(dir, "plugin.ts");
    writeFileSync(
      pluginPath,
      `
      export default {
        metrics: [{ id: "greeting", compute: (ctx) => ctx.session.model, render: (value) => \`hi, \${value}\` }],
      };
      `,
    );

    const config = mergeConfig({ plugins: [pluginPath] });
    const resolved = await loadPlugins(config);

    expect(Object.keys(resolved.metrics)).toEqual(["greeting"]);
    expect(resolved.metrics.greeting?.render("Sonnet", makeCtx())).toBe("hi, Sonnet");
    expect(resolved.sources.greeting).toBe(pluginPath);
  });

  test("a plugin that throws on import is skipped, not fatal", async () => {
    const brokenPath = join(dir, "broken.ts");
    writeFileSync(brokenPath, `throw new Error("boom");`);
    const workingPath = join(dir, "working.ts");
    writeFileSync(workingPath, `export default { metrics: [{ id: "ok", compute: () => "fine", render: (v) => v }] };`);

    const config = mergeConfig({ plugins: [brokenPath, workingPath] });
    const resolved = await loadPlugins(config);

    expect(Object.keys(resolved.metrics)).toEqual(["ok"]);
  });

  test("no plugins configured resolves to an empty metric map", async () => {
    const config = mergeConfig({});
    const resolved = await loadPlugins(config);
    expect(resolved.metrics).toEqual({});
    expect(resolved.sources).toEqual({});
  });
});
