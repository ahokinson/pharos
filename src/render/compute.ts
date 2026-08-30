import { resolveAdapter } from "@adapters/registry";
import type { Config } from "@config";
import { buildFieldTexts, buildRegistry, buildStyleKit } from "@metrics";
import { loadPlugins } from "@plugin";
import { checkHealth, commandExists, runSync } from "@process";
import { loadMiningState, saveMiningState } from "@session";
import { approvalCapability, sandboxCapability, thinkingCapability } from "@session/capabilities";
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

function rateCardLine(label: string, pct: number | null, reset: string | number | null, nowEpoch: number, style: ReturnType<typeof buildStyleKit>): string | null {
  if (pct === null) return null;
  const value = Math.max(0, Math.min(100, Math.trunc(pct)));
  const cells = 8;
  const filled = Math.round((value / 100) * cells);
  const color = style.lerp(value / 100, "green", "red");
  const meter = `${"▰".repeat(filled)}${style.color("surface1")}${"▱".repeat(cells - filled)}`;
  const resetText = reset === null ? "" : style.countdown(reset, nowEpoch);
  return `${style.color("overlay1")}${label} ${color}${meter} ${value}%${style.color("overlay1")}${resetText ? ` ${resetText}` : ""}`;
}

function prettyModelName(model: string): string {
  const known: Record<string, string> = {
    "gpt-5.6-terra": "GPT 5.6 Terra",
    "gpt-5.6-luna": "GPT 5.6 Luna",
    "gpt-5.6-sol": "GPT 5.6 Sol",
  };
  return known[model] ?? model.replace(/(^|-)([a-z])/g, (_match, _separator, letter) => ` ${letter.toUpperCase()}`).trim();
}

/** Per-row width budgets, since the delivery surface may give each row its
 * own terminal line (tmux status-format) rather than stacking them. */
export interface RowBudgets {
  row1: number;
  row2: number;
}

/** Hooks for Codex and Claude often omit display metadata that their
 * transcripts contain. Prefer explicit hook values, then backfill from the
 * latest mined turn without inventing cost, diff, or rate-limit data. */
export function enrichSession(session: Session, mined: Awaited<ReturnType<typeof loadMiningState>>): Session {
  const latestContext = mined.ctxSamples.at(-1);
  const ctxSize = session.ctxSize === DEFAULT_CTX_SIZE ? mined.contextWindow ?? session.ctxSize : session.ctxSize;
  const canDeriveContext = session.pct === 0 && typeof latestContext === "number" && ctxSize > 0;
  return {
    ...session,
    model: session.model === "?" ? mined.model ?? session.model : session.model,
    cost: session.cost === 0 ? mined.cost ?? session.cost : session.cost,
    ctxSize,
    pct: canDeriveContext ? Math.min(100, Math.floor((latestContext / ctxSize) * 100)) : session.pct,
    rl5: session.rl5 ?? mined.rl5 ?? null,
    rl5Reset: session.rl5Reset ?? mined.rl5Reset ?? null,
    rl7: session.rl7 ?? mined.rl7 ?? null,
    rl7Reset: session.rl7Reset ?? mined.rl7Reset ?? null,
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
  await saveMiningState(parsedSession.sessionId, mined);
  const session = enrichSession(parsedSession, mined);

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
    fields.push({ line: setting.row, text, priority: setting.priority });
  }

  const renderedFields: Record<string, string | string[]> = Object.fromEntries(
    Object.entries(texts).filter((entry): entry is [string, string] => typeof entry[1] === "string"),
  );
  if (texts.context) {
    renderedFields.contextCard = texts.context
      .replace(" of ", " · ")
      .replace(/\x1b\[[0-9;]*m (?:rising|falling|steady)$/, "");
  }
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
      renderedFields.gitIcon = mined.gitHost.includes("gitlab") ? "" : mined.gitHost.includes("codeberg") ? "" : "";
    }
  }
  if (mined.cwd) {
    const status = runSync(["git", "-C", mined.cwd, "status", "--porcelain"]).stdout.trim();
    if (status) {
      const files = status.split("\n").filter(Boolean).length;
      const diff = runSync(["git", "-C", mined.cwd, "diff", "--numstat"]).stdout.trim();
      let added = 0;
      let removed = 0;
      for (const line of diff.split("\n")) {
        const [a, d] = line.split("\t");
        added += Number(a) || 0;
        removed += Number(d) || 0;
      }
      renderedFields.worktree = `${style.color("peach")}● dirty${style.color("overlay1")} · ${files} files`;
      renderedFields.worktreeDiff = `${style.color("green")}+${added}  ${style.color("red")}−${removed}`;
    } else {
      renderedFields.worktree = `${style.color("green")}● clean`;
    }
  }
  const cardRate5 = rateCardLine("5H", session.rl5, session.rl5Reset, nowEpoch, style);
  const cardRate7 = rateCardLine("7D", session.rl7, session.rl7Reset, nowEpoch, style);
  if (cardRate5) renderedFields.rate5 = cardRate5;
  if (cardRate7) renderedFields.rate7 = cardRate7;
  return { row1: fitRow(fields, 1, budgets.row1), row2: fitRow(fields, 2, budgets.row2), fields: renderedFields, tool: adapter.id };
}
