import { AdapterName } from "@adapters/types";
import { resolvePalette } from "@color";
import { FIELD_NAMES } from "@config/types";
import type { Config, FieldName, FieldSetting } from "@config/types";
import { DEFAULT_SAMPLE_CAP } from "@session/mining";

// "permission" is a valid built-in (opt into it via fieldOrder) but is left
// out of the default order: Claude Code already surfaces the live
// permission mode itself, so pharos repeating it by default is redundant.
const DEFAULT_FIELD_ORDER: FieldName[] = FIELD_NAMES.filter((f) => f !== "permission");

const DEFAULT_FIELD_SETTINGS: Record<FieldName, FieldSetting> = {
  diff: { row: 1, priority: 10 },
  tokens: { row: 1, priority: 25 },
  cost: { row: 1, priority: 30 },
  tools: { row: 1, priority: 40 },
  context: { row: 1, priority: 50 },
  toolErrors: { row: 1, priority: 100 },
  permission: { row: 2, priority: 100 },
  rate: { row: 2, priority: 45 },
  model: { row: 2, priority: 100 },
};

const DEFAULT_WIDTHS: Record<FieldName, number> = {
  diff: 7,
  tools: 15,
  toolErrors: 0,
  cost: 6,
  tokens: 13,
  context: 0,
  permission: 0,
  model: 0,
  rate: 0,
};

export function defaultConfig(): Config {
  return {
    tool: AdapterName.Claude,
    palette: resolvePalette(),
    fieldOrder: [...DEFAULT_FIELD_ORDER],
    fieldSettings: structuredClone(DEFAULT_FIELD_SETTINGS),
    widths: { ...DEFAULT_WIDTHS },
    // Starts empty: StyleKit.settings(id, defaults) merges each metric's own
    // defaults over whatever (possibly partial) override lives here, at
    // read time, so config itself doesn't need to know any metric's shape.
    metricStyle: {},
    templates: {},
    context: { sampleCap: DEFAULT_SAMPLE_CAP },
    pulse: {
      tail: 200,
      stepMs: 33,
      sweep: 28,
      gapFraction: 0.33,
      statusLeft: 1,
      leadSpace: 1,
      margin: 2,
      remeasureEvery: 30,
      themeVars: { think: "@thm_blue", tool: "@thm_lavender", ask: "@thm_yellow", background: "@thm_mantle" },
      fallbackColors: { think: "#8caaee", tool: "#babbf1", ask: "#e5c890", background: "#292c3c" },
    },
    plugins: [],
  };
}
