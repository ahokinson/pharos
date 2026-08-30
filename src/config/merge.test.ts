import { describe, expect, test } from "bun:test";
import { DEFAULT_HEX } from "@color";
import { mergeConfig } from "@config/merge";
import { TemplateFormat, TemplateRenderer } from "@config/types";

describe("mergeConfig", () => {
  test("with no overrides, matches the documented defaults", () => {
    const config = mergeConfig({});
    expect(config.fieldOrder).toEqual([
      "diff",
      "tools",
      "toolErrors",
      "cost",
      "tokens",
      "context",
      "model",
      "rate",
    ]);
    expect(config.widths).toEqual({
      diff: 7,
      tools: 15,
      toolErrors: 0,
      cost: 6,
      tokens: 13,
      context: 0,
      permission: 0,
      model: 0,
      rate: 0,
    });
    expect(config.metricStyle).toEqual({});
    expect(config.pulse.tail).toBe(200);
    expect(config.plugins).toEqual([]);
    expect(config.palette.green).toBe(config.palette.green); // resolved, non-empty
    expect(config.palette.green.length).toBeGreaterThan(0);
  });

  test("palette override replaces only the named color", () => {
    const config = mergeConfig({ palette: { green: "#00ff00" } });
    expect(config.palette.green).toContain("0;255;0");
    // an untouched color still resolves to its default hex
    const untouchedRgb = parseInt(DEFAULT_HEX.red.slice(1, 3), 16);
    expect(config.palette.red).toContain(String(untouchedRgb));
  });

  test("fieldOrder override changes which fields render and their order", () => {
    const config = mergeConfig({ fieldOrder: ["model", "cost"] });
    expect(config.fieldOrder).toEqual(["model", "cost"]);
  });

  test("partial fieldSettings override merges onto the default for that field only", () => {
    const config = mergeConfig({ fieldSettings: { diff: { priority: 999 } } });
    expect(config.fieldSettings.diff).toEqual({ row: 1, priority: 999 });
    // untouched field keeps its default
    expect(config.fieldSettings.tools).toEqual({ row: 1, priority: 40 });
  });

  test("a fieldSettings entry for an id outside the 8 built-ins falls back to a generic default", () => {
    const config = mergeConfig({ fieldSettings: { myPlugin: { priority: 5 } } });
    expect(config.fieldSettings.myPlugin).toEqual({ row: 1, priority: 5 });
  });

  test("partial widths/context overrides merge onto defaults", () => {
    const config = mergeConfig({ widths: { diff: 20 }, context: { sampleCap: 10 } });
    expect(config.widths.diff).toBe(20);
    expect(config.widths.tools).toBe(15); // untouched default
    expect(config.context.sampleCap).toBe(10);
  });

  test("metricStyle override for an id passes through; untouched ids stay absent", () => {
    const config = mergeConfig({ metricStyle: { cost: { steps: [{ at: 100, color: "red" }], base: "green" } } });
    expect(config.metricStyle.cost).toEqual({ steps: [{ at: 100, color: "red" }], base: "green" });
    expect(config.metricStyle.tools).toBeUndefined();
  });

  test("metricStyle carries arbitrary per-id shapes, like tools' categoryOrder/glyphs", () => {
    const config = mergeConfig({ metricStyle: { tools: { categoryOrder: ["runs", "edits"], glyphs: { runs: "R" } } } });
    expect(config.metricStyle.tools).toEqual({ categoryOrder: ["runs", "edits"], glyphs: { runs: "R" } });
  });

  test("nested pulse.themeVars/fallbackColors merge without clobbering siblings", () => {
    const config = mergeConfig({ pulse: { tail: 50, themeVars: { think: "@my_blue" } } });
    expect(config.pulse.tail).toBe(50);
    expect(config.pulse.themeVars.think).toBe("@my_blue");
    expect(config.pulse.themeVars.tool).toBe("@thm_lavender"); // untouched default
    expect(config.pulse.fallbackColors.think).toBe("#8caaee"); // untouched default
  });

  test("plugins override expands env vars in each path", () => {
    process.env.PHAROS_TEST_VAR = "/custom/plugins";
    const config = mergeConfig({ plugins: ["$PHAROS_TEST_VAR/foo.ts", "/absolute/bar.ts"] });
    expect(config.plugins).toEqual(["/custom/plugins/foo.ts", "/absolute/bar.ts"]);
    delete process.env.PHAROS_TEST_VAR;
  });

  test("templates keep only complete line-based views and default their target to ansi", () => {
    const config = mergeConfig({
      templates: {
        sidecard: { lines: ["{{{tokens}}}"] },
        tmux: { format: TemplateFormat.Tmux, lines: ["{{{cost}}}"] },
        ignored: { format: TemplateFormat.Ansi },
      },
    });
    expect(config.templates).toEqual({
      sidecard: { format: TemplateFormat.Ansi, renderer: TemplateRenderer.Ansi, lines: ["{{{tokens}}}"] },
      tmux: { format: TemplateFormat.Tmux, renderer: TemplateRenderer.Ansi, lines: ["{{{cost}}}"] },
    });
  });
});
