import type { PaletteKey } from "@color";
import type { FieldName } from "@config";
import { thinkingCapability } from "@session/capabilities";
import { bucketToolCounts, ToolCategory } from "@tools";
import type { Metric, MetricContext, RampStep } from "@metrics/types";

interface DiffValue {
  added: number;
  removed: number;
}

type DiffStyle = {
  addColor: PaletteKey;
  removeColor: PaletteKey;
  neutralColor: PaletteKey;
};

const DIFF_DEFAULTS: DiffStyle = { addColor: "green", removeColor: "red", neutralColor: "overlay2" };

const diffMetric: Metric<DiffValue> = {
  id: "diff",
  label: "Lines changed",
  row: 1,
  priority: 10,
  width: 7,
  styleDefaults: DIFF_DEFAULTS,
  compute: (ctx) => ({ added: ctx.session.added, removed: ctx.session.removed }),
  render: (value, ctx) => {
    if (value.added === 0 && value.removed === 0) return "";
    const s = ctx.style.settings("diff", DIFF_DEFAULTS);
    const addFg = ctx.style.color(value.added > 0 ? s.addColor : s.neutralColor);
    const remFg = ctx.style.color(value.removed > 0 ? s.removeColor : s.neutralColor);
    // Padded to 3 digits: line counts climb past the two-digit range a
    // session's tool-call counts rarely reach, and a jump like 9 -> 10 would
    // otherwise nudge the removed count sideways mid-session.
    return `${addFg}+${String(value.added).padStart(3)} ${remFg}-${String(value.removed).padStart(3)}`;
  },
};

type CostStyle = {
  steps: RampStep[];
  base: PaletteKey;
  mutedColor: PaletteKey;
};

const COST_DEFAULTS: CostStyle = {
  steps: [
    { at: 15, color: "red" },
    { at: 5, color: "peach" },
    { at: 1, color: "yellow" },
  ],
  base: "green",
  mutedColor: "overlay2",
};

const costMetric: Metric<number> = {
  id: "cost",
  label: "Session cost",
  row: 1,
  priority: 30,
  width: 6,
  styleDefaults: COST_DEFAULTS,
  compute: (ctx) => ctx.session.cost,
  render: (cost, ctx) => {
    if (cost <= 0.01) return "";
    const s = ctx.style.settings("cost", COST_DEFAULTS);
    // On a Claude.ai plan (Pro/Max) the figure is an estimate you aren't
    // billed per session, so it's muted instead of ramped. rate_limits is
    // only sent to subscribers, so its presence is our "on a plan" signal.
    const color = ctx.onPlan ? ctx.style.color(s.mutedColor) : ctx.style.ramp(cost, s);
    // Space-padded as a whole string (not zero-padded — "$02.01" would read
    // wrong) so the dollar sign stays put as the session's running total
    // climbs from single to triple digits.
    return `${color}${`$${cost.toFixed(2)}`.padStart(7)}`;
  },
};

interface TokensValue {
  in: number;
  out: number;
}

type TokensStyle = {
  from: PaletteKey;
  to: PaletteKey;
  labelColor: PaletteKey;
};

const TOKENS_DEFAULTS: TokensStyle = { from: "mauve", to: "sky", labelColor: "text" };

const tokensMetric: Metric<TokensValue> = {
  id: "tokens",
  label: "Tokens in/out",
  row: 1,
  priority: 25,
  width: 13,
  styleDefaults: TOKENS_DEFAULTS,
  compute: (ctx) => ({ in: ctx.mined.tokensIn, out: ctx.mined.tokensOut }),
  render: (value, ctx) => {
    if (value.in <= 0 && value.out <= 0) return "";
    const s = ctx.style.settings("tokens", TOKENS_DEFAULTS);
    const label = ctx.style.color(s.labelColor);
    const inStr = ctx.style.humanize(value.in);
    const outStr = ctx.style.humanize(value.out);
    const span = inStr.length + outStr.length;
    return (
      `${label}↑ ${ctx.style.gradient(inStr, s.from, s.to, 0, span)}` +
      `${label} ↓ ${ctx.style.gradient(outStr, s.from, s.to, inStr.length, span)}`
    );
  },
};

