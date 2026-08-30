import { sessionRow, sessionTreeIds, openDb, toolTotals } from "@adapters/hermes/db";
import type { MiningState } from "@session/mining";
import { NO_SESSION_ID } from "@session/session";

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
    return {
      ...prior,
      minedLines: tools.messages,
      subagentLines: Object.fromEntries(ids.filter((id) => id !== ref).map((id) => [id, 0])),
      tokensIn: totalIn,
      tokensOut: totalOut,
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
