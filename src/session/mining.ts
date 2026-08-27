import { z } from "zod";

import { miningStateFile } from "@session/paths";

/** Fallback context-sample retention when no config value exists; the
 * single source both config defaults and adapter signatures reference. */
export const DEFAULT_SAMPLE_CAP = 40;

// The normalized, incrementally-accumulated totals every metric consumes.
// Producing/updating one from a host's own transcript format (Claude Code's
// JSONL, or another host's own shape) is an adapter's job — see
// src/adapters/*/mining.ts. Persisting the checkpoint between renders is
// host-agnostic (just a sessionId-keyed scratch file), so it stays here.
export interface MiningState {
  minedLines: number;
  subagentLines: Record<string, number>;
  tokensIn: number;
  tokensOut: number;
  toolCounts: Record<string, number>;
  toolErrors: number;
  ctxSamples: number[];
  permissionMode: string | null;
}

function emptyMiningState(): MiningState {
  return {
    minedLines: 0,
    subagentLines: {},
    tokensIn: 0,
    tokensOut: 0,
    toolCounts: {},
    toolErrors: 0,
    ctxSamples: [],
    permissionMode: null,
  };
}

// Per-field catch defaults, so one malformed field costs only that field,
// not the whole checkpoint (matches the old per-field `?? default` reads).
const miningStateSchema = z.object({
  minedLines: z.number().catch(0),
  subagentLines: z.record(z.string(), z.number()).catch({}),
  tokensIn: z.number().catch(0),
  tokensOut: z.number().catch(0),
  toolCounts: z.record(z.string(), z.number()).catch({}),
  toolErrors: z.number().catch(0),
  ctxSamples: z.array(z.number()).catch([]),
  permissionMode: z.string().nullable().catch(null),
});

export async function loadMiningState(sessionId: string): Promise<MiningState> {
  try {
    const raw: unknown = JSON.parse(await Bun.file(miningStateFile(sessionId)).text());
    return miningStateSchema.parse(raw);
  } catch {
    return emptyMiningState();
  }
}

export async function saveMiningState(sessionId: string, state: MiningState): Promise<void> {
  try {
    await Bun.write(miningStateFile(sessionId), JSON.stringify(state));
  } catch {
    // fail open: losing a checkpoint only re-mines from the last good one
  }
}
