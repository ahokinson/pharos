import { describe, expect, test } from "bun:test";
import { parseSession } from "@adapters/claude/session";

describe("parseSession", () => {
  test("applies defaults matching the JSON contract's fallbacks", () => {
    const session = parseSession({});
    expect(session.model).toBe("?");
    expect(session.pct).toBeNull();
    expect(session.ctxSize).toBe(200000);
    expect(session.rl5).toBeNull();
    expect(session.sessionId).toBe("nosession");
  });

  test("floors a fractional used_percentage", () => {
    const session = parseSession({ context_window: { used_percentage: 42.9 } });
    expect(session.pct).toBe(42);
  });

  test("keeps a genuinely reported zero distinct from an absent field", () => {
    const session = parseSession({ context_window: { used_percentage: 0 } });
    expect(session.pct).toBe(0);
  });
});
