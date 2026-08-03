import { basename, dirname, join } from "node:path";
import { miningStateFile } from "@session/paths";

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

interface TranscriptLine {
  type?: string;
  permissionMode?: string;
  message?: {
    usage?: {
      input_tokens?: number;
      cache_creation_input_tokens?: number;
      cache_read_input_tokens?: number;
      output_tokens?: number;
    };
    content?: { type?: string; name?: string; is_error?: boolean }[];
  };
}

export interface MiningState {
  minedLines: number;
  subagentLines: Record<string, number>;
  tokensIn: number;
  tokensOut: number;
  toolCounts: Record<string, number>;
  toolErrors: number;
  ctxSamples: number[];
  permissionMode: string | null;
}

function emptyMiningState(): MiningState {
  return {
    minedLines: 0,
    subagentLines: {},
    tokensIn: 0,
    tokensOut: 0,
    toolCounts: {},
    toolErrors: 0,
    ctxSamples: [],
    permissionMode: null,
  };
}

export async function loadMiningState(sessionId: string): Promise<MiningState> {
  try {
    const raw = JSON.parse(await Bun.file(miningStateFile(sessionId)).text()) as Partial<MiningState>;
    return {
      minedLines: raw.minedLines ?? 0,
      subagentLines: raw.subagentLines ?? {},
      tokensIn: raw.tokensIn ?? 0,
      tokensOut: raw.tokensOut ?? 0,
      toolCounts: raw.toolCounts ?? {},
      toolErrors: raw.toolErrors ?? 0,
      ctxSamples: raw.ctxSamples ?? [],
      permissionMode: raw.permissionMode ?? null,
    };
  } catch {
    return emptyMiningState();
  }
}

export async function saveMiningState(sessionId: string, state: MiningState): Promise<void> {
  try {
    await Bun.write(miningStateFile(sessionId), JSON.stringify(state));
  } catch {}
}

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
    const content = msg.message?.content;
    if (Array.isArray(content)) {
      for (const item of content) {
        if (item?.type === "tool_use" && typeof item.name === "string") {
          totals.toolCounts[item.name] = (totals.toolCounts[item.name] ?? 0) + 1;
        }
      }
    }
  } else if (msg.type === "user") {
    const content = msg.message?.content;
    if (Array.isArray(content)) {
      for (const item of content) {
        if (item?.type === "tool_result" && item.is_error) totals.toolErrors++;
      }
    }
  }
}

// split(...).length - 1 == complete (newline-terminated) line count,
// regardless of whether the file ends with a trailing newline: the last
// split element is either "" (after a trailing \n) or a still-being-written
// partial line, and either way isn't a complete line yet.
function completeLineCount(lines: string[]): number {
  return lines.length - 1;
}

function subagentsDir(transcriptPath: string): string {
  return join(dirname(transcriptPath), basename(transcriptPath, ".jsonl"), "subagents");
}

export async function mineTranscript(transcriptPath: string, state: MiningState, sampleCap = 40): Promise<MiningState> {
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

  let text = "";
  try {
    text = await Bun.file(transcriptPath).text();
  } catch {}
  if (text) {
    const lines = text.split("\n");
    const lineCount = completeLineCount(lines);
    for (const line of lines.slice(state.minedLines, lineCount)) {
      let msg: TranscriptLine;
      try {
        msg = JSON.parse(line) as TranscriptLine;
      } catch {
        continue;
      }
      if (msg.type === "permission-mode" && typeof msg.permissionMode === "string") {
        permissionMode = msg.permissionMode;
        continue;
      }
      mineLine(msg, totals, ctxSamples);
    }
    minedLines = Math.max(minedLines, lineCount);
  }

  const subagentLines = { ...state.subagentLines };
  let subagentFiles: string[] = [];
  try {
    for await (const file of new Bun.Glob("*.jsonl").scan(subagentsDir(transcriptPath))) {
      subagentFiles.push(file);
    }
  } catch {}
  for (const file of subagentFiles) {
    let subText: string;
    try {
      subText = await Bun.file(join(subagentsDir(transcriptPath), file)).text();
    } catch {
      continue;
    }
    const lines = subText.split("\n");
    const lineCount = completeLineCount(lines);
    const already = subagentLines[file] ?? 0;
    for (const line of lines.slice(already, lineCount)) {
      let msg: TranscriptLine;
      try {
        msg = JSON.parse(line) as TranscriptLine;
      } catch {
        continue;
      }
      mineLine(msg, totals, null);
    }
    subagentLines[file] = Math.max(already, lineCount);
  }

  return {
    minedLines,
    subagentLines,
    tokensIn: totals.tokensIn,
    tokensOut: totals.tokensOut,
    toolCounts: totals.toolCounts,
    toolErrors: totals.toolErrors,
    ctxSamples: ctxSamples.length > sampleCap ? ctxSamples.slice(-sampleCap) : ctxSamples,
    permissionMode,
  };
}
