import { parseAdapterName } from "@adapters/registry";
import { resolvePalette } from "@color";
import { defaultConfig } from "@config/defaults";
import { expandEnv } from "@config/env";
import { TemplateFormat, TemplateRenderer } from "@config/types";
import type { Config, FieldSetting, RawConfig } from "@config/types";

// Fallback for an id the user configured that isn't one of the built-in
// metrics, used only until a plugin declaring that id loads (async, after
// config merge) and backfills its own preferred row/priority.
const FALLBACK_FIELD_SETTING: FieldSetting = { row: 1, priority: 50 };

export function mergeConfig(raw: RawConfig): Config {
  const base = defaultConfig();
  const fieldIds = Object.keys({ ...base.fieldSettings, ...raw.fieldSettings });
  const styleIds = Object.keys({ ...base.metricStyle, ...raw.metricStyle });
  const templates: Config["templates"] = {};
  for (const [name, template] of Object.entries(raw.templates ?? base.templates)) {
    if (!Array.isArray(template.lines)) continue;
    templates[name] = {
      format: template.format === TemplateFormat.Tmux ? TemplateFormat.Tmux : TemplateFormat.Ansi,
      renderer: template.renderer === TemplateRenderer.OpenTui ? TemplateRenderer.OpenTui : TemplateRenderer.Ansi,
      lines: [...template.lines],
    };
  }

  const fieldSettings: Record<string, FieldSetting> = {};
  for (const name of fieldIds) {
    fieldSettings[name] = { ...(base.fieldSettings[name] ?? FALLBACK_FIELD_SETTING), ...raw.fieldSettings?.[name] };
  }

  return {
    tool: parseAdapterName(raw.tool) ?? base.tool,
    palette: raw.palette ? resolvePalette(raw.palette) : base.palette,
    fieldOrder: raw.fieldOrder ?? base.fieldOrder,
    fieldSettings,
    widths: { ...base.widths, ...raw.widths },
    metricStyle: Object.fromEntries(
      styleIds.map((id) => [id, { ...base.metricStyle[id], ...raw.metricStyle?.[id] }]),
    ),
    templates,
    context: { ...base.context, ...raw.context },
    pulse: {
      ...base.pulse,
      ...raw.pulse,
      themeVars: { ...base.pulse.themeVars, ...raw.pulse?.themeVars },
      fallbackColors: { ...base.pulse.fallbackColors, ...raw.pulse?.fallbackColors },
    },
    plugins: (raw.plugins ?? base.plugins).map(expandEnv),
  };
}
