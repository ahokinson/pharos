// The normalized session shape every metric consumes. Producing one from a
// host's raw stdin JSON (Claude Code's SessionInput, or another host's own
// shape) is an adapter's job — see src/adapters/*/session.ts.

/** Claude Code's documented default context-window size; the fallback when
 * a host payload doesn't report one. */
export const DEFAULT_CTX_SIZE = 200_000;

/** sessionId sentinel for renders with no session behind them (tests, cold
 * starts); keeps checkpoint paths and metrics total. */
export const NO_SESSION_ID = "nosession";

export interface Session {
  model: string;
  effort: string;
  thinking: boolean;
  fast: boolean;
  /** Context-window usage percent, or null when nothing has reported one
   * yet — never overload 0 onto "unknown," the same distinction rl5/rl7
   * already draw for rate limits. */
  pct: number | null;
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
