import { describe, expect, test } from "bun:test";
import { enrichSession, prettyModelName } from "@render/compute";
import type { ExternalSessionData, MiningState, Session } from "@session";
import { emptyExternalState } from "@session";

const session: Session = {
  model: "?", effort: "", thinking: false, fast: false, pct: null, ctxSize: 200000,
  cost: 0, added: 0, removed: 0, rl5: null, rl5Reset: null, rl7: null, rl7Reset: null,
  transcript: "", sessionId: "test",
};

const mined: MiningState = {
  minedLines: 0, subagentLines: {}, tokensIn: 0, tokensOut: 0, linesAdded: 0, linesRemoved: 0, toolCounts: {}, toolErrors: 0,
  ctxSamples: [64600], permissionMode: null, model: "gpt-5.6-terra", contextWindow: 258400,
};

const external: ExternalSessionData = emptyExternalState();

describe("enrichSession", () => {
  test("backfills absent hook metadata from a transcript", () => {
    expect(enrichSession(session, mined)).toMatchObject({ model: "gpt-5.6-terra", ctxSize: 258400, pct: 25 });
  });

  test("preserves explicit hook metadata", () => {
    expect(enrichSession({ ...session, model: "Claude Opus", pct: 42, ctxSize: 100000 }, mined))
      .toMatchObject({ model: "Claude Opus", pct: 42, ctxSize: 100000 });
  });

  test("prefers the mined line delta over the session total", () => {
    const result = enrichSession({ ...session, added: 17, removed: 7 }, { ...mined, linesAdded: 3, linesRemoved: 1 });
    expect(result).toMatchObject({ added: 3, removed: 1 });
  });

  test("keeps the session total when nothing was mined (host-reported fallback)", () => {
    const result = enrichSession({ ...session, added: 10, removed: 4 }, mined);
    expect(result).toMatchObject({ added: 10, removed: 4 });
  });

  test("treats a mined zero-delta session as unmined, not as a real zero", () => {
    const result = enrichSession({ ...session, added: 5, removed: 2 }, { ...mined, linesAdded: 0, linesRemoved: 0 });
    expect(result).toMatchObject({ added: 5, removed: 2 });
  });

  test("leaves pct null rather than guessing when nothing is derivable", () => {
    const result = enrichSession(session, { ...mined, ctxSamples: [] });
    expect(result.pct).toBeNull();
  });

  test("fills rate limits from the external (statusLine) source when hooks and mining have none", () => {
    const result = enrichSession(session, mined, { ...external, rl5: 59, rl5Reset: 1788924200, rl7: 44, rl7Reset: 1788993200 });
    expect(result).toMatchObject({ rl5: 59, rl5Reset: 1788924200, rl7: 44, rl7Reset: 1788993200 });
  });

  test("prefers the external context percentage over one derived from mined samples", () => {
    const result = enrichSession(session, mined, { ...external, pct: 42, contextWindow: 1_000_000 });
    expect(result).toMatchObject({ pct: 42, ctxSize: 1_000_000 });
  });

  test("fills cost from the external source when the session reports none", () => {
    const result = enrichSession(session, mined, { ...external, cost: 18.25811785 });
    expect(result.cost).toBeCloseTo(18.25811785);
  });

  test("an explicit hook value still wins over the external source", () => {
    const result = enrichSession({ ...session, pct: 5, cost: 1.5 }, mined, { ...external, pct: 90, cost: 99 });
    expect(result).toMatchObject({ pct: 5, cost: 1.5 });
  });
});

// The card is ~26 columns wide inside its border and padding, so every
// column the model name doesn't spend on the vendor is one the value keeps.
describe("prettyModelName", () => {
  test("drops the vendor prefix the harness row already implies", () => {
    expect(prettyModelName("claude-opus-5")).toBe("Opus 5");
  });

  test("drops a variant tag, which ctxWindow reports properly", () => {
    expect(prettyModelName("claude-opus-5[1m]")).toBe("Opus 5");
  });

  test("keeps a known name verbatim", () => {
    expect(prettyModelName("gpt-5.6-terra")).toBe("GPT 5.6 Terra");
  });

  test("keeps GPT, which is a family and not a vendor", () => {
    expect(prettyModelName("gpt-4o-mini")).toBe("Gpt 4o Mini");
  });

  test("keeps a bare vendor name rather than stripping to nothing", () => {
    expect(prettyModelName("claude")).toBe("Claude");
  });
});
