import { describe, expect, test } from "bun:test";

import { emptyExternalState } from "@session/external";
import { foldStatusLinePayload } from "@session/scrape";

describe("foldStatusLinePayload", () => {
  test("extracts cost, context-window size/pct, and both rate-limit windows", () => {
    const result = foldStatusLinePayload(
      {
        cost: { total_cost_usd: 18.25811785 },
        context_window: { used_percentage: 42.9, context_window_size: 1_000_000 },
        rate_limits: {
          five_hour: { used_percentage: 59, resets_at: 1788924200 },
          seven_day: { used_percentage: 44, resets_at: 1788993200 },
        },
      },
      emptyExternalState(),
    );
    expect(result).toEqual({
      cost: 18.25811785,
      contextWindow: 1_000_000,
      pct: 42,
      rl5: 59,
      rl5Reset: 1788924200,
      rl7: 44,
      rl7Reset: 1788993200,
    });
  });

  test("keeps the prior value for a field this payload doesn't carry", () => {
    const prior = {
      cost: 5,
      contextWindow: 200_000,
      pct: 10,
      rl5: 30,
      rl5Reset: 111,
      rl7: 20,
      rl7Reset: 222,
    };
    expect(foldStatusLinePayload({}, prior)).toEqual(prior);
  });

  test("a genuinely reported zero cost/pct overwrites a prior nonzero value", () => {
    const prior = { cost: 5, contextWindow: 200_000, pct: 10, rl5: null, rl5Reset: null, rl7: null, rl7Reset: null };
    const result = foldStatusLinePayload(
      { cost: { total_cost_usd: 0 }, context_window: { used_percentage: 0, context_window_size: 200_000 } },
      prior,
    );
    expect(result.cost).toBe(0);
    expect(result.pct).toBe(0);
  });
});
