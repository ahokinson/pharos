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
  /** Lines the session's own edit calls added/removed, mined from the
   * transcript (or the host's per-message diffs) rather than a host total
   * that may reflect the whole worktree. See the adapter mining modules. */
  linesAdded: number;
  linesRemoved: number;
  toolCounts: Record<string, number>;
  toolErrors: number;
  ctxSamples: number[];
  permissionMode: string | null;
  /** Best-effort transcript metadata used when hook payloads omit it. */
  model?: string | null;
  contextWindow?: number | null;
  /** Latest transcript-reported rolling usage windows, if the host exposes them. */
  rl5?: number | null;
  rl5Reset?: number | null;
  rl7?: number | null;
  rl7Reset?: number | null;
  /** Account and permission facts emitted by Codex thread settings. */
  planType?: string | null;
  approvalPolicy?: string | null;
  sandbox?: string | null;
  branch?: string | null;
  repository?: string | null;
  gitHost?: string | null;
  cwd?: string | null;
  /** Aggregated database-backed cost when the host exposes it outside hooks. */
  cost?: number | null;
}

function emptyMiningState(): MiningState {
  return {
    minedLines: 0,
    subagentLines: {},
    tokensIn: 0,
    tokensOut: 0,
    linesAdded: 0,
    linesRemoved: 0,
    toolCounts: {},
    toolErrors: 0,
    ctxSamples: [],
    permissionMode: null,
    model: null,
    contextWindow: null,
    rl5: null,
    rl5Reset: null,
    rl7: null,
    rl7Reset: null,
    planType: null,
    approvalPolicy: null,
    sandbox: null,
    branch: null,
    repository: null,
    gitHost: null,
    cwd: null,
    cost: null,
  };
}

// Per-field catch defaults, so one malformed field costs only that field,
// not the whole checkpoint (matches the old per-field `?? default` reads).
const miningStateSchema = z.object({
  minedLines: z.number().catch(0),
  subagentLines: z.record(z.string(), z.number()).catch({}),
  tokensIn: z.number().catch(0),
  tokensOut: z.number().catch(0),
  linesAdded: z.number().catch(0),
  linesRemoved: z.number().catch(0),
  toolCounts: z.record(z.string(), z.number()).catch({}),
  toolErrors: z.number().catch(0),
  ctxSamples: z.array(z.number()).catch([]),
  permissionMode: z.string().nullable().catch(null),
  model: z.string().nullable().catch(null),
  contextWindow: z.number().nullable().catch(null),
  rl5: z.number().nullable().catch(null),
  rl5Reset: z.number().nullable().catch(null),
  rl7: z.number().nullable().catch(null),
  rl7Reset: z.number().nullable().catch(null),
  planType: z.string().nullable().catch(null),
  approvalPolicy: z.string().nullable().catch(null),
  sandbox: z.string().nullable().catch(null),
  branch: z.string().nullable().catch(null),
  repository: z.string().nullable().catch(null),
  gitHost: z.string().nullable().catch(null),
  cwd: z.string().nullable().catch(null),
  cost: z.number().nullable().catch(null),
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
