import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { mergeConfig } from "@config";
import { runList } from "@metrics/discover";

describe("runList", () => {
  let dir: string;
  let logs: string[];
  let originalLog: typeof console.log;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "pharos-list-test-"));
    logs = [];
    originalLog = console.log;
    console.log = (msg?: unknown) => {
      logs.push(String(msg));
    };
  });

  afterEach(() => {
    console.log = originalLog;
    rmSync(dir, { recursive: true, force: true });
  });

  test("lists built-in metrics, enabled and disabled alike", async () => {
    const config = mergeConfig({ fieldOrder: ["cost"] });
    await runList([], config);
    const output = logs.join("\n");
    expect(output).toContain("cost");
    expect(output).toContain("tools"); // present but disabled, not in fieldOrder
  });

  test("--json includes a plugin-sourced metric with its source path and enabled state", async () => {
    const pluginPath = join(dir, "plugin.ts");
    writeFileSync(
      pluginPath,
      `export default { metrics: [{ id: "custom", label: "Custom", compute: () => "x", render: (v) => v }] };`,
    );
    const config = mergeConfig({ plugins: [pluginPath] });
    await runList(["--json"], config);
    const parsed = JSON.parse(logs.join(""));
    const custom = parsed.metrics.find((m: { id: string }) => m.id === "custom");
    expect(custom.source).toBe(`plugin:${pluginPath}`);
    expect(custom.enabled).toBe(false); // not in fieldOrder
  });
});