interface ContextValue {
  pct: number | null;
  ctxSize: number;
  samples: number[];
}

type ContextStyle = {
  sparklineWindow: number;
  trendSlopeThreshold: number;
  from: PaletteKey;
  to: PaletteKey;
  sizeColor: PaletteKey;
  risingColor: PaletteKey;
  fallingColor: PaletteKey;
  steadyColor: PaletteKey;
};

const CONTEXT_DEFAULTS: ContextStyle = {
  sparklineWindow: 8,
  trendSlopeThreshold: 1000,
  from: "teal",
  to: "green",
  sizeColor: "text",
  risingColor: "peach",
  fallingColor: "green",
  steadyColor: "overlay2",
};

const contextMetric: Metric<ContextValue> = {
  id: "context",
  label: "Context window usage",
  row: 1,
  priority: 50,
  styleDefaults: CONTEXT_DEFAULTS,
  compute: (ctx) => ({ pct: ctx.session.pct, ctxSize: ctx.session.ctxSize, samples: ctx.mined.ctxSamples }),
  render: (value, ctx) => {
    const s = ctx.style.settings("context", CONTEXT_DEFAULTS);
    // No hook has reported usage and nothing's been mined yet — an em dash
    // stands in rather than a misleading "0%" (same spirit as "?" standing
    // in for an unknown model). Samples wouldn't exist yet either: a mined
    // sample is what turns pct non-null in the first place.
    if (value.pct === null) {
      return `${ctx.style.color(s.sizeColor)}— of ${ctx.style.humanize(value.ctxSize)}`;
    }
    const sparkline = ctx.style.sparkline(value.samples, s.sparklineWindow);
    const trend = ctx.style.trend(value.samples, s.trendSlopeThreshold);
    const trendColor = ctx.style.color(
      trend === "rising" ? s.risingColor : trend === "falling" ? s.fallingColor : s.steadyColor,
    );

    // Padded to "100%"'s width, same reason as the sidecard's rate-limit
    // rows: an unpadded "9%" vs "35%" would shift the sparkline that follows.
    const pctStr = `${String(value.pct).padStart(3)}%`;
    let text: string;
    if (sparkline) {
      const span = pctStr.length + sparkline.length;
      text =
        ctx.style.gradient(pctStr, s.from, s.to, 0, span) +
        " " +
        ctx.style.gradient(sparkline, s.from, s.to, pctStr.length, span);
    } else {
      text = `${ctx.style.color(s.from)}${pctStr}`;
    }
    text += `${ctx.style.color(s.sizeColor)} of ${ctx.style.humanize(value.ctxSize)}`;
    if (trend) text += `${trendColor} ${trend}`;
    return text;
  },
};

type ModelStyle = {
  from: PaletteKey;
  to: PaletteKey;
};

const MODEL_DEFAULTS: ModelStyle = { from: "mauve", to: "sky" };

const modelMetric: Metric<string> = {
  id: "model",
  label: "Model",
  row: 2,
  priority: 100,
  styleDefaults: MODEL_DEFAULTS,
  compute: (ctx) => {
    let text = ctx.session.model;
    const capability = thinkingCapability(ctx.session);
    if (capability) text += ` ${capability}`;
    return text;
  },
  render: (text, ctx) => {
    const s = ctx.style.settings("model", MODEL_DEFAULTS);
    return ctx.style.gradient(text, s.from, s.to);
  },
};

interface RateValue {
  rl5: number | null;
  rl5Reset: string | number | null;
  rl7: number | null;
  rl7Reset: string | number | null;
}

type RateStyle = {
  warnAt: number;
  from: PaletteKey;
  to: PaletteKey;
  mutedColor: PaletteKey;
  mutedResetColor: PaletteKey;
};

