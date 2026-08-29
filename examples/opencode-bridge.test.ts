import { describe, expect, test } from "bun:test";
import { pulseStateFor } from "./opencode-bridge";

// Event payload shapes below are trimmed to the fields the bridge reads,
// matching the structure verified against a real opencode 1.18.21 event
// log — not fabricated from docs.

describe("pulseStateFor (opencode bus events)", () => {
  test("a running tool part maps to tool", () => {
    const state = pulseStateFor({
      type: "message.part.updated",
      properties: { sessionID: "ses_1", part: { type: "tool", tool: "bash", state: { status: "running" } } },
    });
    expect(state).toBe("tool");
  });

  test("a running question tool maps to ask", () => {
    const state = pulseStateFor({
      type: "message.part.updated",
      properties: { sessionID: "ses_1", part: { type: "tool", tool: "question", state: { status: "running" } } },
    });
    expect(state).toBe("ask");
  });

  test("a completed tool part leaves the pulse alone", () => {
    const state = pulseStateFor({
      type: "message.part.updated",
      properties: { sessionID: "ses_1", part: { type: "tool", tool: "bash", state: { status: "completed" } } },
    });
    expect(state).toBeNull();
  });

  test("text, reasoning, and step-start parts map to think", () => {
    for (const type of ["text", "reasoning", "step-start"]) {
      const state = pulseStateFor({ type: "message.part.updated", properties: { part: { type } } });
      expect(state).toBe("think");
    }
  });

  test("session.idle maps to off", () => {
    expect(pulseStateFor({ type: "session.idle", properties: { sessionID: "ses_1" } })).toBe("off");
  });

  test("session.updated and step-finish leave the pulse alone", () => {
    expect(pulseStateFor({ type: "session.updated", properties: { sessionID: "ses_1" } })).toBeNull();
    expect(pulseStateFor({ type: "message.part.updated", properties: { part: { type: "step-finish" } } })).toBeNull();
  });

  test("a malformed event fails open to no pulse change", () => {
    expect(pulseStateFor({ type: "message.part.updated" })).toBeNull();
    expect(pulseStateFor({})).toBeNull();
  });
});
