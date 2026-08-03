import { describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
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
  toolCounts: {},
  toolErrors: 0,
  ctxSamples: [],
  permissionMode: null,
};

describe("examples/guards.ts", () => {
  test("plugin shape matches what loadPlugins expects", () => {
    expect(guardsPlugin.metrics).toHaveLength(1);
    expect(guardsPlugin.metrics![0]!.id).toBe("guards");
  });

  test("renders a shield plus a cell per configured guard, using ctx.process for liveness", () => {
    const dir = mkdtempSync(join(tmpdir(), "pharos-example-guards-test-"));
    const stateDir = join(dir, "guard");
    mkdirSync(stateDir, { recursive: true });
    writeFileSync(join(stateDir, "violations-smoke-test.state"), "tirith=0\ncupcake=2\ncontext=0\n");

    // Stand in "sh" (guaranteed present) for the real "cerberus" binary so
    // this test is hermetic; override degradedSentinel to a definitely-
    // absent path so nothing is force-degraded by a stale local sentinel.
    const config = mergeConfig({
      metricStyle: {
        guards: {
          degradedSentinel: join(dir, "not-a-real-sentinel"),
          order: ["tirith", "cupcake", "context"],
          definitions: {
            tirith: { glyph: "T", color: "red", binary: "sh", requirements: [] },
            cupcake: { glyph: "C", color: "peach", binary: "sh", requirements: [] },
            context: { glyph: "P", color: "yellow", binary: "sh", requirements: [] },
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
    };

    const metric = guardsPlugin.metrics![0]!;
    const text = stripAnsi(metric.render(metric.compute(ctx), ctx)!);

    expect(text).toContain("T 0");
    expect(text).toContain("C 2");
    expect(text).toContain("P 0");

    rmSync(dir, { recursive: true, force: true });
  });
});
