import { describe, expect, test } from "bun:test";
import { stripAnsi } from "@color";
import type { Config } from "@config";
import { mergeConfig } from "@config";
import { checkHealth, commandExists } from "@process";
import type { MiningState, Session } from "@session";
import { BUILTIN_METRICS } from "@metrics/builtins";
import { buildStyleKit } from "@metrics/style";
import type { MetricContext } from "@metrics/types";

const DEFAULT_SESSION: Session = {
  model: "Sonnet",
  effort: "",
  thinking: false,
  fast: false,
  pct: 10,
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

const DEFAULT_MINED: MiningState = {
  minedLines: 0,
  subagentLines: {},
  tokensIn: 0,
  tokensOut: 0,
  toolCounts: {},
  toolErrors: 0,
  ctxSamples: [],
  permissionMode: null,
};

function makeCtx(opts: { session?: Partial<Session>; mined?: Partial<MiningState>; onPlan?: boolean; config?: Config } = {}): MetricContext {
  const config = opts.config ?? mergeConfig({});
  return {
    session: { ...DEFAULT_SESSION, ...opts.session },
    mined: { ...DEFAULT_MINED, ...opts.mined },
    onPlan: opts.onPlan ?? false,
    nowEpoch: 1_000_000,
    config,
    style: buildStyleKit(config),
    process: { commandExists, checkHealth },
  };
}

describe("diff", () => {
  test("compute reads added/removed straight from session", () => {
    const c = makeCtx({ session: { added: 3, removed: 1 } });
    expect(BUILTIN_METRICS.diff.compute(c)).toEqual({ added: 3, removed: 1 });
  });

  test("render is muted for a zero side, colored for a nonzero side", () => {
    const c = makeCtx({ session: { added: 3, removed: 0 } });
    const text = stripAnsi(BUILTIN_METRICS.diff.render(BUILTIN_METRICS.diff.compute(c), c)!);
    expect(text).toBe("+3 -0");
  });
});

describe("cost", () => {
  test("hides below the 1-cent threshold", () => {
    const c = makeCtx({ session: { cost: 0.005 } });
    expect(BUILTIN_METRICS.cost.render(BUILTIN_METRICS.cost.compute(c), c)).toBe("");
  });

  test("mutes to overlay2 when onPlan", () => {
    const config = mergeConfig({});
    const c = makeCtx({ session: { cost: 20 }, onPlan: true, config });
    const text = BUILTIN_METRICS.cost.render(BUILTIN_METRICS.cost.compute(c), c)!;
    expect(text).toContain(config.palette.overlay2);
  });

  test("ramps by configured thresholds", () => {
    const config = mergeConfig({ metricStyle: { cost: { steps: [{ at: 10, color: "red" }], base: "green" } } });
    const c = makeCtx({ session: { cost: 15 }, config });
    const text = BUILTIN_METRICS.cost.render(BUILTIN_METRICS.cost.compute(c), c)!;
    expect(text).toContain(config.palette.red);
  });
});

describe("tokens", () => {
  test("hides when both in and out are zero", () => {
    const c = makeCtx();
    expect(BUILTIN_METRICS.tokens.render(BUILTIN_METRICS.tokens.compute(c), c)).toBe("");
  });

  test("renders humanized in/out counts", () => {
    const c = makeCtx({ mined: { tokensIn: 1500, tokensOut: 500 } });
    const text = stripAnsi(BUILTIN_METRICS.tokens.render(BUILTIN_METRICS.tokens.compute(c), c)!);
    expect(text).toContain("1k");
    expect(text).toContain("500");
  });
});

describe("context", () => {
  test("renders pct and size with no trend when there aren't enough samples", () => {
    const c = makeCtx({ session: { pct: 42, ctxSize: 200000 } });
    const text = stripAnsi(BUILTIN_METRICS.context.render(BUILTIN_METRICS.context.compute(c), c)!);
    expect(text).toBe("42% of 200k");
  });

  test("includes a trend word once there are enough samples", () => {
    const c = makeCtx({ mined: { ctxSamples: [0, 0, 0, 5000] } });
    const text = stripAnsi(BUILTIN_METRICS.context.render(BUILTIN_METRICS.context.compute(c), c)!);
    expect(text).toContain("rising");
  });
});

describe("model", () => {
  test("compute assembles model + effort + thinking + fast modifiers", () => {
    const c = makeCtx({ session: { model: "Sonnet", effort: "high", thinking: true, fast: true } });
    expect(BUILTIN_METRICS.model.compute(c)).toBe("Sonnet high thinking fast");
  });
});

describe("rate", () => {
  test("returns null when neither window has data", () => {
    const c = makeCtx();
    expect(BUILTIN_METRICS.rate.render(BUILTIN_METRICS.rate.compute(c), c)).toBeNull();
  });

  test("renders a single segment when only one window has data", () => {
    const c = makeCtx({ session: { rl5: 42.9 } });
    const text = stripAnsi(BUILTIN_METRICS.rate.render(BUILTIN_METRICS.rate.compute(c), c)!);
    expect(text).toBe("42% of 5h");
  });

  test("joins both windows with a mid-dot when both have data", () => {
    const c = makeCtx({ session: { rl5: 10, rl7: 20 } });
    const text = stripAnsi(BUILTIN_METRICS.rate.render(BUILTIN_METRICS.rate.compute(c), c)!);
    expect(text).toContain("10% of 5h");
    expect(text).toContain("20% of 7d");
    expect(text).toContain("·");
  });
});

describe("tools", () => {
  test("compute buckets raw tool counts", () => {
    const c = makeCtx({ mined: { toolCounts: { Edit: 2, Read: 1, Bash: 3 } } });
    expect(BUILTIN_METRICS.tools.compute(c)).toEqual({ edits: 2, reads: 1, runs: 3 });
  });

  test("render walks categoryOrder with configured glyphs", () => {
    const config = mergeConfig({
      metricStyle: { tools: { categoryOrder: ["runs", "edits"], glyphs: { runs: "R", edits: "E" } } },
    });
    const c = makeCtx({ mined: { toolCounts: { Edit: 2, Bash: 1 } }, config });
    const text = stripAnsi(BUILTIN_METRICS.tools.render(BUILTIN_METRICS.tools.compute(c), c)!);
    expect(text).toBe("R 1 E 2");
  });
});

describe("toolErrors", () => {
  test("hides when there are no failures", () => {
    const c = makeCtx({ mined: { toolErrors: 0 } });
    expect(BUILTIN_METRICS.toolErrors.render(BUILTIN_METRICS.toolErrors.compute(c), c)).toBeNull();
  });

  test("renders the failure count when nonzero", () => {
    const c = makeCtx({ mined: { toolErrors: 3 } });
    const text = stripAnsi(BUILTIN_METRICS.toolErrors.render(BUILTIN_METRICS.toolErrors.compute(c), c)!);
    expect(text).toContain("3");
  });
});

describe("permission", () => {
  test("hides in default mode (including no mode seen yet)", () => {
    expect(BUILTIN_METRICS.permission.render(null, makeCtx())).toBeNull();
    const c = makeCtx({ mined: { permissionMode: "default" } });
    expect(BUILTIN_METRICS.permission.render(BUILTIN_METRICS.permission.compute(c), c)).toBeNull();
  });

  test("renders bypassPermissions in its configured severity color", () => {
    const config = mergeConfig({});
    const c = makeCtx({ mined: { permissionMode: "bypassPermissions" }, config });
    const text = BUILTIN_METRICS.permission.render(BUILTIN_METRICS.permission.compute(c), c)!;
    expect(text).toContain(config.palette.red);
    expect(stripAnsi(text)).toContain("bypassPermissions");
  });

  test("an unrecognized mode still renders, in the default color", () => {
    const config = mergeConfig({});
    const c = makeCtx({ mined: { permissionMode: "someNewMode" }, config });
    const text = BUILTIN_METRICS.permission.render(BUILTIN_METRICS.permission.compute(c), c)!;
    expect(text).toContain(config.palette.overlay2);
    expect(stripAnsi(text)).toContain("someNewMode");
  });
});
