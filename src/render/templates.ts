import Mustache from "mustache";

import { ansiToTmuxStyle, stripAnsi } from "@color";
import { TemplateFormat } from "@config/types";
import type { Template } from "@config/types";

/** Tmux option names may only contain a conservative identifier subset. */
export function templateOptionName(name: string): string {
  return `@pharos_template_${name.replaceAll(/[^A-Za-z0-9_]/g, "_")}`;
}

export interface TemplateContext {
  tool: string;
  state: string;
  [field: string]: string | string[];
}

/**
 * Renders a named view without making the layout engine responsible for a
 * second, fixed arrangement of fields. Formatted field strings are supplied
 * as values, so `{{{tokens}}}` preserves their color while `{{#tokens}}`
 * suppresses a line when a metric is unavailable.
 */
export function renderTemplate(template: Template, context: TemplateContext): string {
  const targetContext = Object.fromEntries(
    Object.entries(context).map(([key, value]) => {
      const values = Array.isArray(value) ? value : [value];
      const formatted = values.map((item) => (template.format === TemplateFormat.Tmux ? ansiToTmuxStyle(item) : item));
      const present = formatted.filter((item) => stripAnsi(item).trim().length > 0);
      return [key, Array.isArray(value) ? present : (present[0] ?? "")];
    }),
  ) as unknown as TemplateContext;

  return template.lines
    .map((line) => Mustache.render(line, targetContext))
    // A literal empty config line is intentional visual breathing room;
    // a Mustache section that rendered empty is not. This lets narrow
    // dashboard cards use spacing without retaining blank optional rows.
    .filter((line, index) => template.lines[index] === "" || stripAnsi(line).trim().length > 0)
    .join("\n")
    .replace(/\n+$/, "");
}
