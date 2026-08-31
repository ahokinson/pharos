import { basename, dirname, join } from "node:path";
import { z } from "zod";

import { capSamples, countLineDelta, countPatchLines, parseJsonLine, readNewLines } from "@adapters/shared";
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

// Edit tool_use inputs carry the old/new text the session actually applied,
// which is what makes a session-scoped line delta possible (the host's
// `cost.total_lines_*` is an opaque total that also counts non-edit changes).
const editInputSchema = z.looseObject({
  old_string: z.string().optional(),
  new_string: z.string().optional(),
  content: z.string().optional(),
  new_source: z.string().optional(),
  patch: z.string().optional(),
  edits: z
    .array(z.looseObject({ old_string: z.string().optional(), new_string: z.string().optional() }))
    .optional(),
});

const contentItemSchema = z.looseObject({
  type: z.string().optional(),
  name: z.string().optional(),
  is_error: z.boolean().optional(),
  input: editInputSchema.optional(),
});

// Claude Code stamps the working directory and branch on every transcript
// line, which is the only repository metadata it ever exposes — no hook
// payload carries either. Mining them is what lets the shared git probe in
// render/compute run for Claude sessions at all.
const transcriptLineSchema = z.looseObject({
  type: z.string().optional(),
  permissionMode: z.string().optional(),
  cwd: z.string().optional(),
  gitBranch: z.string().optional(),
  message: z
    .looseObject({
      usage: usageSchema.optional(),
      model: z.string().optional(),
      content: z.array(contentItemSchema).optional(),
    })
    .optional(),
});

type TranscriptLine = z.infer<typeof transcriptLineSchema>;

interface Totals {
  tokensIn: number;
  tokensOut: number;
  linesAdded: number;
  linesRemoved: number;
  toolCounts: Record<string, number>;
  toolErrors: number;
  model: string | null;
  cwd: string | null;
  branch: string | null;
}

/** Line delta a tool_use call reports for the session, by tool vocabulary.
 * A bare Write has no baseline, so every line of its content counts as
 * added (overcounts overwrites; the README documents it). Unknown tools
 * carry a null input and contribute nothing. */
function editLineDelta(
  toolName: string,
  input: z.infer<typeof editInputSchema> | undefined,
): { added: number; removed: number } | null {
  if (!input) return null;
  switch (toolName) {
    case "Edit": {
      if (typeof input.old_string !== "string" || typeof input.new_string !== "string") return null;
      return countLineDelta(input.old_string, input.new_string);
    }
    case "MultiEdit": {
      let added = 0;
      let removed = 0;
      for (const edit of input.edits ?? []) {
        if (typeof edit.old_string !== "string" || typeof edit.new_string !== "string") continue;
        const delta = countLineDelta(edit.old_string, edit.new_string);
        added += delta.added;
        removed += delta.removed;
      }
      return { added, removed };
    }
    case "Write":
      return typeof input.content === "string" ? countLineDelta("", input.content) : null;
    case "NotebookEdit":
      return typeof input.new_source === "string" ? countLineDelta("", input.new_source) : null;
    case "ApplyPatch":
      return typeof input.patch === "string" ? countPatchLines(input.patch) : null;
    default:
      return null;
  }
}

/** Folds one parsed line into `totals`; `ctxSamples`, when given, gets each
 * assistant turn's total context tokens appended (main transcript only). */
function mineLine(msg: TranscriptLine, totals: Totals, ctxSamples: number[] | null): void {
  // Outside the type switch: these ride on every line shape, and the latest
  // wins — a `/cd` mid-session or a branch switch should move the card.
  if (msg.cwd) totals.cwd = msg.cwd;
  if (msg.gitBranch) totals.branch = msg.gitBranch;
  if (msg.type === "assistant") {
    const usage = msg.message?.usage;
    if (usage) {
      const total =
        (usage.input_tokens ?? 0) + (usage.cache_creation_input_tokens ?? 0) + (usage.cache_read_input_tokens ?? 0);
      totals.tokensIn += total;
      totals.tokensOut += usage.output_tokens ?? 0;
      ctxSamples?.push(total);
    }
    if (typeof msg.message?.model === "string" && msg.message.model !== "<synthetic>") {
      totals.model = msg.message.model;
    }
    for (const item of msg.message?.content ?? []) {
      if (item.type === "tool_use" && typeof item.name === "string") {
        totals.toolCounts[item.name] = (totals.toolCounts[item.name] ?? 0) + 1;
        const delta = editLineDelta(item.name, item.input);
        if (delta) {
          totals.linesAdded += delta.added;
          totals.linesRemoved += delta.removed;
        }
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
    linesAdded: state.linesAdded,
    linesRemoved: state.linesRemoved,
    toolCounts: { ...state.toolCounts },
    toolErrors: state.toolErrors,
    model: state.model ?? null,
    cwd: state.cwd ?? null,
    branch: state.branch ?? null,
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
    linesAdded: totals.linesAdded,
    linesRemoved: totals.linesRemoved,
    toolCounts: totals.toolCounts,
    toolErrors: totals.toolErrors,
    ctxSamples: capSamples(ctxSamples, sampleCap),
    permissionMode,
    model: totals.model,
    contextWindow: state.contextWindow,
    cwd: totals.cwd,
    branch: totals.branch,
    // Carried through untouched: the shared git probe resolves origin's URL
    // once and parks it here, and rebuilding this object each render would
    // otherwise drop it and re-shell-out on every hook.
    repository: state.repository ?? null,
    gitHost: state.gitHost ?? null,
  };
}
