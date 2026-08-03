import type { Config } from "@config";
import { loadPlugins } from "@plugin";
import { buildRegistry } from "@metrics/registry";

interface MetricRow {
  id: string;
  label: string;
  row: 1 | 2;
  priority: number;
  enabled: boolean;
  source: string;
}

async function collect(config: Config): Promise<{ metrics: MetricRow[] }> {
  const resolved = await loadPlugins(config);
  const registry = buildRegistry(config, resolved);

  const metrics: MetricRow[] = Object.values(registry).map((metric) => {
    const setting = config.fieldSettings[metric.id];
    const source = resolved.sources[metric.id];
    return {
      id: metric.id,
      label: metric.label ?? metric.id,
      row: setting?.row ?? 1,
      priority: setting?.priority ?? 50,
      enabled: config.fieldOrder.includes(metric.id),
      source: source ? `plugin:${source}` : "built-in",
    };
  });

  return { metrics };
}

function printTable(headers: string[], rows: string[][]): void {
  const widths = headers.map((h, i) => Math.max(h.length, ...rows.map((r) => (r[i] ?? "").length)));
  const printRow = (cells: string[]) => console.log(cells.map((c, i) => c.padEnd(widths[i] ?? 0)).join("  "));
  printRow(headers);
  printRow(widths.map((w) => "-".repeat(w)));
  for (const row of rows) printRow(row);
}

/** `pharos list`: everything a user could put in fieldOrder, built-in or
 * loaded from a plugin, with whether it's currently on. Plain text (or
 * --json for scripting): this is a config-authoring aid, not the statusline
 * itself, so it doesn't need ANSI. */
export async function runList(args: string[], config: Config): Promise<void> {
  const { metrics } = await collect(config);

  if (args.includes("--json")) {
    console.log(JSON.stringify({ metrics }, null, 2));
    return;
  }

  printTable(
    ["ID", "LABEL", "ROW", "PRIORITY", "ENABLED", "SOURCE"],
    metrics.map((m) => [m.id, m.label, String(m.row), String(m.priority), String(m.enabled), m.source]),
  );
}
