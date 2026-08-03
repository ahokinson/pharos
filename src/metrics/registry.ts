import { padField } from "@color";
import type { Config } from "@config";
import type { ResolvedPlugins } from "@plugin";
import { BUILTIN_METRICS } from "@metrics/builtins";
import { safeRender } from "@metrics/safe";
import type { Metric, MetricContext } from "@metrics/types";

/** Merges built-in metrics with plugin-registered ones (a plugin id
 * matching a built-in shadows it) and backfills each metric's own
 * row/priority/width/style preferences into config wherever the user
 * hasn't already set them, the same "used only if config doesn't already
 * set it" rule plugin authors get for free, built-ins included. The
 * metricStyle backfill isn't load-bearing for rendering (StyleKit.settings
 * merges a metric's own defaults at read time regardless), but it makes
 * config.metricStyle show the effective defaults for `pharos list --json`
 * and hand-editing. */
export function buildRegistry(config: Config, resolved: ResolvedPlugins): Record<string, Metric> {
  const registry: Record<string, Metric> = { ...BUILTIN_METRICS };
  for (const [id, metric] of Object.entries(resolved.metrics)) registry[id] = metric;

  for (const metric of Object.values(registry)) {
    config.fieldSettings[metric.id] ??= { row: metric.row ?? 1, priority: metric.priority ?? 50 };
    config.widths[metric.id] ??= metric.width ?? 0;
    config.metricStyle[metric.id] ??= structuredClone(metric.styleDefaults ?? {});
  }
  return registry;
}

/** Computes every id in config.fieldOrder, width-padded. Iterates
 * fieldOrder rather than the registry's own keys since the id space is
 * open once plugins are involved. The tradeoff for that openness is
 * losing the compile-time exhaustiveness a closed Record<FieldName, ...>
 * would give. A throwing metric (see safeRender) is hidden, not fatal. */
export function buildFieldTexts(ctx: MetricContext, registry: Record<string, Metric>): Partial<Record<string, string | null>> {
  const out: Partial<Record<string, string | null>> = {};
  for (const name of ctx.config.fieldOrder) {
    const metric = registry[name];
    if (!metric) continue;
    const raw = safeRender(metric, ctx);
    out[name] = raw === null ? null : padField(raw, ctx.config.widths[name] ?? 0);
  }
  return out;
}
