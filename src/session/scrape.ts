import { sessionInputSchema } from "@adapters/claude/session";
import type { z } from "zod";
import { readStdinJson } from "@process";
import type { ExternalSessionData } from "@session/external";
import { loadExternalState, saveExternalState } from "@session/external";
import { NO_SESSION_ID } from "@session/session";

type StatusLineInput = z.infer<typeof sessionInputSchema>;

/** Folds one statusLine payload into `prior`. A field this payload doesn't
 * carry keeps whatever was last known, rather than reverting to unknown —
 * a statusLine invocation reports the account's current standing, not a
 * delta, but any one payload can still omit a section (e.g. cost is absent
 * before the first turn completes). */
export function foldStatusLinePayload(input: StatusLineInput, prior: ExternalSessionData): ExternalSessionData {
  return {
    cost: input.cost?.total_cost_usd ?? prior.cost,
    contextWindow: input.context_window?.context_window_size ?? prior.contextWindow,
    pct:
      typeof input.context_window?.used_percentage === "number"
        ? Math.floor(input.context_window.used_percentage)
        : prior.pct,
    rl5: input.rate_limits?.five_hour?.used_percentage ?? prior.rl5,
    rl5Reset: input.rate_limits?.five_hour?.resets_at ?? prior.rl5Reset,
    rl7: input.rate_limits?.seven_day?.used_percentage ?? prior.rl7,
    rl7Reset: input.rate_limits?.seven_day?.resets_at ?? prior.rl7Reset,
  };
}

/** Wired into the host's `statusLine` config (not a hook): the only surface
 * that carries cost/context-window-size/rate-limit account facts. Reuses
 * Claude Code's own sessionInputSchema, since a statusLine payload is a
 * superset of what a hook-only payload ever supplies. Persists what it
 * finds and prints nothing — Claude Code's own status line stays blank by
 * design, since the tmux sidecard is the only surface anyone looks at. */
export async function scrapeStatusLine(): Promise<void> {
  const parsed = sessionInputSchema.safeParse(await readStdinJson());
  if (!parsed.success) return;
  const sessionId = parsed.data.session_id ?? NO_SESSION_ID;
  if (sessionId === NO_SESSION_ID) return;

  const prior = await loadExternalState(sessionId);
  await saveExternalState(sessionId, foldStatusLinePayload(parsed.data, prior));
}
