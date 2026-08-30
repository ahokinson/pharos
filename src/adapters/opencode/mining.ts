// Rebuilds MiningState from the opencode DB on every render, rather than
// checkpointing incrementally like the JSONL adapters: SQLite rows mutate
// (tool parts go pending→running→error, message tokens finalize as they
// stream), so a "lines already read" checkpoint would silently miss status
// transitions. The aggregate reads below are single-digit milliseconds, so
// rebuilding is both simpler and more honest than partial updates. The
// `prior` argument survives only as the fail-open return when the DB is
// unreadable or the session id doesn't resolve; loadMiningState/
// saveMiningState still round-trip the result as a debuggable checkpoint.
import { assistantMessages, getChildSessionIds, getSessionRow, openDb, toolParts, userMessageDiffs } from "@adapters/opencode/db";
import type { OpencodeMessage, OpencodeToolPart } from "@adapters/opencode/db";
import { capSamples } from "@adapters/shared";
import { DEFAULT_SAMPLE_CAP } from "@session/mining";
import type { MiningState } from "@session/mining";
import { NO_SESSION_ID } from "@session/session";

interface TokenTotals {
  in: number;
  out: number;
}

/** Mirrors the claude adapter's accounting: tokensIn counts everything
 * read into the model (input + cache read + cache write), tokensOut counts
 * everything it produced (output + reasoning). `ctxSamples`, when given,
 * gets each message's context fill appended — main conversation only, per
 * the ctxSamples contract in session/mining.ts. */
function foldMessages(messages: OpencodeMessage[], tokens: TokenTotals, ctxSamples: number[] | null): void {
  for (const m of messages) {
    const t = m.tokens;
    if (!t) continue;
    tokens.in += (t.input ?? 0) + (t.cache?.read ?? 0) + (t.cache?.write ?? 0);
    tokens.out += (t.output ?? 0) + (t.reasoning ?? 0);
    const total = t.total ?? 0;
    // A zero total means the message is still streaming its first usage
    // report (see db.ts) — not a context drop to zero.
    if (ctxSamples && total > 0) ctxSamples.push(total);
  }
}

function foldToolParts(parts: OpencodeToolPart[], toolCounts: Record<string, number>, errors: { count: number }): void {
  for (const p of parts) {
    if (!p.tool) continue;
    toolCounts[p.tool] = (toolCounts[p.tool] ?? 0) + 1;
    if (p.state?.status === "error") errors.count++;
  }
}

// opencode's message `mode` is the agent mode that produced the message
// ("build", "plan", "explore", "compaction" observed in a real DB). "build"
// is opencode's default mode, so it maps to "default" — the one value the
// permission metric renders nothing for; every other mode is worth the
// column when enabled. The latest message wins: mode is per-message, so a
// mode switch mid-session shows the live one.
function permissionModeFrom(messages: OpencodeMessage[]): string | null {
  for (let i = messages.length - 1; i >= 0; i--) {
    const mode = messages[i]!.mode;
    if (mode) return mode === "build" ? "default" : mode;
  }
  return null;
}

export async function mineTranscript(
  ref: string,
  state: MiningState,
  sampleCap: number = DEFAULT_SAMPLE_CAP,
): Promise<MiningState> {
  // `ref` is the opencode session id (session.transcript carries it for
  // this adapter, the same overload codex applies to transcript_path).
  if (!ref || ref === NO_SESSION_ID) return state;

  const db = openDb();
  if (!db) return state;
  try {
    if (!getSessionRow(db, ref)) return state;
    const childIds = getChildSessionIds(db, ref);

    const tokens: TokenTotals = { in: 0, out: 0 };
    const ctxSamples: number[] = [];
    const toolCounts: Record<string, number> = {};
    const errors = { count: 0 };
    // Per-turn diffs opencode recorded on user messages. The session-level
    // summary_* columns are zeroed since v1.16 (see README Known gaps), so
    // these are the honest session line delta; summing turn deltas matches
    // how opencode's own maintainers restore the sidebar aggregate.
    let linesAdded = 0;
    let linesRemoved = 0;
    // Row counts, informational only under rebuild semantics (nothing reads
    // them back); they make the persisted checkpoint a quick sanity read.
    let messageCount = 0;
    const subagentLines: Record<string, number> = {};

    // Main conversation: everything, plus the context burn-down samples.
    const own = assistantMessages(db, ref);
    messageCount += own.length;
    foldMessages(own, tokens, ctxSamples);
    foldToolParts(toolParts(db, ref), toolCounts, errors);
    for (const delta of userMessageDiffs(db, ref)) {
      linesAdded += delta.added;
      linesRemoved += delta.removed;
    }

    // Subagent children: totals fold in (their work is still this session's
    // work), but never ctxSamples — context-window fill is specifically
    // the main conversation's window, same rule as the claude adapter.
    for (const childId of childIds) {
      const childMessages = assistantMessages(db, childId);
      const childParts = toolParts(db, childId);
      messageCount += childMessages.length;
      subagentLines[childId] = childParts.length;
      foldMessages(childMessages, tokens, null);
      foldToolParts(childParts, toolCounts, errors);
      for (const delta of userMessageDiffs(db, childId)) {
        linesAdded += delta.added;
        linesRemoved += delta.removed;
      }
    }

    return {
      minedLines: messageCount,
      subagentLines,
      tokensIn: tokens.in,
      tokensOut: tokens.out,
      linesAdded,
      linesRemoved,
      toolCounts,
      toolErrors: errors.count,
      ctxSamples: capSamples(ctxSamples, sampleCap),
      permissionMode: permissionModeFrom(own),
    };
  } finally {
    db.close();
  }
}