const RATE_DEFAULTS: RateStyle = { warnAt: 80, from: "green", to: "red", mutedColor: "overlay0", mutedResetColor: "overlay2" };

// Below warnAt, "of <window>" and "resets <when>" carry two distinct muted
// tones so the two facts read apart; at/above it the whole segment adopts
// the pct's (by then hot) colour so a limit you're about to hit lights up.
function renderRateSegment(pct: number, windowLabel: string, reset: string | number | null, s: RateStyle, ctx: MetricContext): string {
  const color = ctx.style.lerp(pct / 100, s.from, s.to);
  let win = ctx.style.color(s.mutedColor);
  let rst = ctx.style.color(s.mutedResetColor);
  if (pct >= s.warnAt) {
    win = color;
    rst = color;
  }
  let seg = `${color}${pct}%${win} of ${windowLabel}`;
  if (reset !== null && reset !== "") {
    const cd = ctx.style.countdown(reset, ctx.nowEpoch);
    if (cd) seg += `${rst} resets ${cd}`;
  }
  return seg;
}

const rateMetric: Metric<RateValue> = {
  id: "rate",
  label: "Rate limits",
  row: 2,
  priority: 45,
  styleDefaults: RATE_DEFAULTS,
  compute: (ctx) => ({ rl5: ctx.session.rl5, rl5Reset: ctx.session.rl5Reset, rl7: ctx.session.rl7, rl7Reset: ctx.session.rl7Reset }),
  render: (value, ctx) => {
    const s = ctx.style.settings("rate", RATE_DEFAULTS);
    const midDot = "·";
    let text = "";
    if (value.rl5 !== null) {
      text = renderRateSegment(Math.trunc(value.rl5), "5h", value.rl5Reset, s, ctx);
    }
    if (value.rl7 !== null) {
      const seg = renderRateSegment(Math.trunc(value.rl7), "7d", value.rl7Reset, s, ctx);
      text = text ? `${text}  ${ctx.style.color(s.mutedResetColor)}${midDot}  ${seg}` : seg;
    }
    return text || null;
  },
};

type ToolsStyle = {
  categoryOrder: ToolCategory[];
  glyphs: Record<ToolCategory, string>;
  labelColor: PaletteKey;
  countColor: PaletteKey;
  /** Keep a dense dashboard from spending cells on untouched buckets. */
  hideZero: boolean;
};

// Which raw tool name maps to which bucket is fixed in code (src/tools,
// since it's Claude Code's own tool vocabulary and not user data); which
// buckets show, their order, and their glyph are style config.
const TOOLS_DEFAULTS: ToolsStyle = {
  categoryOrder: [
    ToolCategory.Agents,
    ToolCategory.Reads,
    ToolCategory.Searches,
    ToolCategory.Web,
    ToolCategory.Edits,
    ToolCategory.Runs,
    ToolCategory.Other,
  ],
  glyphs: {
    edits: "", // fa-pencil
    reads: "", // fa-book
    runs: "", // fa-terminal
    searches: "", // fa-search
    agents: "", // fa-user
    web: "", // fa-globe
    other: "", // fa-puzzle-piece
  },
  hideZero: false,
  labelColor: "text",
  countColor: "subtext0",
};

