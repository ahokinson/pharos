import { afterEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { claudeAdapter } from "@adapters/claude";
import { stripAnsi } from "@color";
import { mergeConfig } from "@config";
import { buildStyleKit } from "@metrics";
import type { MetricContext } from "@metrics";
import { checkHealth, commandExists } from "@process";
import type { MiningState, Session } from "@session";
import guardsPlugin from "./guards";

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
  sessionId: "smoke-test",
};

const MINED: MiningState = {
  minedLines: 0,
  subagentLines: {},
  tokensIn: 0,
  tokensOut: 0,
  linesAdded: 0,
  linesRemoved: 0,
  toolCounts: {},
  toolErrors: 0,
  ctxSamples: [],
  permissionMode: null,
};

describe("examples/guards.ts", () => {
  const realStateHome = process.env.XDG_STATE_HOME;

  afterEach(() => {
    // Bun runs all test files in one process; without this restore, the
    // override leaks into whatever test file runs after this one.
    if (realStateHome === undefined) delete process.env.XDG_STATE_HOME;
    else process.env.XDG_STATE_HOME = realStateHome;
  });

  test("plugin shape matches what loadPlugins expects", () => {
    expect(guardsPlugin.metrics).toHaveLength(1);
    expect(guardsPlugin.metrics![0]!.id).toBe("guards");
  });

  test("renders a shield plus one count per configured guard, using ctx.process for liveness", () => {
    const dir = mkdtempSync(join(tmpdir(), "pharos-example-guards-test-"));
    const stateDir = join(dir, "guard");
    mkdirSync(stateDir, { recursive: true });
    writeFileSync(join(stateDir, "violations-smoke-test.state"), "risk=0\npolicy=2\njudgement=0\n");

    // Stand in "sh" (guaranteed present) for the real "cerberus" binary so
    // this test is hermetic; override degradedSentinel to a definitely-
    // absent path so nothing is force-degraded by a stale local sentinel.
    const config = mergeConfig({
      metricStyle: {
        guards: {
          degradedSentinel: join(dir, "not-a-real-sentinel"),
          order: ["risk", "policy", "judgement"],
          definitions: {
            risk: { color: "red", binary: "sh", requirements: [] },
            policy: { color: "peach", binary: "sh", requirements: [] },
            judgement: { color: "yellow", binary: "sh", requirements: [] },
          },
        },
      },
    });
    process.env.XDG_STATE_HOME = dir;

    const ctx: MetricContext = {
      session: SESSION,
      mined: MINED,
      onPlan: false,
      nowEpoch: 0,
      config,
      style: buildStyleKit(config),
      process: { commandExists, checkHealth },
      bucketFor: claudeAdapter.bucketFor,
    };

    const metric = guardsPlugin.metrics![0]!;
    const raw = metric.render(metric.compute(ctx), ctx)!;

    // Counts render in `order`, so position alone identifies each guard.
    // Each is padded to 2 digits so one crossing into double digits doesn't
    // nudge the ones after it sideways.
    expect(stripAnsi(raw)).toEndWith("  0  2  0");

    // Color is the only other thing distinguishing them now that the
    // per-guard glyphs are gone, so the nonzero count has to actually carry
    // its guard's color rather than the dim zero treatment.
    const style = buildStyleKit(config);
    expect(raw).toContain(`${style.color("peach")} 2`);
    expect(raw).toContain(`${style.color("overlay2")} 0`);

    rmSync(dir, { recursive: true, force: true });
  });
});
