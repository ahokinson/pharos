import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { mineTranscript } from "@adapters/codex/mining";
import type { MiningState } from "@session/mining";

// Envelope shapes below are trimmed to just the fields mining.ts reads,
// matching the structure verified against real ~/.codex/sessions/**/
// rollout-*.jsonl files (Codex CLI 0.147.0) — not fabricated from docs.

function emptyState(): MiningState {
  return { minedLines: 0, subagentLines: {}, tokensIn: 0, tokensOut: 0, toolCounts: {}, toolErrors: 0, ctxSamples: [], permissionMode: null };
}

describe("mineTranscript (Codex rollout envelope)", () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "pharos-codex-test-"));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  test("sums last_token_usage across token_count events, only from new lines", async () => {
    const transcript = join(dir, "rollout.jsonl");
    const tok1 = JSON.stringify({
      type: "event_msg",
      payload: { type: "token_count", info: { last_token_usage: { input_tokens: 100, output_tokens: 20 } } },
    });
    const tok2 = JSON.stringify({
      type: "event_msg",
      payload: { type: "token_count", info: { last_token_usage: { input_tokens: 150, output_tokens: 30 } } },
    });
    writeFileSync(transcript, `${tok1}\n`);

    const state1 = await mineTranscript(transcript, emptyState());
    expect(state1.tokensIn).toBe(100);
    expect(state1.tokensOut).toBe(20);
    expect(state1.ctxSamples).toEqual([100]);

    writeFileSync(transcript, `${tok1}\n${tok2}\n`);
    const state2 = await mineTranscript(transcript, state1);
    expect(state2.tokensIn).toBe(250);
    expect(state2.tokensOut).toBe(50);
    expect(state2.ctxSamples).toEqual([100, 150]);
  });

  test("counts function_call and custom_tool_call response_items by name", async () => {
    const transcript = join(dir, "rollout.jsonl");
    const exec = JSON.stringify({ type: "response_item", payload: { type: "function_call", name: "exec" } });
    const wait = JSON.stringify({ type: "response_item", payload: { type: "custom_tool_call", name: "wait" } });
    writeFileSync(transcript, `${exec}\n${exec}\n${wait}\n`);

    const state = await mineTranscript(transcript, emptyState());
    expect(state.toolCounts).toEqual({ exec: 2, wait: 1 });
  });

  test("ignores response_item/event_msg sub-types it doesn't recognize", async () => {
    const transcript = join(dir, "rollout.jsonl");
    const reasoning = JSON.stringify({ type: "response_item", payload: { type: "reasoning" } });
    const taskComplete = JSON.stringify({ type: "event_msg", payload: { type: "task_complete" } });
    writeFileSync(transcript, `${reasoning}\n${taskComplete}\n`);

    const state = await mineTranscript(transcript, emptyState());
    expect(state.tokensIn).toBe(0);
    expect(state.toolCounts).toEqual({});
  });

  test("never counts toolErrors: no reliable failure signal exists in this schema", async () => {
    const transcript = join(dir, "rollout.jsonl");
    const output = JSON.stringify({ type: "response_item", payload: { type: "function_call_output" } });
    writeFileSync(transcript, `${output}\n`);

    const state = await mineTranscript(transcript, emptyState());
    expect(state.toolErrors).toBe(0);
  });
});
