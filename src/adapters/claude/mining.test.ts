import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { mineTranscript } from "@adapters/claude/mining";
import type { MiningState } from "@session/mining";

function emptyState(): MiningState {
  return { minedLines: 0, subagentLines: {}, tokensIn: 0, tokensOut: 0, toolCounts: {}, toolErrors: 0, ctxSamples: [], permissionMode: null };
}

describe("mineTranscript (filesystem-backed)", () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "pharos-test-"));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  test("counts tool_use events and token usage from new lines only", async () => {
    const transcript = join(dir, "transcript.jsonl");
    const line1 = JSON.stringify({
      type: "assistant",
      message: { usage: { input_tokens: 100, output_tokens: 20 }, content: [{ type: "tool_use", name: "Read" }] },
    });
    const line2 = JSON.stringify({
      type: "assistant",
      message: { usage: { input_tokens: 50, output_tokens: 10 }, content: [{ type: "tool_use", name: "Bash" }] },
    });
    writeFileSync(transcript, `${line1}\n`);

    const state1 = await mineTranscript(transcript, emptyState());
    expect(state1.tokensIn).toBe(100);
    expect(state1.tokensOut).toBe(20);
    expect(state1.toolCounts).toEqual({ Read: 1 });
    expect(state1.minedLines).toBe(1);

    // append a second line; only the new line should be mined
    writeFileSync(transcript, `${line1}\n${line2}\n`);
    const state2 = await mineTranscript(transcript, state1);
    expect(state2.tokensIn).toBe(150);
    expect(state2.tokensOut).toBe(30);
    expect(state2.toolCounts).toEqual({ Read: 1, Bash: 1 });
    expect(state2.minedLines).toBe(2);
  });

  test("ignores an unterminated trailing line", async () => {
    const transcript = join(dir, "partial.jsonl");
    const line1 = JSON.stringify({ type: "assistant", message: { usage: { input_tokens: 5 } } });
    writeFileSync(transcript, `${line1}\n{"incomplete"`);
    const state = await mineTranscript(transcript, emptyState());
    expect(state.minedLines).toBe(1);
    expect(state.tokensIn).toBe(5);
  });

  test("counts is_error tool_result entries as tool failures", async () => {
    const transcript = join(dir, "transcript.jsonl");
    const ok = JSON.stringify({ type: "user", message: { content: [{ type: "tool_result", is_error: false }] } });
    const fail = JSON.stringify({ type: "user", message: { content: [{ type: "tool_result", is_error: true }] } });
    writeFileSync(transcript, `${ok}\n${fail}\n${fail}\n`);
    const state = await mineTranscript(transcript, emptyState());
    expect(state.toolErrors).toBe(2);
  });

  test("tracks the most recently seen permission mode", async () => {
    const transcript = join(dir, "transcript.jsonl");
    const toPlan = JSON.stringify({ type: "permission-mode", permissionMode: "plan" });
    const toBypass = JSON.stringify({ type: "permission-mode", permissionMode: "bypassPermissions" });
    writeFileSync(transcript, `${toPlan}\n`);
    const state1 = await mineTranscript(transcript, emptyState());
    expect(state1.permissionMode).toBe("plan");

    writeFileSync(transcript, `${toPlan}\n${toBypass}\n`);
    const state2 = await mineTranscript(transcript, state1);
    expect(state2.permissionMode).toBe("bypassPermissions");
  });

  test("permission mode persists across renders once seen, even with no new lines", async () => {
    const transcript = join(dir, "transcript.jsonl");
    writeFileSync(transcript, `${JSON.stringify({ type: "permission-mode", permissionMode: "plan" })}\n`);
    const state1 = await mineTranscript(transcript, emptyState());
    const state2 = await mineTranscript(transcript, state1);
    expect(state2.permissionMode).toBe("plan");
  });

  test("folds a subagent transcript's tokens/tools/errors into the same totals", async () => {
    const transcript = join(dir, "session123.jsonl");
    writeFileSync(transcript, `${JSON.stringify({ type: "assistant", message: { usage: { input_tokens: 10, output_tokens: 5 } } })}\n`);

    const subagentDir = join(dir, "session123", "subagents");
    mkdirSync(subagentDir, { recursive: true });
    const agentLine = JSON.stringify({
      type: "assistant",
      message: { usage: { input_tokens: 1000, output_tokens: 200 }, content: [{ type: "tool_use", name: "Read" }] },
    });
    const agentError = JSON.stringify({ type: "user", message: { content: [{ type: "tool_result", is_error: true }] } });
    writeFileSync(join(subagentDir, "agent-abc.jsonl"), `${agentLine}\n${agentError}\n`);

    const state = await mineTranscript(transcript, emptyState());
    expect(state.tokensIn).toBe(1010); // 10 (main) + 1000 (subagent)
    expect(state.tokensOut).toBe(205);
    expect(state.toolCounts).toEqual({ Read: 1 });
    expect(state.toolErrors).toBe(1);
    expect(state.subagentLines["agent-abc.jsonl"]).toBe(2);
  });

  test("a subagent's tokens never feed ctxSamples; only the main transcript's do", async () => {
    const transcript = join(dir, "session123.jsonl");
    writeFileSync(transcript, "");

    const subagentDir = join(dir, "session123", "subagents");
    mkdirSync(subagentDir, { recursive: true });
    const agentLine = JSON.stringify({ type: "assistant", message: { usage: { input_tokens: 5000, output_tokens: 1 } } });
    writeFileSync(join(subagentDir, "agent-xyz.jsonl"), `${agentLine}\n`);

    const state = await mineTranscript(transcript, emptyState());
    expect(state.tokensIn).toBe(5000);
    expect(state.ctxSamples).toEqual([]);
  });

  test("re-mining an unchanged subagent file doesn't double-count", async () => {
    const transcript = join(dir, "session123.jsonl");
    writeFileSync(transcript, "");

    const subagentDir = join(dir, "session123", "subagents");
    mkdirSync(subagentDir, { recursive: true });
    const agentLine = JSON.stringify({ type: "assistant", message: { usage: { input_tokens: 100 } } });
    writeFileSync(join(subagentDir, "agent-abc.jsonl"), `${agentLine}\n`);

    const state1 = await mineTranscript(transcript, emptyState());
    const state2 = await mineTranscript(transcript, state1);
    expect(state2.tokensIn).toBe(100);
  });

  test("a missing subagents directory is fine, fails open", async () => {
    const transcript = join(dir, "no-subagents.jsonl");
    writeFileSync(transcript, `${JSON.stringify({ type: "assistant", message: { usage: { input_tokens: 1 } } })}\n`);
    const state = await mineTranscript(transcript, emptyState());
    expect(state.tokensIn).toBe(1);
  });
});
