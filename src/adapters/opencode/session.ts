// Session JSON: the contract with the opencode-side bridge plugin
// (examples/opencode-bridge.ts). The payload is minimal — just the session
// id — and everything else a Session carries is enriched from the opencode
// DB by that id alone.
import { z } from "zod";

import { assistantMessages, getChildSessionIds, getSessionRow, openDb, parseModelBlob } from "@adapters/opencode/db";
import { DEFAULT_CTX_SIZE, NO_SESSION_ID } from "@session/session";
import type { Session } from "@session/session";

export const sessionInputSchema = z.looseObject({
  session_id: z.string().optional(),
  // Optional, since the DB has no context-window size of its own: the
  // bridge can supply the live model's window, else Claude Code's
  // documented 200k default applies.
  context_window_size: z.number().optional(),
});

function unenrichedSession(sessionId: string, ctxSize: number): Session {
  return {
    model: "?",
    effort: "",
    thinking: false,
    fast: false,
    pct: 0,
    ctxSize,
    cost: 0,
    added: 0,
    removed: 0,
    rl5: null,
    rl5Reset: null,
    rl7: null,
    rl7Reset: null,
    transcript: sessionId,
    sessionId,
  };
}

/** Validates the bridge's stdin payload and normalizes it into a Session,
 * enriching from the opencode DB where the session id resolves. A
 * malformed payload or an unreadable DB fails open to an unenriched
 * session, same philosophy as config loading. */
export function parseSession(raw: unknown): Session {
  const parsed = sessionInputSchema.safeParse(raw);
  const input = parsed.success ? parsed.data : {};
  const sessionId = input.session_id ?? NO_SESSION_ID;
  const ctxSize = input.context_window_size ?? DEFAULT_CTX_SIZE;

  const db = openDb();
  const row = db ? getSessionRow(db, sessionId) : null;
  if (!db || !row) return unenrichedSession(sessionId, ctxSize);

  try {
    const messages = assistantMessages(db, sessionId);
    // The latest message row exists before its first usage report lands
    // (zeroed tokens — see db.ts), so model/context come from the latest
    // message that actually reported each.
    let modelID: string | undefined;
    let variant: string | undefined;
    let fill: number | undefined;
    for (let i = messages.length - 1; i >= 0; i--) {
      const m = messages[i]!;
      modelID ??= m.modelID;
      variant ??= m.variant;
      const total = m.tokens?.total;
      if (fill === undefined && total !== undefined && total > 0) fill = total;
      if (modelID !== undefined && variant !== undefined && fill !== undefined) break;
    }
    const blob = parseModelBlob(row.model);

    // Subagent children's aggregates don't fold into the parent row
    // (verified: session.cost equals the sum of a session's own assistant
    // messages only), so fold them here — a Task-spawned subagent's work is
    // still this session's work, same rule as the claude adapter.
    //
    // added/removed stay 0 deliberately: opencode's session summary_*
    // columns are zeroed since v1.16.0 and stale before it, so the session
    // line delta comes from mined per-message diffs instead (see
    // adapters/opencode/mining.ts) and never from these columns.
    let cost = row.cost;
    for (const childId of getChildSessionIds(db, sessionId)) {
      const child = getSessionRow(db, childId);
      if (!child) continue;
      cost += child.cost;
    }

    return {
      ...unenrichedSession(sessionId, ctxSize),
      model: modelID ?? blob?.id ?? "?",
      effort: variant ?? blob?.variant ?? "",
      pct: ctxSize > 0 ? Math.floor(((fill ?? 0) / ctxSize) * 100) : 0,
      cost,
      added: 0,
      removed: 0,
    };
  } finally {
    db.close();
  }
}
