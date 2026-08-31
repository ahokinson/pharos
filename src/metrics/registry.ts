import type { Config } from "@config";
import type { ResolvedPlugins } from "@plugin";
import { BUILTIN_METRICS } from "@metrics/builtins";
import { safeRender } from "@metrics/safe";
import type { Metric, MetricContext } from "@metrics/types";

export interface RegistryResult {
  registry: Record<string, Metric>;
  /** Shallow copy of the input config with each registry id's own
   * row/priority/width/style preferences backfilled wherever the user
   * hadn't already set them — the same "used only if config doesn't
   * already set it" rule plugin authors get for free, built-ins included.
   * The metricStyle backfill isn't load-bearing for rendering
   * (StyleKit.settings merges a metric's own defaults at read time
   * regardless), but it makes config.metricStyle show the effective
   * defaults for `pharos list --json` and hand-editing. */
  config: Config;
}

/** Merges built-in metrics with plugin-registered ones (a plugin id
 * matching a built-in shadows it). Does not mutate the caller's config:
 * the backfilled copy comes back alongside the registry. */
export function buildRegistry(config: Config, resolved: ResolvedPlugins): RegistryResult {
  const registry: Record<string, Metric> = { ...BUILTIN_METRICS };
  for (const [id, metric] of Object.entries(resolved.metrics)) registry[id] = metric;

  const fieldSettings = { ...config.fieldSettings };
  const widths = { ...config.widths };
  const metricStyle = { ...config.metricStyle };
  for (const metric of Object.values(registry)) {
    fieldSettings[metric.id] ??= { row: metric.row ?? 1, priority: metric.priority ?? 50 };
    widths[metric.id] ??= metric.width ?? 0;
    metricStyle[metric.id] ??= structuredClone(metric.styleDefaults ?? {});
  }
  return { registry, config: { ...config, fieldSettings, widths, metricStyle } };
}

/** Computes every id in config.fieldOrder, unpadded. Column widths belong
 * to the status-bar row layout alone (render/compute pads on its way into
 * fitRow): the template surface right-aligns its own values, so a trailing
 * pad would push each one off the card's right edge by a different amount.
 * Iterates fieldOrder rather than the registry's own keys since the id
 * space is open once plugins are involved. The tradeoff for that openness
 * is losing the compile-time exhaustiveness a closed Record<FieldName, ...>
 * would give. A throwing metric (see safeRender) is hidden, not fatal. */
export function buildFieldTexts(ctx: MetricContext, registry: Record<string, Metric>): Partial<Record<string, string | null>> {
  const out: Partial<Record<string, string | null>> = {};
  for (const name of ctx.config.fieldOrder) {
    const metric = registry[name];
    if (!metric) continue;
    out[name] = safeRender(metric, ctx);
  }
  return out;
}
