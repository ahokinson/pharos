import { describe, expect, test } from "bun:test";
import { mergeConfig } from "@config";
import type { ResolvedPlugins } from "@plugin";
import { checkHealth, commandExists } from "@process";
import type { MiningState, Session } from "@session";
import { buildFieldTexts, buildRegistry } from "@metrics/registry";
import { buildStyleKit } from "@metrics/style";
import type { Metric, MetricContext } from "@metrics/types";

function emptyResolved(overrides: Partial<ResolvedPlugins> = {}): ResolvedPlugins {
  return { metrics: {}, sources: {}, ...overrides };
}

const SESSION: Session = {
  model: "Sonnet",
  effort: "",
  thinking: false,
  fast: false,
  pct: 0,
  ctxSize: 200000,
  cost: 0,
  added: 0,
  removed: 0,
  rl5: null,
  rl5Reset: null,
  rl7: null,
  rl7Reset: null,
  transcript: "",
  sessionId: "test",
};

const MINED: MiningState = {
  minedLines: 0,
  subagentLines: {},
  tokensIn: 0,
  tokensOut: 0,
  toolCounts: {},
  toolErrors: 0,
  ctxSamples: [],
  permissionMode: null,
};

function makeCtx(config = mergeConfig({})): MetricContext {
  return {
    session: SESSION,
    mined: MINED,
    onPlan: false,
    nowEpoch: 0,
    config,
    style: buildStyleKit(config),
    process: { commandExists, checkHealth },
  };
}

describe("buildRegistry", () => {
  test("a plugin metric id shadows a built-in with the same id", () => {
    const config = mergeConfig({ fieldOrder: ["cost"] });
    const custom: Metric<string> = { id: "cost", compute: () => "custom", render: (v) => v };
    const registry = buildRegistry(config, emptyResolved({ metrics: { cost: custom } }));
    expect(registry.cost).toBe(custom);
  });

  test("backfills row/priority/width from a plugin metric's own defaults when config doesn't set them", () => {
    const config = mergeConfig({});
    const custom: Metric<string> = { id: "myPlugin", row: 2, priority: 5, width: 10, compute: () => "x", render: (v) => v };
    buildRegistry(config, emptyResolved({ metrics: { myPlugin: custom } }));
    expect(config.fieldSettings.myPlugin).toEqual({ row: 2, priority: 5 });
    expect(config.widths.myPlugin).toBe(10);
  });

  test("leaves an already-configured id's fieldSettings/widths alone", () => {
    const config = mergeConfig({ fieldSettings: { myPlugin: { row: 1, priority: 99 } }, widths: { myPlugin: 3 } });
    const custom: Metric<string> = { id: "myPlugin", row: 2, priority: 5, width: 10, compute: () => "x", render: (v) => v };
    buildRegistry(config, emptyResolved({ metrics: { myPlugin: custom } }));
    expect(config.fieldSettings.myPlugin).toEqual({ row: 1, priority: 99 });
    expect(config.widths.myPlugin).toBe(3);
  });
});

describe("buildFieldTexts", () => {
  test("a throwing metric is hidden, not fatal", () => {
    const config = mergeConfig({ fieldOrder: ["broken"] });
    const broken: Metric<undefined> = {
      id: "broken",
      compute: () => {
        throw new Error("boom");
      },
      render: () => "unreachable",
    };
    const registry = buildRegistry(config, emptyResolved({ metrics: { broken } }));
    const texts = buildFieldTexts(makeCtx(config), registry);
    expect(texts.broken).toBeNull();
  });

  test("skips ids in fieldOrder that aren't in the registry", () => {
    const config = mergeConfig({ fieldOrder: ["ghost"] });
    const texts = buildFieldTexts(makeCtx(config), buildRegistry(config, emptyResolved()));
    expect(texts.ghost).toBeUndefined();
  });
});
