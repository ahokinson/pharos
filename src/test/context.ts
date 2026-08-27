import { claudeCodeAdapter } from "@adapters/claude-code";
import { mergeConfig } from "@config";
import { checkHealth, commandExists } from "@process";
import { DEFAULT_CTX_SIZE } from "@session/session";
import type { MiningState, Session } from "@session";
import { buildStyleKit } from "@metrics/style";
import type { MetricContext } from "@metrics/types";

export const DEFAULT_SESSION: Session = {
  model: "Sonnet",
  effort: "",
  thinking: false,
  fast: false,
  pct: 10,
  ctxSize: DEFAULT_CTX_SIZE,
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

export const DEFAULT_MINED: MiningState = {
  minedLines: 0,
  subagentLines: {},
  tokensIn: 0,
  tokensOut: 0,
  toolCounts: {},
  toolErrors: 0,
  ctxSamples: [],
  permissionMode: null,
};

/** A realistic MetricContext for tests, overridable per-field. */
export function makeCtx(opts: { session?: Partial<Session>; mined?: Partial<MiningState>; onPlan?: boolean; config?: ReturnType<typeof mergeConfig> } = {}): MetricContext {
  const config = opts.config ?? mergeConfig({});
  return {
    session: { ...DEFAULT_SESSION, ...opts.session },
    mined: { ...DEFAULT_MINED, ...opts.mined },
    onPlan: opts.onPlan ?? false,
    nowEpoch: 1_000_000,
    config,
    style: buildStyleKit(config),
    process: { commandExists, checkHealth },
    bucketFor: claudeCodeAdapter.bucketFor,
  };
}
