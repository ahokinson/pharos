import type { Config } from "@config";
import type { Plugin, ResolvedPlugins } from "@plugin/types";

/** Runtime check for the one thing loadPlugins relies on: that the module
 * (or its default export) is an object carrying a plausible metrics array.
 * Deeper Metric validation is deliberately left to render time — compute/
 * render are functions, so a schema can only fake-check them, and a broken
 * metric must fail open per-metric anyway, not fail the whole import. */
function isPlugin(mod: unknown): mod is Plugin {
  if (typeof mod !== "object" || mod === null || Array.isArray(mod)) return false;
  const metrics = (mod as { metrics?: unknown }).metrics;
  return metrics === undefined || (Array.isArray(metrics) && metrics.every((m) => typeof m === "object" && m !== null));
}

/** Dynamically imports every configured plugin path and merges their
 * metrics by id (later plugins win on id collision, and a plugin id
 * matching a built-in metric id shadows the built-in). A plugin that
 * fails to import or throws is skipped: fail open, same as config
 * loading, since a broken plugin must never break the statusline. */
export async function loadPlugins(config: Config): Promise<ResolvedPlugins> {
  const metrics: ResolvedPlugins["metrics"] = {};
  const sources: ResolvedPlugins["sources"] = {};
  for (const path of config.plugins) {
    try {
      const candidate: unknown = await import(path).then((mod) => mod.default ?? mod);
      if (!isPlugin(candidate)) continue;
      for (const m of candidate.metrics ?? []) {
        metrics[m.id] = m;
        sources[m.id] = path;
      }
    } catch {
      // fail open: broken plugin skipped, per the jsdoc above
    }
  }
  return { metrics, sources };
}
