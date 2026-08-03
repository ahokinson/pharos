import type { Metric } from "@metrics";

export interface Plugin {
  metrics?: Metric[];
}

export interface ResolvedPlugins {
  metrics: Record<string, Metric>;
  /** id -> the plugin path that contributed it, for `pharos list`. */
  sources: Record<string, string>;
}
