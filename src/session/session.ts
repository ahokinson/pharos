// Session JSON: the contract with Claude Code's statusLine stdin.

export interface SessionInput {
  model?: { display_name?: string };
  effort?: { level?: string };
  thinking?: { enabled?: boolean };
  fast_mode?: boolean;
  context_window?: { used_percentage?: number; context_window_size?: number };
  cost?: { total_cost_usd?: number; total_lines_added?: number; total_lines_removed?: number };
  rate_limits?: {
    five_hour?: { used_percentage?: number; resets_at?: string | number };
    seven_day?: { used_percentage?: number; resets_at?: string | number };
  };
  transcript_path?: string;
  session_id?: string;
}

export interface Session {
  model: string;
  effort: string;
  thinking: boolean;
  fast: boolean;
  pct: number;
  ctxSize: number;
  cost: number;
  added: number;
  removed: number;
  rl5: number | null;
  rl5Reset: string | number | null;
  rl7: number | null;
  rl7Reset: string | number | null;
  transcript: string;
  sessionId: string;
}

export function parseSession(raw: SessionInput): Session {
  return {
    model: raw.model?.display_name ?? "?",
    effort: raw.effort?.level ?? "",
    thinking: raw.thinking?.enabled ?? false,
    fast: raw.fast_mode ?? false,
    pct: Math.floor(raw.context_window?.used_percentage ?? 0),
    ctxSize: raw.context_window?.context_window_size ?? 200000,
    cost: raw.cost?.total_cost_usd ?? 0,
    added: raw.cost?.total_lines_added ?? 0,
    removed: raw.cost?.total_lines_removed ?? 0,
    rl5: raw.rate_limits?.five_hour?.used_percentage ?? null,
    rl5Reset: raw.rate_limits?.five_hour?.resets_at ?? null,
    rl7: raw.rate_limits?.seven_day?.used_percentage ?? null,
    rl7Reset: raw.rate_limits?.seven_day?.resets_at ?? null,
    transcript: raw.transcript_path ?? "",
    sessionId: raw.session_id ?? "nosession",
  };
}
