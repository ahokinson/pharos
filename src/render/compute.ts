import { resolveAdapter } from "@adapters/registry";
import { padField } from "@color";
import type { Config } from "@config";
import { buildFieldTexts, buildRegistry, buildStyleKit } from "@metrics";
import { loadPlugins } from "@plugin";
import { checkHealth, commandExists } from "@process";
import { loadMiningState, saveMiningState } from "@session";
import { probeGit } from "@session/git";
import { approvalCapability, sandboxCapability, thinkingCapability } from "@session/capabilities";
import type { ExternalSessionData } from "@session/external";
import { emptyExternalState, loadExternalState } from "@session/external";
import { DEFAULT_CTX_SIZE } from "@session/session";
import type { Session } from "@session/session";
import type { Field } from "@render/layout";
import { fitRow } from "@render/layout";

export interface ComputedRows {
  row1: string;
  row2: string;
  /** Formatted, non-null fields for named template renderers. */
  fields: Record<string, string | string[]>;
  tool: string;
}

// No leading "5H"/"7D" label baked into the string: a template places this
// next to its own column label (e.g. sidecard's "5h limit"), and a status
// bar row that wants one can still prefix it itself.
function rateCardLine(pct: number | null, reset: string | number | null, nowEpoch: number, style: ReturnType<typeof buildStyleKit>): string | null {
  if (pct === null) return null;
  const value = Math.max(0, Math.min(100, Math.trunc(pct)));
  const cells = 8;
  const filled = Math.round((value / 100) * cells);
  const color = style.lerp(value / 100, "green", "red");
  const meter = `${"▰".repeat(filled)}${style.color("surface1")}${"▱".repeat(cells - filled)}`;
  const resetText = reset === null ? "" : style.countdown(reset, nowEpoch);
  // Right-padded to "100%"'s width: an unpadded "9%" vs "35%" would shift the
  // meter that follows in the card's right-flushed value cell (see
  // opentuiPane.ts), so the 5h and 7d rows' bars land on the same column
  // regardless of digit count.
  const pctStr = `${String(value).padStart(3)}%`;
  return `${color}${meter} ${pctStr}${style.color("overlay1")}${resetText ? ` ${resetText}` : ""}`;
}

// The card's own harness row already names the host, so a leading vendor
// token is six columns of nothing; a trailing variant tag ("[1m]") is the
// context window, which ctxWindow reports from the real number rather than
// the model id's rounding. "GPT" stays: that's the family, not the vendor.
const VENDOR_PREFIX = /^(?:claude|anthropic|openai|google)-/i;
const VARIANT_TAG = /\[[^\]]*\]$/;

