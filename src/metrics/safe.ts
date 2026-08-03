import type { Metric, MetricContext } from "@metrics/types";

/** A metric that throws (built-in or plugin) is hidden, never fatal: the
 * same fail-open guarantee plugin import already has (src/plugin/load.ts),
 * now covering render time too. */
export function safeRender<T>(metric: Metric<T>, ctx: MetricContext): string | null {
  try {
    return metric.render(metric.compute(ctx), ctx);
  } catch {
    return null;
  }
}
