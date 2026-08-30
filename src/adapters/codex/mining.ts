import { z } from "zod";

import { capSamples, parseJsonLine, readNewLines } from "@adapters/shared";
import type { MiningState } from "@session/mining";
import { DEFAULT_SAMPLE_CAP } from "@session/mining";

// Verified against real ~/.codex/sessions/**/rollout-*.jsonl files (Codex
// CLI 0.147.0), not just docs: every line is an envelope, and Codex's own
// docs disclaim this shape as unstable, so treat this file as best-effort
// and re-check it against a real transcript after any Codex upgrade (see
// adapters/types.ts's MiningSupport.BestEffort on this adapter's
// capabilities).
//
//   { "type": "response_item" | "event_msg" | "turn_context" |
//              "world_state" | "session_meta",
//     "timestamp": "...", "payload": { "type": <sub-type>, ... } }
//
// Tool calls are response_item entries with payload.type "function_call"
// (built-in tools) or "custom_tool_call" (MCP/custom tools), both carrying
// a "name". Token/context/rate-limit data all live on event_msg entries
// with payload.type "token_count" — see below for why last_token_usage,
// not total_token_usage, is what gets summed. looseObject everywhere: the
// envelope carries fields this file never reads, and Codex's docs disclaim
// the shape as unstable, so unknown keys must never invalidate a line.
const tokenUsageSchema = z.looseObject({
  input_tokens: z.number().optional(),
  output_tokens: z.number().optional(),
});

const rateWindowSchema = z.looseObject({
  used_percent: z.number().optional(),
  resets_at: z.number().optional(),
});

const envelopeSchema = z.looseObject({
  type: z.string().optional(),
  payload: z
    .looseObject({
      type: z.string().optional(),
      name: z.string().optional(),
      model: z.string().optional(),
      info: z.looseObject({
        last_token_usage: tokenUsageSchema.optional(),
        model_context_window: z.number().optional(),
      }).optional(),
      // Unlike token usage and context, Codex places account-wide limits
      // beside `info`, not inside it (verified from live rollout events).
      rate_limits: z.looseObject({
        plan_type: z.string().optional(),
        primary: rateWindowSchema.optional(),
        secondary: rateWindowSchema.optional(),
      }).optional(),
      thread_settings: z.looseObject({
        approval_policy: z.string().optional(),
        permission_profile: z.looseObject({
          file_system: z.looseObject({ type: z.string().optional() }).optional(),
        }).optional(),
      }).optional(),
      git: z.looseObject({ branch: z.string().optional(), repository_url: z.string().optional() }).optional(),
      cwd: z.string().optional(),
    })
    .optional(),
});

type Envelope = z.infer<typeof envelopeSchema>;

interface Totals {
  tokensIn: number;
  tokensOut: number;
  toolCounts: Record<string, number>;
  model: string | null;
  contextWindow: number | null;
  rl5: number | null;
  rl5Reset: number | null;
  rl7: number | null;
  rl7Reset: number | null;
  planType: string | null;
  approvalPolicy: string | null;
  sandbox: string | null;
  branch: string | null;
  repository: string | null;
  gitHost: string | null;
  cwd: string | null;
}

const TOOL_CALL_PAYLOAD_TYPES = new Set(["function_call", "custom_tool_call"]);

/** Folds one parsed envelope into `totals`. Every real sample checked had
 * `last_token_usage.input_tokens` already inclusive of cached/cache-write
 * tokens, and `output_tokens` already inclusive of reasoning tokens
 * (input_tokens + output_tokens == info.last_token_usage's own total) — so,
 * unlike Claude Code's transcript, there's no separate cache_read/
 * cache_creation field to add in here. */
