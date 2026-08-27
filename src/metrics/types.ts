import type { PaletteKey } from "@color";
import type { Config } from "@config";
import type { HealthStatus } from "@process";
import type { MiningState, Session } from "@session";
import type { ToolCategory } from "@tools";

export interface MetricContext {
  session: Session;
  mined: MiningState;
  onPlan: boolean;
  nowEpoch: number;
  config: Config;
  style: StyleKit;
  process: ProcessKit;
  /** The active host adapter's tool-name lookup (see each adapter's own
   * bucket.ts) — threaded through so the built-in `tools` metric never
   * needs to know which host is running. */
  bucketFor(toolName: string): ToolCategory;
}

/** External-tool-liveness helpers, threaded through context so a plugin
 * never has to hand-roll PATH scanning or requirements checking itself,
 * the same reasoning as StyleKit for coloring. Not guard-specific: any
 * plugin reporting on an external dependency can use these. */
export interface ProcessKit {
  commandExists(bin: string): boolean;
  checkHealth(binary: string, requirements?: string[], sentinel?: string): HealthStatus;
}

/** A metric's raw data, computed once per render with no ANSI attached.
 * render() turns it into text (or null, to hide the field this render):
 * the one place styling and the show/hide decision happen. row/priority/
 * width/styleDefaults are the metric's own preferred defaults, used only
 * where the user's config doesn't already set them (see metrics/registry). */
export interface Metric<T = unknown> {
  id: string;
  label?: string;
  row?: 1 | 2;
  priority?: number;
  width?: number;
  styleDefaults?: Record<string, unknown>;
  compute(ctx: MetricContext): T;
  render(value: T, ctx: MetricContext): string | null;
}

export interface RampStep {
  at: number;
  color: PaletteKey;
}

/** A descending-threshold ramp: the first step whose `at` the value meets
 * or exceeds wins, else `base`. Steps need not be pre-sorted. */
export interface RampStyle {
  steps: RampStep[];
  base: PaletteKey;
}

export interface StyleKit {
  /** This id's style config, shallow-merged over `defaults`: the generic
   * per-id extension point any metric (built-in or plugin) reads its own
   * config.metricStyle[id] bag through, without config's closed shape
   * needing to know about it in advance. */
  settings<T extends object>(id: string, defaults: T): T;
  ramp(value: number, style: RampStyle): string;
  lerp(t: number, fromKey: PaletteKey, toKey: PaletteKey): string;
  gradient(text: string, fromKey: PaletteKey, toKey: PaletteKey, offset?: number, span?: number): string;
  sparkline(samples: number[], window: number): string;
  trend(samples: number[], slopeThreshold: number): "rising" | "falling" | "steady" | "";
  countdown(value: string | number, nowEpoch: number): string;
  humanize(n: number): string;
  color(key: PaletteKey): string;
}