export function prettyModelName(model: string): string {
  const known: Record<string, string> = {
    "gpt-5.6-terra": "GPT 5.6 Terra",
    "gpt-5.6-luna": "GPT 5.6 Luna",
    "gpt-5.6-sol": "GPT 5.6 Sol",
  };
  if (known[model]) return known[model];
  const trimmed = model.replace(VARIANT_TAG, "").trim();
  // Only strip the vendor when something survives it — "claude" on its own
  // is still the most useful name we have for that model.
  const stripped = trimmed.replace(VENDOR_PREFIX, "") || trimmed;
  const resolved = known[stripped];
  if (resolved) return resolved;
  // Every hyphen is a word break, including one before a digit: the older
  // regex only capitalized letters, so "opus-5" kept its hyphen and read
  // "Opus-5".
  return stripped
    .split("-")
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

/** Per-row width budgets, since the delivery surface may give each row its
 * own terminal line (tmux status-format) rather than stacking them. */
export interface RowBudgets {
  row1: number;
  row2: number;
}

/** Hooks for Codex and Claude often omit display metadata that their
 * transcripts contain. Prefer explicit hook values, then an external source
 * (`external` — a host's own `statusLine`-style invocation, the only place
 * cost/context-window-size/rate-limits ever come from for Claude, since no
 * hook event carries them), then backfill from the latest mined turn,
 * without ever inventing cost, diff, or rate-limit data. */
export function enrichSession(
  session: Session,
  mined: Awaited<ReturnType<typeof loadMiningState>>,
  external: ExternalSessionData = emptyExternalState(),
): Session {
  const latestContext = mined.ctxSamples.at(-1);
  const ctxSize =
    session.ctxSize === DEFAULT_CTX_SIZE ? external.contextWindow ?? mined.contextWindow ?? session.ctxSize : session.ctxSize;
  const canDeriveContext = session.pct === null && typeof latestContext === "number" && ctxSize > 0;
  const derivedPct = canDeriveContext ? Math.min(100, Math.floor((latestContext / ctxSize) * 100)) : null;
  // The session line delta is whatever the transcript's edit calls actually
  // produced; only a host-reported total (Claude's cost.total_lines_*) is
  // trusted when the session's edits were unrecoverable — never the other
  // way around, and never a whole-worktree diff.
  const minedAnyDiff = mined.linesAdded > 0 || mined.linesRemoved > 0;
  return {
    ...session,
    model: session.model === "?" ? mined.model ?? session.model : session.model,
    cost: session.cost === 0 ? external.cost ?? mined.cost ?? session.cost : session.cost,
    ctxSize,
    // external.pct is Anthropic's own reported percentage — more authoritative
    // than derivedPct, our own estimate off sampled turn totals.
    pct: session.pct ?? external.pct ?? derivedPct,
    added: minedAnyDiff ? mined.linesAdded : session.added,
    removed: minedAnyDiff ? mined.linesRemoved : session.removed,
    rl5: session.rl5 ?? external.rl5 ?? mined.rl5 ?? null,
    rl5Reset: session.rl5Reset ?? external.rl5Reset ?? mined.rl5Reset ?? null,
    rl7: session.rl7 ?? external.rl7 ?? mined.rl7 ?? null,
    rl7Reset: session.rl7Reset ?? external.rl7Reset ?? mined.rl7Reset ?? null,
  };
}

/** The one place a host's raw hook/stdin payload turns into rendered field
 * text for the tmux status surface (see adapters/types.ts's
 * TmuxStatusSupport). `raw` is whatever the calling entrypoint read from
 * stdin — the resolved adapter's parseSession decides what to make of it. */
export async function computeRows(raw: unknown, config: Config, budgets: RowBudgets): Promise<ComputedRows> {
  const adapter = resolveAdapter(config);
  const parsedSession = adapter.parseSession(raw);
  const nowEpoch = Math.floor(Date.now() / 1000);

  const resolved = await loadPlugins(config);
  const { registry, config: effective } = buildRegistry(config, resolved);

  const mined = await adapter.mineTranscript(
    parsedSession.transcript,
    await loadMiningState(parsedSession.sessionId),
    config.context.sampleCap,
  );
  // Hooks run in the agent's working directory, which is the only handle
  // Claude Code and opencode give us on one — neither carries repository
  // metadata the way Codex's payload and Hermes's DB do. Probing before the
  // checkpoint is saved means origin's URL is resolved once per session
  // rather than once per hook: it cannot change while a session runs.
  const cwd = mined.cwd ?? process.cwd();
  const git = probeGit(cwd, { remote: !mined.repository });
  if (git) {
    mined.cwd = cwd;
    // The live branch wins: a host's transcript records whatever was checked
    // out when it wrote that line, while the probe just read HEAD. Repository
    // and host go the other way — a host that reports a remote URL outright
    // (Codex) is at least as good as parsing origin's, and this is the value
    // being memoized, so it should stay stable once resolved.
    mined.branch = git.branch ?? mined.branch ?? null;
    mined.repository = mined.repository ?? git.repository;
    mined.gitHost = mined.gitHost ?? git.host;
  }
  await saveMiningState(parsedSession.sessionId, mined);
  const external = await loadExternalState(parsedSession.sessionId);
  const session = enrichSession(parsedSession, mined, external);

  const onPlan = session.rl5 !== null || session.rl7 !== null;
  const style = buildStyleKit(effective);
  // named processKit, not process, so it doesn't shadow the global `process`
  // callers of this function generally also use (process.env, process.stdout).
  const processKit = { commandExists, checkHealth };

  const texts = buildFieldTexts(
    { session, mined, onPlan, nowEpoch, config: effective, style, process: processKit, bucketFor: adapter.bucketFor },
    registry,
  );
  const fields: Field[] = [];
  for (const name of config.fieldOrder) {
    const text = texts[name];
    if (text === null || text === undefined) continue;
    const setting = effective.fieldSettings[name];
    if (!setting) continue;
    // Column padding is a status-bar concern only, applied here rather than
    // in buildFieldTexts so the same metric text can reach a template
    // surface unpadded — see that function's comment.
    fields.push({ line: setting.row, text: padField(text, effective.widths[name] ?? 0), priority: setting.priority });
  }

  const renderedFields: Record<string, string | string[]> = Object.fromEntries(
    Object.entries(texts).filter((entry): entry is [string, string] => typeof entry[1] === "string"),
  );
  // The card's Context row drops the " of <window>" tail the status-bar
  // field carries: the window size is a constant for the whole session, so
  // repeating it every render costs ~8 of the ~26 columns a narrow card has
  // to spend. `ctxWindow` below publishes it once, for the Model row.
  if (texts.context) {
    renderedFields.contextCard = texts.context
      .replace(` of ${style.humanize(session.ctxSize)}`, "")
      .replace(/\x1b\[[0-9;]*m (?:rising|falling|steady)$/, "");
  }
  renderedFields.ctxWindow = `${style.color("overlay1")}${style.humanize(session.ctxSize)}`;
  // A status bar benefits from one compact rate field; a narrow sidecard
  // needs each account window on its own row. The middot is emitted only
  // by the built-in rate metric, and splitting preserves each segment's
  // ANSI coloring while giving templates an iterable `rateLines` value.
  if (typeof renderedFields.rate === "string") {
    const [rate5, rate7] = renderedFields.rate.split("·").map((segment) => segment.trim());
    if (rate5) renderedFields.rate5 = rate5;
    if (rate7) renderedFields.rate7 = rate7;
  }
  // Keep the sidecard's identity readable at 30 columns: the status-bar
  // `model` field is a single rich string, while templates can place the
  // model name and its capability flags on intentional separate rows.
  renderedFields.modelName = style.gradient(prettyModelName(session.model), "mauve", "sky");
  const profile = [
    mined.planType ? mined.planType[0]!.toUpperCase() + mined.planType.slice(1) : "",
  ].filter(Boolean).join(" · ");
  if (profile) renderedFields.profile = `${style.color("green")}${profile}`;
  const agent = thinkingCapability(session);
  if (agent) renderedFields.agent = `${style.color("mauve")}${agent}`;
  const harnessNames: Record<string, string> = { codex: "Codex", claude: "Claude", opencode: "OpenCode", hermes: "Hermes" };
  renderedFields.harness = harnessNames[adapter.id] ?? adapter.id;
  const approval = approvalCapability(mined.approvalPolicy ?? mined.permissionMode);
  if (approval) renderedFields.approval = `${style.color("yellow")}${approval}`;
  const sandbox = sandboxCapability(mined.sandbox);
  if (sandbox) renderedFields.sandbox = `${style.color("peach")}${sandbox}`;
  if (mined.branch) renderedFields.branch = `${style.color("sky")}${mined.branch}`;
  if (mined.repository || mined.branch) {
    const project = (mined.repository ?? "workspace").split("/").pop() ?? "workspace";
    renderedFields.project = `${style.color("overlay1")}${project}${mined.branch ? ` · ${mined.branch}` : ""}`;
    if (mined.repository) renderedFields.remote = `${style.color("sky")}${mined.repository}`;
    if (mined.gitHost) {
      const host = mined.gitHost.includes("gitlab") ? "GitLab" : mined.gitHost.includes("codeberg") ? "Codeberg" : "GitHub";
      renderedFields.gitProvider = `${style.color("sky")}${host}`;
      const gitIcon = mined.gitHost.includes("gitlab") ? "" : mined.gitHost.includes("codeberg") ? "" : "";
      renderedFields.gitIcon = gitIcon;
      // The provider's glyph says what the word "GitHub" says in one column
      // instead of six — worth the trade on a card whose Remote row would
      // otherwise spend a quarter of its width on the host's name.
      if (mined.repository) {
        renderedFields.origin = `${style.color("sky")}${gitIcon} ${mined.repository}`;
      }
    }
  }
  // A null probe is "not a worktree, or git didn't answer" — distinct from a
  // clean one, and left unset so the card shows its own placeholder. The
  // code this replaces read an unchecked exit code, so any failure (a
  // non-repo cwd included) claimed "clean".
  if (git) {
    renderedFields.worktree = git.dirtyFiles > 0
      ? `${style.color("peach")}● ${git.dirtyFiles} dirty`
      : `${style.color("green")}● clean`;
    // Untracked files are dirty but contribute no numstat rows, so a
    // worktree holding only new files would read "+0  −0". Same rule the
    // diff/cost/tokens metrics follow: say nothing rather than say zero.
    if (git.added > 0 || git.removed > 0) {
      renderedFields.worktreeDiff = `${style.color("green")}+${git.added}  ${style.color("red")}−${git.removed}`;
    }
  }
  const cardRate5 = rateCardLine(session.rl5, session.rl5Reset, nowEpoch, style);
  const cardRate7 = rateCardLine(session.rl7, session.rl7Reset, nowEpoch, style);
  if (cardRate5) renderedFields.rate5 = cardRate5;
  if (cardRate7) renderedFields.rate7 = cardRate7;
  return { row1: fitRow(fields, 1, budgets.row1), row2: fitRow(fields, 2, budgets.row2), fields: renderedFields, tool: adapter.id };
}
