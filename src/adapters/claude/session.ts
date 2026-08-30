// Session JSON: what a Claude Code hook hands pharos on stdin. The schema
// is the union of Claude Code's payload shapes: hooks reliably carry
// session_id/transcript_path, while the richer statusLine-era fields
// (model, context_window, cost, rate_limits) survive here so a payload
// that has them still enriches — and one that doesn't fails open to the
// defaults below (cost/rate reading empty under hook-only rendering).
import { z } from "zod";

import { DEFAULT_CTX_SIZE, NO_SESSION_ID } from "@session/session";
import type { Session } from "@session/session";

export const sessionInputSchema = z.looseObject({
  model: z.looseObject({ display_name: z.string().optional() }).optional(),
  effort: z.looseObject({ level: z.string().optional() }).optional(),
  thinking: z.looseObject({ enabled: z.boolean().optional() }).optional(),
  fast_mode: z.boolean().optional(),
  context_window: z
    .looseObject({
      used_percentage: z.number().optional(),
      context_window_size: z.number().optional(),
    })
    .optional(),
  cost: z
    .looseObject({
      total_cost_usd: z.number().optional(),
      total_lines_added: z.number().optional(),
      total_lines_removed: z.number().optional(),
    })
    .optional(),
  rate_limits: z
    .looseObject({
      five_hour: z.looseObject({ used_percentage: z.number().optional(), resets_at: z.union([z.string(), z.number()]).optional() }).optional(),
      seven_day: z.looseObject({ used_percentage: z.number().optional(), resets_at: z.union([z.string(), z.number()]).optional() }).optional(),
    })
    .optional(),
  transcript_path: z.string().optional(),
  session_id: z.string().optional(),
});

type SessionInput = z.infer<typeof sessionInputSchema>;

/** Validates the raw stdin payload and normalizes it into a Session.
 * Malformed payloads fail open to an empty input, same philosophy as
 * config loading: a bad statusline payload must never break the render. */
export function parseSession(raw: unknown): Session {
  const parsed = sessionInputSchema.safeParse(raw);
  const input: SessionInput = parsed.success ? parsed.data : {};
  return {
    model: input.model?.display_name ?? "?",
    effort: input.effort?.level ?? "",
    thinking: input.thinking?.enabled ?? false,
    fast: input.fast_mode ?? false,
    pct:
      typeof input.context_window?.used_percentage === "number"
        ? Math.floor(input.context_window.used_percentage)
        : null,
    ctxSize: input.context_window?.context_window_size ?? DEFAULT_CTX_SIZE,
    cost: input.cost?.total_cost_usd ?? 0,
    added: input.cost?.total_lines_added ?? 0,
    removed: input.cost?.total_lines_removed ?? 0,
    rl5: input.rate_limits?.five_hour?.used_percentage ?? null,
    rl5Reset: input.rate_limits?.five_hour?.resets_at ?? null,
    rl7: input.rate_limits?.seven_day?.used_percentage ?? null,
    rl7Reset: input.rate_limits?.seven_day?.resets_at ?? null,
    transcript: input.transcript_path ?? "",
    sessionId: input.session_id ?? NO_SESSION_ID,
  };
}
