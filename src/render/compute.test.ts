import { describe, expect, test } from "bun:test";
import { enrichSession } from "@render/compute";
import type { MiningState, Session } from "@session";

const session: Session = {
  model: "?", effort: "", thinking: false, fast: false, pct: 0, ctxSize: 200000,
  cost: 0, added: 0, removed: 0, rl5: null, rl5Reset: null, rl7: null, rl7Reset: null,
  transcript: "", sessionId: "test",
};

const mined: MiningState = {
  minedLines: 0, subagentLines: {}, tokensIn: 0, tokensOut: 0, toolCounts: {}, toolErrors: 0,
  ctxSamples: [64600], permissionMode: null, model: "gpt-5.6-terra", contextWindow: 258400,
};

describe("enrichSession", () => {
  test("backfills absent hook metadata from a transcript", () => {
    expect(enrichSession(session, mined)).toMatchObject({ model: "gpt-5.6-terra", ctxSize: 258400, pct: 25 });
  });

  test("preserves explicit hook metadata", () => {
    expect(enrichSession({ ...session, model: "Claude Opus", pct: 42, ctxSize: 100000 }, mined))
      .toMatchObject({ model: "Claude Opus", pct: 42, ctxSize: 100000 });
  });
});
