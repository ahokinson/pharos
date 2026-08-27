import { describe, expect, test } from "bun:test";
import { parseSession } from "@adapters/claude-code/session";

describe("parseSession", () => {
  test("applies defaults matching the JSON contract's fallbacks", () => {
    const session = parseSession({});
    expect(session.model).toBe("?");
    expect(session.pct).toBe(0);
    expect(session.ctxSize).toBe(200000);
    expect(session.rl5).toBeNull();
    expect(session.sessionId).toBe("nosession");
  });

  test("floors a fractional used_percentage", () => {
    const session = parseSession({ context_window: { used_percentage: 42.9 } });
    expect(session.pct).toBe(42);
  });
});
