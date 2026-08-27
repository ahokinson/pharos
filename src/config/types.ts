import type { AdapterName } from "@adapters/types";
import type { Palette, PaletteKey } from "@color";

// The metric ids pharos computes itself, and their left-to-right render
// order. Config's actual fields (below) are string-keyed, not
// FieldName-keyed, so a plugin can add ids beyond this set; FIELD_NAMES/
// FieldName just document/type the built-ins, and double as the base
// defaults.ts derives DEFAULT_FIELD_ORDER from (minus "permission", which
// is opt-in only — see the comment there) so the two can't drift apart.
export const FIELD_NAMES = [
  "diff",
  "tools",
  "toolErrors",
  "cost",
  "tokens",
  "context",
  "permission",
  "model",
  "rate",
] as const;

export type FieldName = (typeof FIELD_NAMES)[number];

export type RowNumber = 1 | 2;

export type ThemeColorKey = "think" | "tool" | "ask" | "background";

export interface FieldSetting {
  row: RowNumber;
  /** Lowest-priority droppable field on a row goes first when it's too
   * narrow to fit. >=100 is never dropped. */
  priority: number;
}

export interface Config {
  /** Which host CLI pharos is rendering for (see src/adapters). */
  tool: AdapterName;
  palette: Palette;
  /** Which metrics render, and in what left-to-right order. Omitting an id
   * disables it entirely. A plugin's metric id is just another entry here. */
  fieldOrder: string[];
  fieldSettings: Record<string, FieldSetting>;
  widths: Record<string, number>;
  /** Metric id -> its own style config (ramp thresholds, palette-key
   * gradient endpoints, glyphs...). Open and string-keyed so a plugin's
   * metric can declare its own shape here too; see StyleKit.settings in
   * src/metrics/types, which is how a metric reads its own bag back. */
  metricStyle: Record<string, Record<string, unknown>>;
  /** How many recent context-window samples mineTranscript retains. A
   * data-pipeline bound, not a style choice, so it lives here rather than
   * in metricStyle.context. */
  context: { sampleCap: number };
  pulse: {
    tail: number;
    stepMs: number;
    sweep: number;
    gapFraction: number;
    statusLeft: number;
    leadSpace: number;
    margin: number;
    remeasureEvery: number;
    /** tmux user-option names to read live theme colors from. */
    themeVars: Record<ThemeColorKey, string>;
    /** Hex fallbacks used when a theme var isn't set. */
    fallbackColors: Record<ThemeColorKey, string>;
  };
  /** Absolute paths (env-expanded) to plugin modules, dynamically imported
   * at startup. A plugin registers new metrics; see src/plugin. A plugin
   * that fails to load is skipped, never breaks the statusline. */
  plugins: string[];
}

// Deep-partial of Config, as read from the JSON config file. Every field is
// optional; anything omitted keeps its default.
export interface RawConfig {
  /** Raw string as read from JSON; validated/cast to AdapterName at merge time,
   * falling back to the default on an unrecognized value. */
  tool?: string;
  palette?: Partial<Record<PaletteKey, string>>;
  fieldOrder?: string[];
  fieldSettings?: Record<string, Partial<FieldSetting>>;
  widths?: Record<string, number>;
  metricStyle?: Record<string, Record<string, unknown>>;
  context?: Partial<Config["context"]>;
  pulse?: Partial<Omit<Config["pulse"], "themeVars" | "fallbackColors">> & {
    themeVars?: Partial<Config["pulse"]["themeVars"]>;
    fallbackColors?: Partial<Config["pulse"]["fallbackColors"]>;
  };
  plugins?: string[];
}
