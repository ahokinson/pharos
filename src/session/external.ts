import { deserialize, serialize } from "bson";
import { z } from "zod";

import { externalStateFile } from "@session/paths";

/** Account/session-level facts only a host's own `statusLine`-style
 * invocation exposes — no hook event carries them (verified against a live
 * Claude Code hook payload: cost, context-window size, and rate limits are
 * absent from every hook, PostToolUse through SessionEnd). `pharos
 * statusline scrape` is the one writer, wired into the host's `statusLine`
 * config alongside the existing hooks pipeline; `enrichSession` folds this
 * in as a source below an explicit hook field but above a mined-transcript
 * guess. BSON because this file is written by a process (and cadence)
 * entirely separate from the mining checkpoint it's merged alongside. */
export interface ExternalSessionData {
  cost: number | null;
  contextWindow: number | null;
  pct: number | null;
  rl5: number | null;
  rl5Reset: number | string | null;
  rl7: number | null;
  rl7Reset: number | string | null;
}

export function emptyExternalState(): ExternalSessionData {
  return { cost: null, contextWindow: null, pct: null, rl5: null, rl5Reset: null, rl7: null, rl7Reset: null };
}

// Per-field catch defaults, same fail-open philosophy as mining.ts's
// checkpoint schema: one malformed field costs only that field.
const externalStateSchema = z.object({
  cost: z.number().nullable().catch(null),
  contextWindow: z.number().nullable().catch(null),
  pct: z.number().nullable().catch(null),
  rl5: z.number().nullable().catch(null),
  rl5Reset: z.union([z.number(), z.string()]).nullable().catch(null),
  rl7: z.number().nullable().catch(null),
  rl7Reset: z.union([z.number(), z.string()]).nullable().catch(null),
});

export async function loadExternalState(sessionId: string): Promise<ExternalSessionData> {
  try {
    const bytes = await Bun.file(externalStateFile(sessionId)).arrayBuffer();
    const raw: unknown = deserialize(new Uint8Array(bytes));
    return externalStateSchema.parse(raw);
  } catch {
    return emptyExternalState();
  }
}

export async function saveExternalState(sessionId: string, state: ExternalSessionData): Promise<void> {
  try {
    await Bun.write(externalStateFile(sessionId), serialize(state));
  } catch {
    // fail open: losing this checkpoint just means the next scrape starts fresh
  }
}
