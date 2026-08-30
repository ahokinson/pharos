import { sessionRow, sessionTreeIds, openDb, toolCallRows, toolTotals } from "@adapters/hermes/db";
import { editToolLineDelta } from "@adapters/shared";
import type { MiningState } from "@session/mining";
import { NO_SESSION_ID } from "@session/session";

/** Best-effort per-turn line delta from a Hermes tool_calls JSON array. The
 * call shape varies by provider (OpenAI `{function:{name,arguments}}`,
 * Anthropic `{name,input}`), so both are tolerated; anything not clearly
 * recoverable contributes zero — same fail-open as the rest of this adapter. */
function toolCallsDelta(tool_calls: string): { added: number; removed: number } | null {
  let calls: unknown;
  try {
    calls = JSON.parse(tool_calls);
  } catch {
    return null;
  }
  if (!Array.isArray(calls)) return null;
  let added = 0;
  let removed = 0;
  for (const call of calls) {
    if (typeof call !== "object" || call === null) continue;
    const c = call as Record<string, unknown>;
    const fn = typeof c.function === "object" && c.function !== null ? (c.function as Record<string, unknown>) : null;
    const name = typeof fn?.name === "string" ? fn.name : typeof c.name === "string" ? c.name : "";
    const argsRaw = fn ? (fn.arguments ?? c.arguments) : (c.arguments ?? c.input);
    const delta = editToolLineDelta(name, argsRaw);
    if (delta) {
      added += delta.added;
      removed += delta.removed;
    }
  }
  return added === 0 && removed === 0 ? null : { added, removed };
}

/** Hermes mutates its SQLite aggregates as a turn runs, so rebuild on every
 * hook render rather than checkpointing partial database observations. */
export async function mineTranscript(ref: string, prior: MiningState, sampleCap: number): Promise<MiningState> {
  if (!ref || ref === NO_SESSION_ID) return prior;
  const db = openDb();
  if (!db) return prior;
  try {
    const root = sessionRow(db, ref);
    if (!root) return prior;
    const ids = sessionTreeIds(db, ref);
    const rows = ids.map((id) => sessionRow(db, id)).filter((row): row is NonNullable<typeof row> => row !== null);
    const tools = toolTotals(db, ids);
    const sum = <K extends keyof typeof root>(key: K): number => rows.reduce((total, row) => total + (typeof row[key] === "number" ? row[key] : 0), 0);
    const totalIn = sum("inputTokens") + sum("cacheReadTokens") + sum("cacheWriteTokens");
    const totalOut = sum("outputTokens") + sum("reasoningTokens");
    const context = root.inputTokens + root.cacheReadTokens + root.cacheWriteTokens;
    let linesAdded = 0;
    let linesRemoved = 0;
    for (const row of toolCallRows(db, ids)) {
      const delta = toolCallsDelta(row.tool_calls ?? "");
      if (delta) {
        linesAdded += delta.added;
        linesRemoved += delta.removed;
      }
    }
    return {
      ...prior,
      minedLines: tools.messages,
      subagentLines: Object.fromEntries(ids.filter((id) => id !== ref).map((id) => [id, 0])),
      tokensIn: totalIn,
      tokensOut: totalOut,
      linesAdded,
      linesRemoved,
      toolCounts: tools.counts,
      toolErrors: tools.errors,
      ctxSamples: context > 0 ? [context].slice(-sampleCap) : [],
      model: root.model,
      branch: root.branch,
      repository: root.repository,
      cwd: root.cwd,
      cost: sum("actualCost") || sum("estimatedCost"),
    };
  } catch {
    return prior;
  } finally {
    db.close();
  }
}