function mineEnvelope(msg: Envelope, totals: Totals, ctxSamples: number[] | null): void {
  const payload = msg.payload;
  if (!payload) return;

  if (msg.type === "event_msg" && payload.type === "token_count") {
    const usage = payload.info?.last_token_usage;
    if (usage) {
      totals.tokensIn += usage.input_tokens ?? 0;
      totals.tokensOut += usage.output_tokens ?? 0;
      ctxSamples?.push(usage.input_tokens ?? 0);
    }
    if (typeof payload.info?.model_context_window === "number") {
      totals.contextWindow = payload.info.model_context_window;
    }
    const limits = payload.rate_limits;
    if (limits?.plan_type) totals.planType = limits.plan_type;
    if (typeof limits?.primary?.used_percent === "number") {
      totals.rl5 = limits.primary.used_percent;
      totals.rl5Reset = limits.primary.resets_at ?? null;
    }
    if (typeof limits?.secondary?.used_percent === "number") {
      totals.rl7 = limits.secondary.used_percent;
      totals.rl7Reset = limits.secondary.resets_at ?? null;
    }
  } else if (msg.type === "response_item" && TOOL_CALL_PAYLOAD_TYPES.has(payload.type ?? "") && payload.name) {
    totals.toolCounts[payload.name] = (totals.toolCounts[payload.name] ?? 0) + 1;
  }
  // Thread settings arrive as their own `thread_settings_applied` event,
  // independent of token-count reports, and can change during a session.
  if (payload.thread_settings?.approval_policy) totals.approvalPolicy = payload.thread_settings.approval_policy;
  if (payload.thread_settings?.permission_profile?.file_system?.type) {
    totals.sandbox = payload.thread_settings.permission_profile.file_system.type;
  }
  if (payload.git?.branch) totals.branch = payload.git.branch;
  if (payload.cwd) totals.cwd = payload.cwd;
  if (payload.git?.repository_url) {
    const url = payload.git.repository_url;
    const hostMatch = url.match(/(?:@|https?:\/\/)([^/:]+)/);
    if (hostMatch?.[1]) totals.gitHost = hostMatch[1].toLowerCase();
    const remote = url.replace(/\.git$/, "").split(":").pop() ?? url;
    totals.repository = remote.replace(/^\/\//, "").replace(/^.*github\.com\//, "");
  }
  if (typeof payload.model === "string") totals.model = payload.model;
  // No reliable tool-failure signal was found on function_call_output/
  // custom_tool_call_output in any sample checked (no is_error-equivalent
  // field) — toolErrors intentionally stays whatever it already was rather
  // than guessing at one.
}

export async function mineTranscript(transcriptPath: string, state: MiningState, sampleCap: number = DEFAULT_SAMPLE_CAP): Promise<MiningState> {
  if (!transcriptPath) return state;

  const totals: Totals = {
    tokensIn: state.tokensIn,
    tokensOut: state.tokensOut,
    toolCounts: { ...state.toolCounts },
    model: state.model ?? null,
    contextWindow: state.contextWindow ?? null,
    rl5: state.rl5 ?? null,
    rl5Reset: state.rl5Reset ?? null,
    rl7: state.rl7 ?? null,
    rl7Reset: state.rl7Reset ?? null,
    planType: state.planType ?? null,
    approvalPolicy: state.approvalPolicy ?? null,
    sandbox: state.sandbox ?? null,
    branch: state.branch ?? null,
    repository: state.repository ?? null,
    gitHost: state.gitHost ?? null,
    cwd: state.cwd ?? null,
  };
  const ctxSamples = [...state.ctxSamples];
  let minedLines = state.minedLines;

  const { lines, count } = await readNewLines(transcriptPath, state.minedLines);
  for (const line of lines) {
    const msg = parseJsonLine(line, envelopeSchema);
    if (!msg) continue;
    mineEnvelope(msg, totals, ctxSamples);
  }
  minedLines = Math.max(minedLines, count);

  return {
    minedLines,
    // Codex has no equivalent of Claude Code's Task-subagent transcripts in
    // any sample checked; left untouched rather than assumed absent forever.
    subagentLines: state.subagentLines,
    tokensIn: totals.tokensIn,
    tokensOut: totals.tokensOut,
    toolCounts: totals.toolCounts,
    toolErrors: state.toolErrors,
    ctxSamples: capSamples(ctxSamples, sampleCap),
    // No permission-mode-equivalent line type was found in any transcript
    // sample checked.
    permissionMode: state.permissionMode,
    model: totals.model,
    contextWindow: totals.contextWindow,
    rl5: totals.rl5,
    rl5Reset: totals.rl5Reset,
    rl7: totals.rl7,
    rl7Reset: totals.rl7Reset,
    planType: totals.planType,
    approvalPolicy: totals.approvalPolicy,
    sandbox: totals.sandbox,
    branch: totals.branch,
    repository: totals.repository,
    gitHost: totals.gitHost,
    cwd: totals.cwd,
  };
}
