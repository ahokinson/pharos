import { diffLines } from "diff";
import type { ZodType } from "zod";

// split(...).length - 1 == complete (newline-terminated) line count,
// regardless of whether the file ends with a trailing newline: the last
// split element is either "" (after a trailing \n) or a still-being-written
// partial line, and either way isn't a complete line yet.
export function completeLineCount(lines: string[]): number {
  return lines.length - 1;
}

/** Reads the transcript at `path` and returns its complete lines past
 * `alreadyRead`, plus the complete-line count to persist afterwards.
 * Unreadable file fails open: no lines, count unchanged. */
export async function readNewLines(path: string, alreadyRead: number): Promise<{ lines: string[]; count: number }> {
  let text = "";
  try {
    text = await Bun.file(path).text();
  } catch {
    return { lines: [], count: alreadyRead };
  }
  const lines = text.split("\n");
  const count = completeLineCount(lines);
  return { lines: lines.slice(alreadyRead, count), count };
}

/** Parses one JSONL line against `schema`; undefined for non-JSON or
 * shape-mismatched lines (fail open: skip the line, never the render). */
export function parseJsonLine<T>(line: string, schema: ZodType<T>): T | undefined {
  let json: unknown;
  try {
    json = JSON.parse(line);
  } catch {
    return undefined;
  }
  const result = schema.safeParse(json);
  return result.success ? result.data : undefined;
}

export function capSamples(samples: number[], cap: number): number[] {
  return samples.length > cap ? samples.slice(-cap) : samples;
}

/** Line additions/deletions between `before` and `after`, counted from a
 * line diff (not character edits). A bare Write (no baseline) passes "" as
 * `before`, which counts every line of the new content as added. */
export function countLineDelta(before: string, after: string): { added: number; removed: number } {
  let added = 0;
  let removed = 0;
  for (const change of diffLines(before, after)) {
    if (change.added) added += change.count ?? 0;
    else if (change.removed) removed += change.count ?? 0;
  }
  return { added, removed };
}

/** Lines added/removed in an embedded patch (Codex's apply_patch, Claude's
 * ApplyPatch). Counts +/- content lines, skipping the diff/file headers,
 * hunk markers, and "\ No newline" lines. Best-effort by nature: a content
 * line that begins with three plus signs is indistinguishable from a header
 * in this format. */
export function countPatchLines(patch: string): { added: number; removed: number } {
  let added = 0;
  let removed = 0;
  const lines = patch.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    if (
      line.startsWith("@@") ||
      line.startsWith("\\ ") ||
      line.startsWith("***") ||
      line.startsWith("diff ") ||
      line.startsWith("index ") ||
      line.startsWith("---") ||
      line.startsWith("+++")
    ) {
      continue;
    }
    if (line.startsWith("+")) added++;
    else if (line.startsWith("-")) removed++;
  }
  return { added, removed };
}

/** Best-effort line delta a host's edit tool call applied, from its raw
 * arguments (JSON-string, object, or a raw embedded patch). Shared by the
 * Codex and Hermes adapters: both carry provider-shaped tool calls, and any
 * shape that isn't clearly recoverable contributes zero rather than a
 * guess. */
export function editToolLineDelta(toolName: string, argsRaw: unknown): { added: number; removed: number } | null {
  let input: Record<string, unknown> | null = null;
  let rawPatch: string | null = null;
  if (typeof argsRaw === "string") {
    try {
      const parsed: unknown = JSON.parse(argsRaw);
      input = typeof parsed === "object" && parsed !== null ? (parsed as Record<string, unknown>) : null;
    } catch {
      if (argsRaw.includes("@@")) rawPatch = argsRaw;
    }
  } else if (typeof argsRaw === "object" && argsRaw !== null) {
    input = argsRaw as Record<string, unknown>;
  }

  switch (toolName) {
    case "apply_patch":
    case "ApplyPatch":
    case "Patch": {
      if (typeof input?.patch === "string") return countPatchLines(input.patch);
      if (rawPatch !== null) return countPatchLines(rawPatch);
      return null;
    }
    case "Edit": {
      if (typeof input?.old_string === "string" && typeof input.new_string === "string") {
        return countLineDelta(input.old_string, input.new_string);
      }
      return null;
    }
    case "MultiEdit": {
      let added = 0;
      let removed = 0;
      const edits = Array.isArray(input?.edits) ? (input!.edits as unknown[]) : [];
      for (const edit of edits) {
        const pair = edit as { old_string?: unknown; new_string?: unknown };
        if (typeof pair.old_string === "string" && typeof pair.new_string === "string") {
          const delta = countLineDelta(pair.old_string, pair.new_string);
          added += delta.added;
          removed += delta.removed;
        }
      }
      return added === 0 && removed === 0 ? null : { added, removed };
    }
    case "Write":
      return typeof input?.content === "string" ? countLineDelta("", input.content) : null;
    case "NotebookEdit":
      return typeof input?.new_source === "string" ? countLineDelta("", input.new_source) : null;
    default:
      return null;
  }
}
