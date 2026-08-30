import { z } from "zod";

import { openDb, sessionRow } from "@adapters/hermes/db";
import { DEFAULT_CTX_SIZE, NO_SESSION_ID } from "@session/session";
import type { Session } from "@session/session";

export const sessionInputSchema = z.looseObject({
  session_id: z.string().optional(),
  cwd: z.string().optional(),
  extra: z.looseObject({ model: z.string().optional(), reasoning_effort: z.string().optional() }).optional(),
});

export function parseSession(raw: unknown): Session {
  const parsed = sessionInputSchema.safeParse(raw);
  const input = parsed.success ? parsed.data : {};
  const sessionId = input.session_id || NO_SESSION_ID;
  const fallback: Session = {
    model: input.extra?.model ?? "?", effort: input.extra?.reasoning_effort ?? "", thinking: false, fast: false,
    pct: null, ctxSize: DEFAULT_CTX_SIZE, cost: 0, added: 0, removed: 0,
    rl5: null, rl5Reset: null, rl7: null, rl7Reset: null, transcript: sessionId, sessionId,
  };
  const db = openDb();
  if (!db) return fallback;
  try {
    const row = sessionRow(db, sessionId);
    if (!row) return fallback;
    return { ...fallback, model: row.model ?? fallback.model, cost: row.actualCost || row.estimatedCost };
  } finally {
    db.close();
  }
}
