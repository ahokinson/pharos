// Hermes Agent keeps session aggregates in ~/.hermes/state.db. Its schema is
// application-owned, so every query is intentionally small, read-only, and
// returns null/empty data on drift rather than breaking a live shell hook.
import { join } from "node:path";

import { Database } from "bun:sqlite";

export function hermesDbPath(): string {
  return process.env.PHAROS_HERMES_DB ?? join(process.env.HOME ?? "", ".hermes", "state.db");
}

export function openDb(): Database | null {
  try {
    return new Database(hermesDbPath(), { readonly: true });
  } catch {
    return null;
  }
}

export interface HermesSessionRow {
  id: string;
  parentId: string | null;
  model: string | null;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  reasoningTokens: number;
  estimatedCost: number;
  actualCost: number;
  toolCallCount: number;
  cwd: string | null;
  branch: string | null;
  repository: string | null;
}

export function sessionRow(db: Database, id: string): HermesSessionRow | null {
  try {
    const row = db.query(`select id, parent_session_id, model, input_tokens, output_tokens,
      cache_read_tokens, cache_write_tokens, reasoning_tokens, estimated_cost_usd,
      actual_cost_usd, tool_call_count, cwd, git_branch, git_repo_root from sessions where id = ?`).get(id) as Record<string, unknown> | null;
    if (!row) return null;
    const number = (key: string) => typeof row[key] === "number" ? row[key] : 0;
    const string = (key: string) => typeof row[key] === "string" ? row[key] : null;
    return {
      id: string("id") ?? id, parentId: string("parent_session_id"), model: string("model"),
      inputTokens: number("input_tokens"), outputTokens: number("output_tokens"),
      cacheReadTokens: number("cache_read_tokens"), cacheWriteTokens: number("cache_write_tokens"),
      reasoningTokens: number("reasoning_tokens"), estimatedCost: number("estimated_cost_usd"),
      actualCost: number("actual_cost_usd"), toolCallCount: number("tool_call_count"),
      cwd: string("cwd"), branch: string("git_branch"), repository: string("git_repo_root"),
    };
  } catch {
    return null;
  }
}

/** Includes every descendant: Hermes delegates are child sessions whose work
 * belongs to the parent card, matching Pharos's Claude/OpenCode accounting. */
export function sessionTreeIds(db: Database, root: string): string[] {
  try {
    const rows = db.query(`with recursive descendants(id) as (
      select id from sessions where id = ? union all
      select sessions.id from sessions join descendants on sessions.parent_session_id = descendants.id
    ) select id from descendants`).all(root) as { id: string }[];
    return rows.map((row) => row.id);
  } catch {
    return [];
  }
}

export function toolTotals(db: Database, ids: string[]): { counts: Record<string, number>; errors: number; messages: number } {
  if (!ids.length) return { counts: {}, errors: 0, messages: 0 };
  const placeholders = ids.map(() => "?").join(",");
  try {
    const rows = db.query(`select tool_name, effect_disposition, count(*) as count from messages
      where session_id in (${placeholders}) and tool_name is not null group by tool_name, effect_disposition`).all(...ids) as {
        tool_name: string; effect_disposition: string | null; count: number;
      }[];
    const counts: Record<string, number> = {};
    let errors = 0;
    let messages = 0;
    for (const row of rows) {
      counts[row.tool_name] = (counts[row.tool_name] ?? 0) + row.count;
      messages += row.count;
      if (row.effect_disposition === "error" || row.effect_disposition === "blocked") errors += row.count;
    }
    return { counts, errors, messages };
  } catch {
    return { counts: {}, errors: 0, messages: 0 };
  }
}

/** Tool-call rows for a session tree, unwrapped; the `tool_calls` JSON
 * shape varies by provider, so parsing/deciding is the miner's job (and a
 * shape it can't read contributes nothing, fail-open like everything else
 * in this adapter). */
export function toolCallRows(db: Database, ids: string[]): { tool_name: string | null; tool_calls: string | null }[] {
  if (!ids.length) return [];
  const placeholders = ids.map(() => "?").join(",");
  try {
    return db.query(`select tool_name, tool_calls from messages
      where session_id in (${placeholders}) and tool_calls is not null`).all(...ids) as {
        tool_name: string | null; tool_calls: string | null;
      }[];
  } catch {
    return [];
  }
}
