import { afterEach, describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { generateBootstrapBundle } from "@bootstrap/init";

const dirs: string[] = [];
afterEach(() => {
  while (dirs.length) rmSync(dirs.pop()!, { recursive: true, force: true });
});

describe("generateBootstrapBundle", () => {
  test("writes a complete, auditable bundle for every supported harness", async () => {
    const root = mkdtempSync(join(tmpdir(), "pharos-init-"));
    dirs.push(root);
    const dir = join(root, "bundle");
    expect(await generateBootstrapBundle(["--harness", "all", "--output", dir])).toBe(0);

    const manifest = JSON.parse(await Bun.file(join(dir, "manifest.json")).text()) as { harnesses: string[]; artifacts: { path: string }[] };
    expect(manifest.harnesses).toEqual(["claude", "codex", "opencode", "hermes"]);
    expect(manifest.artifacts.map((artifact) => artifact.path)).toEqual([
      "claude/settings.pharos.json", "codex/hooks.json", "opencode/pharos-bridge.ts", "hermes/pharos", "hermes/hooks.pharos.yaml",
    ]);
    expect(JSON.parse(await Bun.file(join(dir, "codex/hooks.json")).text()).hooks.Stop).toBeArray();
    expect(await Bun.file(join(dir, "hermes/pharos")).text()).toContain("post_tool_call");
  });

  test("does not replace an existing destination without --force", async () => {
    const root = mkdtempSync(join(tmpdir(), "pharos-init-"));
    dirs.push(root);
    const dir = join(root, "bundle");
    expect(await generateBootstrapBundle(["--harness=claude", `--output=${dir}`])).toBe(0);
    expect(existsSync(join(dir, "claude", "settings.pharos.json"))).toBeTrue();
    expect(await generateBootstrapBundle(["--harness=codex", `--output=${dir}`])).toBe(1);
    expect(existsSync(join(dir, "codex", "hooks.json"))).toBeFalse();
  });
});
