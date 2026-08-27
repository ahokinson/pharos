import { gradient, lerpColor } from "@color";
import type { Config } from "@config";
import type { RampStyle, StyleKit } from "@metrics/types";

const TICKS = "▁▂▃▄▅▆▇█";
const TREND_WINDOW = 4;
const SECONDS_PER_DAY = 86400;
const SECONDS_PER_HOUR = 3600;

export function sparkline(samples: number[], window: number): string {
  const turns = samples.length;
  if (turns < 2) return "";
  const w = Math.min(window, turns);
  const slice = samples.slice(turns - w);
  const lo = Math.min(...slice);
  const hi = Math.max(...slice);
  const span = hi - lo;
  let out = "";
  for (const sample of slice) {
    // Scale each sample onto TICKS' full range. span === 0 (every visible
    // sample equal) lands everything on tick 0.
    const idx = span > 0 ? Math.floor(((sample - lo) * (TICKS.length - 1)) / span) : 0;
    out += TICKS[idx] ?? "";
  }
  return out;
}

export function trend(samples: number[], slopeThreshold: number): "rising" | "falling" | "steady" | "" {
  if (samples.length < TREND_WINDOW) return "";
  const oldest = samples[samples.length - TREND_WINDOW];
  const latest = samples[samples.length - 1];
  if (oldest === undefined || latest === undefined) return "";
  const slope = Math.trunc((latest - oldest) / (TREND_WINDOW - 1));
  if (slope > slopeThreshold) return "rising";
  if (slope < -slopeThreshold) return "falling";
  return "steady";
}

/** ISO8601 string, bare epoch (string or number) -> "Nd"/"Nh"/"Nm"/"now"/"" */
export function countdown(value: string | number, nowEpoch: number): string {
  let target: number;
  if (typeof value === "number") {
    target = value;
  } else if (/^\d+$/.test(value)) {
    target = Number(value);
  } else {
    const parsed = Date.parse(value);
    if (Number.isNaN(parsed)) return "";
    target = Math.floor(parsed / 1000);
  }
  const remaining = target - nowEpoch;
  if (remaining <= 0) return "now";
  if (remaining >= SECONDS_PER_DAY) return `${Math.floor(remaining / SECONDS_PER_DAY)}d`;
  if (remaining >= SECONDS_PER_HOUR) return `${Math.floor(remaining / SECONDS_PER_HOUR)}h`;
  return `${Math.floor(remaining / 60)}m`;
}

/** integer -> "1.2M" / "34k" / "789" */
export function humanize(n: number): string {
  if (n >= 1000000) {
    const m = (n / 1000000).toFixed(1);
    return `${m.endsWith(".0") ? m.slice(0, -2) : m}M`;
  }
  if (n >= 1000) return `${Math.floor(n / 1000)}k`;
  return String(n);
}

export function ramp(palette: Config["palette"], value: number, style: RampStyle): string {
  const step = [...style.steps].sort((a, b) => b.at - a.at).find((s) => value >= s.at);
  return palette[step?.color ?? style.base];
}

/** Built once per render (see metrics/registry), then threaded through
 * every metric's MetricContext so built-ins and plugins share one set of
 * coloring/formatting primitives instead of each hand-rolling ANSI math
 * or reaching into ../color themselves. */
export function buildStyleKit(config: Config): StyleKit {
  const p = config.palette;
  return {
    settings(id, defaults) {
      // config.metricStyle is an open, string-keyed bag (see config/types).
      // This is the one place a metric's declared style shape gets its bag
      // narrowed back to the shape it asked for — the same trust level as
      // the metric's own compute()/render() calls.
      return { ...defaults, ...(config.metricStyle[id] as Partial<typeof defaults> | undefined) };
    },
    ramp: (value, style) => ramp(p, value, style),
    lerp: (t, fromKey, toKey) => lerpColor(t, p[fromKey], p[toKey]),
    gradient: (text, fromKey, toKey, offset, span) => gradient(text, p[fromKey], p[toKey], offset, span),
    sparkline,
    trend,
    countdown,
    humanize,
    color: (key) => p[key],
  };
}
