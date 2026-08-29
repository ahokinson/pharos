// opencode keeps its history in SQLite, not a JSONL transcript: session
// rows hold the aggregates (cost, token totals, diff summary, model blob),
// and per-message/per-part rows hold everything else. Verified against a
// real ~/.local/share/opencode/opencode-stable.db (opencode 1.18.21); the
// schema is internal to opencode and migration-owned, so queries here stay
// minimal, read-only, and fail open (this adapter's MiningSupport is
// BestEffort for exactly that reason — see adapters/opencode/index.ts).
import { join } from "node:path";

import { Database } from "bun:sqlite";
import { z } from "zod";

/** DB location: PHAROS_OPENCODE_DB overrides everything (testing, beta
 * channels with a differently-named DB); else opencode's own default. */
export function opencodeDbPath(): string {
  if (process.env.PHAROS_OPENCODE_DB) return process.env.PHAROS_OPENCODE_DB;
  const dataHome = process.env.XDG_DATA_HOME || join(process.env.HOME ?? "", ".local", "share");
  return join(dataHome, "opencode", "opencode-stable.db");
}

/** Opens the DB read-only; null when missing or unreadable, so callers can
 * fail open to an unenriched render rather than a broken one. */
export function openDb(): Database | null {
  try {
    return new Database(opencodeDbPath(), { readonly: true });
  } catch {
    return null;
  }
}

export interface OpencodeSessionRow {
  id: string;
  parentId: string | null;
  cost: number;
  summaryAdditions: number;
  summaryDeletions: number;
  /** Raw JSON blob, e.g. {"id":"glm-5.3","providerID":"...","variant":"high"}; parsed by the caller. */
  model: string | null;
}

export function getSessionRow(db: Database, sessionId: string): OpencodeSessionRow | null {
  let row:
    | { id: string; parent_id: string | null; cost: number; summary_additions: number; summary_deletions: number; model: string | null }
    | undefined;
  try {
    row = db
      .query("select id, parent_id, cost, summary_additions, summary_deletions, model from session where id = ?")
      .get(sessionId) as typeof row;
  } catch {
    return null;
  }
  if (!row) return null;
  return {
    id: row.id,
    parentId: row.parent_id,
    cost: row.cost,
    summaryAdditions: row.summary_additions,
    summaryDeletions: row.summary_deletions,
    model: row.model,
  };
}

/** Child (subagent) sessions of one session, by id. One level only, matching
 * what the claude adapter mines: no observed session had a subagent
 * spawning its own subagent. */
export function getChildSessionIds(db: Database, sessionId: string): string[] {
  try {
    const rows = db.query("select id from session where parent_id = ?").all(sessionId) as { id: string }[];
    return rows.map((r) => r.id);
  } catch {
    return [];
  }
}

function jsonParse(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

// Assistant-message `data` JSON, trimmed to the fields this adapter reads.
// A message row exists the moment streaming starts, with zeroed tokens
// until the first usage report lands — so a zero total means "not reported
// yet", never "empty context", and readers skip it (see session.ts /
// mining.ts). looseObject throughout: rows carry many fields this file
// never reads, and unknown keys must never invalidate a row.
const messageDataSchema = z.looseObject({
  role: z.string().optional(),
  mode: z.string().optional(),
  variant: z.string().optional(),
  modelID: z.string().optional(),
  tokens: z
    .looseObject({
      total: z.number().optional(),
      input: z.number().optional(),
      output: z.number().optional(),
      reasoning: z.number().optional(),
      cache: z.looseObject({ read: z.number().optional(), write: z.number().optional() }).optional(),
    })
    .optional(),
});

export type OpencodeMessage = z.infer<typeof messageDataSchema>;

/** Assistant-message data rows for one session, in creation order,
 * shape-validated; rows that fail validation are skipped, never fatal. */
export function assistantMessages(db: Database, sessionId: string): OpencodeMessage[] {
  let rows: { data: string }[] = [];
  try {
    rows = db.query("select data from message where session_id = ? order by time_created").all(sessionId) as {
      data: string;
    }[];
  } catch {
    return [];
  }
  const out: OpencodeMessage[] = [];
  for (const row of rows) {
    const parsed = messageDataSchema.safeParse(jsonParse(row.data));
    if (parsed.success && parsed.data.role === "assistant") out.push(parsed.data);
  }
  return out;
}

// Tool-part `data` JSON, same trim-and-looseObject treatment.
const toolPartDataSchema = z.looseObject({
  type: z.string().optional(),
  tool: z.string().optional(),
  state: z.looseObject({ status: z.string().optional() }).optional(),
});

export type OpencodeToolPart = z.infer<typeof toolPartDataSchema>;

/** Tool-part data rows for one session (part.type "tool"), shape-validated. */
export function toolParts(db: Database, sessionId: string): OpencodeToolPart[] {
  let rows: { data: string }[] = [];
  try {
    rows = db.query("select data from part where session_id = ?").all(sessionId) as { data: string }[];
  } catch {
    return [];
  }
  const out: OpencodeToolPart[] = [];
  for (const row of rows) {
    const parsed = toolPartDataSchema.safeParse(jsonParse(row.data));
    if (parsed.success && parsed.data.type === "tool") out.push(parsed.data);
  }
  return out;
}

const modelBlobSchema = z.looseObject({ id: z.string().optional(), variant: z.string().optional() });

/** session.model is a JSON blob; null when absent or malformed. */
export function parseModelBlob(raw: string | null): { id?: string; variant?: string } | null {
  if (!raw) return null;
  const parsed = modelBlobSchema.safeParse(jsonParse(raw));
  return parsed.success ? parsed.data : null;
}