const toolsMetric: Metric<Partial<Record<ToolCategory, number>>> = {
  id: "tools",
  label: "Tool call histogram",
  row: 1,
  priority: 40,
  width: 15,
  styleDefaults: TOOLS_DEFAULTS,
  compute: (ctx) => bucketToolCounts(ctx.mined.toolCounts, ctx.bucketFor),
  render: (bucket, ctx) => {
    // Nothing mined at all yet, not just a quiet category: same "blank
    // rather than a wall of zeros" rule diff/cost/tokens already use, and
    // for the same reason — padField still reserves the column, so nothing
    // shifts once real counts start arriving.
    if (Object.values(bucket).every((count) => !count)) return "";
    const s = ctx.style.settings("tools", TOOLS_DEFAULTS);
    const label = ctx.style.color(s.labelColor);
    const count = ctx.style.color(s.countColor);
    // A single space keeps each glyph tight against its own count; two
    // between categories is the gap that keeps three independent counts
    // ("edits 4  reads 5  runs 45") from reading as one run-on digit string
    // the way Guards' single-space join deliberately does for its one group.
    // Each count is padded to 2 digits so a category crossing from 9 to 10
    // calls mid-session doesn't nudge every category after it sideways.
    return s.categoryOrder
      .filter((category) => !s.hideZero || (bucket[category] ?? 0) > 0)
      .map((category) => `${label}${s.glyphs[category] ?? "?"} ${count}${String(bucket[category] ?? 0).padStart(2)}`)
      .join("  ");
  },
};

type ToolErrorsStyle = {
  glyph: string;
  color: PaletteKey;
};

const TOOL_ERRORS_DEFAULTS: ToolErrorsStyle = { glyph: "\uF071", color: "red" }; // fa-warning

// Counts tool_result entries the transcript itself marked is_error, across
// both the main transcript and any subagent ones (see session/mining): a
// reliability signal the tools histogram doesn't carry, since it counts
// calls, not outcomes. Silent unless something actually failed.
const toolErrorsMetric: Metric<number> = {
  id: "toolErrors",
  label: "Failed tool calls",
  row: 1,
  priority: 100,
  styleDefaults: TOOL_ERRORS_DEFAULTS,
  compute: (ctx) => ctx.mined.toolErrors,
  render: (count, ctx) => {
    if (count <= 0) return null;
    const s = ctx.style.settings("toolErrors", TOOL_ERRORS_DEFAULTS);
    return `${ctx.style.color(s.color)}${s.glyph} ${String(count).padStart(2)}`;
  },
};

type PermissionStyle = {
  glyph: string;
  /** Mode -> severity color. Claude Code's own permission-mode vocabulary,
   * not exhaustive by design: an unrecognized mode still renders, in
   * defaultColor, rather than disappearing. */
  colors: Record<string, PaletteKey>;
  defaultColor: PaletteKey;
};

// The known modes as of writing, used only to typo-check the defaults
// below via `satisfies`; PermissionStyle.colors itself stays open (see its
// own comment), so an unrecognized mode Claude Code adds later still works.
type KnownPermissionMode = "bypassPermissions" | "plan" | "acceptEdits";

const PERMISSION_DEFAULTS: PermissionStyle = {
  glyph: "\uF023", // fa-lock
  colors: { bypassPermissions: "red", plan: "sky", acceptEdits: "peach" } satisfies Record<
    KnownPermissionMode,
    PaletteKey
  >,
  defaultColor: "overlay2",
};

// "default" (the common case) is never rendered; every other mode is
// worth a glance, bypassPermissions especially: it's the mode where
// whatever external safety tooling you've wired up via a plugin (see
// examples/guards.ts) is the only thing left standing between the agent
// and the shell.
const permissionMetric: Metric<string | null> = {
  id: "permission",
  label: "Permission mode",
  row: 2,
  priority: 100,
  styleDefaults: PERMISSION_DEFAULTS,
  compute: (ctx) => ctx.mined.permissionMode,
  render: (mode, ctx) => {
    if (!mode || mode === "default") return null;
    const s = ctx.style.settings("permission", PERMISSION_DEFAULTS);
    return `${ctx.style.color(s.colors[mode] ?? s.defaultColor)}${s.glyph} ${mode}`;
  },
};

export const BUILTIN_METRICS: Record<FieldName, Metric> = {
  diff: diffMetric,
  tools: toolsMetric,
  toolErrors: toolErrorsMetric,
  cost: costMetric,
  tokens: tokensMetric,
  context: contextMetric,
  permission: permissionMetric,
  model: modelMetric,
  rate: rateMetric,
};
