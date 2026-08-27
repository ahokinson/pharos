import { basename, dirname, join } from "node:path";
import { z } from "zod";

import { capSamples, parseJsonLine, readNewLines } from "@adapters/shared";
import type { MiningState } from "@session/mining";
import { DEFAULT_SAMPLE_CAP } from "@session/mining";

// Incrementally mines only new transcript lines for what the session JSON
// can't give: tool histogram, context burn-down, token spend, tool
// failures, and the live permission mode.
//
// A Task-tool invocation gets its own transcript, sibling to the main one
// under <transcriptPath without .jsonl>/subagents/*.jsonl. Their token
// spend, tool calls, and tool failures are folded into the same totals as
// the main transcript, since a subagent's work is still this session's
// work, but never into ctxSamples: context-window fill is specifically
// about the main conversation's own window, and a subagent's cache usage
// was never charged against it.

// looseObject throughout: transcript lines carry many fields this file
// never reads, and unknown keys must never invalidate a line.
const usageSchema = z.looseObject({
  input_tokens: z.number().optional(),
  cache_creation_input_tokens: z.number().optional(),
  cache_read_input_tokens: z.number().optional(),
  output_tokens: z.number().optional(),
});

const contentItemSchema = z.looseObject({
  type: z.string().optional(),
  name: z.string().optional(),
  is_error: z.boolean().optional(),
});

const transcriptLineSchema = z.looseObject({
  type: z.string().optional(),
  permissionMode: z.string().optional(),
  message: z
    .looseObject({
      usage: usageSchema.optional(),
      content: z.array(contentItemSchema).optional(),
    })
    .optional(),
});

type TranscriptLine = z.infer<typeof transcriptLineSchema>;

interface Totals {
  tokensIn: number;
  tokensOut: number;
  toolCounts: Record<string, number>;
  toolErrors: number;
}

/** Folds one parsed line into `totals`; `ctxSamples`, when given, gets each
 * assistant turn's total context tokens appended (main transcript only). */
function mineLine(msg: TranscriptLine, totals: Totals, ctxSamples: number[] | null): void {
  if (msg.type === "assistant") {
    const usage = msg.message?.usage;
    if (usage) {
      const total =
        (usage.input_tokens ?? 0) + (usage.cache_creation_input_tokens ?? 0) + (usage.cache_read_input_tokens ?? 0);
      totals.tokensIn += total;
      totals.tokensOut += usage.output_tokens ?? 0;
      ctxSamples?.push(total);
    }
    for (const item of msg.message?.content ?? []) {
      if (item.type === "tool_use" && typeof item.name === "string") {
        totals.toolCounts[item.name] = (totals.toolCounts[item.name] ?? 0) + 1;
      }
    }
  } else if (msg.type === "user") {
    for (const item of msg.message?.content ?? []) {
      if (item.type === "tool_result" && item.is_error) totals.toolErrors++;
    }
  }
}

function subagentsDir(transcriptPath: string): string {
  return join(dirname(transcriptPath), basename(transcriptPath, ".jsonl"), "subagents");
}

export async function mineTranscript(transcriptPath: string, state: MiningState, sampleCap: number = DEFAULT_SAMPLE_CAP): Promise<MiningState> {
  if (!transcriptPath) return state;

  const totals: Totals = {
    tokensIn: state.tokensIn,
    tokensOut: state.tokensOut,
    toolCounts: { ...state.toolCounts },
    toolErrors: state.toolErrors,
  };
  const ctxSamples = [...state.ctxSamples];
  let minedLines = state.minedLines;
  let permissionMode = state.permissionMode;

  const { lines, count } = await readNewLines(transcriptPath, state.minedLines);
  for (const line of lines) {
    const msg = parseJsonLine(line, transcriptLineSchema);
    if (!msg) continue;
    if (msg.type === "permission-mode" && typeof msg.permissionMode === "string") {
      permissionMode = msg.permissionMode;
      continue;
    }
    mineLine(msg, totals, ctxSamples);
  }
  minedLines = Math.max(minedLines, count);

  const subagentLines = { ...state.subagentLines };
  let subagentFiles: string[] = [];
  try {
    for await (const file of new Bun.Glob("*.jsonl").scan(subagentsDir(transcriptPath))) {
      subagentFiles.push(file);
    }
  } catch {
    // fail open: an unreadable subagents dir just mines nothing extra
  }
  await Promise.all(
    subagentFiles.map(async (file) => {
      const path = join(subagentsDir(transcriptPath), file);
      const already = subagentLines[file] ?? 0;
      const { lines, count } = await readNewLines(path, already);
      for (const line of lines) {
        const msg = parseJsonLine(line, transcriptLineSchema);
        if (!msg) continue;
        mineLine(msg, totals, null);
      }
      subagentLines[file] = Math.max(already, count);
    }),
  );

  return {
    minedLines,
    subagentLines,
    tokensIn: totals.tokensIn,
    tokensOut: totals.tokensOut,
    toolCounts: totals.toolCounts,
    toolErrors: totals.toolErrors,
    ctxSamples: capSamples(ctxSamples, sampleCap),
    permissionMode,
  };
}
