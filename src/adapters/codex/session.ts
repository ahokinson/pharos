import { z } from "zod";

import { DEFAULT_CTX_SIZE, NO_SESSION_ID } from "@session/session";
import type { Session } from "@session/session";

// UNVERIFIED: field names below come from Codex CLI's published hooks
// documentation (learn.chat.chatgpt.com/docs/hooks, checked Aug 2026), not
// from an observed real hook invocation — no hooks were configured on the
// machine this was written on. Re-check against a real PreToolUse/
// SessionStart payload before relying on this.
//
// The payload is whatever JSON a Codex hook passes on stdin — cost/lines-
// added/removed and rate-limit fields don't exist at this layer for Codex;
// the latter are backfilled from token_count transcript events by mining.ts.
export const sessionInputSchema = z.looseObject({
  session_id: z.string().optional(),
  transcript_path: z.string().optional(),
  cwd: z.string().optional(),
  model: z.string().optional(),
  effort: z.string().optional(),
  thinking: z.boolean().optional(),
  fast: z.boolean().optional(),
  permission_mode: z.string().optional(),
});

/** Validates the raw hook stdin payload and normalizes it into a Session.
 * Malformed payloads fail open to an empty input, same philosophy as
 * config loading. */
export function parseSession(raw: unknown): Session {
  const parsed = sessionInputSchema.safeParse(raw);
  const input = parsed.success ? parsed.data : {};
  return {
    model: input.model ?? "?",
    effort: input.effort ?? "",
    thinking: input.thinking ?? false,
    fast: input.fast ?? false,
    pct: 0,
    ctxSize: DEFAULT_CTX_SIZE,
    cost: 0,
    added: 0,
    removed: 0,
    rl5: null,
    rl5Reset: null,
    rl7: null,
    rl7Reset: null,
    transcript: input.transcript_path ?? "",
    sessionId: input.session_id ?? NO_SESSION_ID,
  };
}
