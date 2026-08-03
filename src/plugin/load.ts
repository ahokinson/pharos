import type { Config } from "@config";
import type { Plugin, ResolvedPlugins } from "@plugin/types";

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
      const mod = await import(path);
      const plugin = (mod.default ?? mod) as Plugin;
      for (const m of plugin.metrics ?? []) {
        metrics[m.id] = m;
        sources[m.id] = path;
      }
    } catch {}
  }
  return { metrics, sources };
}
