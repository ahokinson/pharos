import { claudeCodeAdapter } from "@adapters/claude-code";
import { codexAdapter } from "@adapters/codex";
import { AdapterName } from "@adapters/types";
import type { HostAdapter } from "@adapters/types";
import type { Config } from "@config/types";

const ADAPTERS: Partial<Record<AdapterName, HostAdapter>> = {
  [AdapterName.ClaudeCode]: claudeCodeAdapter,
  [AdapterName.Codex]: codexAdapter,
};

/** Resolves config.tool to its adapter, falling back to Claude Code for an
 * unregistered id (fails open, same philosophy as the rest of config/*). */
export function resolveAdapter(config: Config): HostAdapter {
  return ADAPTERS[config.tool] ?? claudeCodeAdapter;
}

const KNOWN_ADAPTER_NAMES: ReadonlySet<string> = new Set(Object.values(AdapterName));

/** Validates a raw string (CLI flag, env var, config file) against the
 * known AdapterName values; undefined if it isn't one. */
export function parseAdapterName(value: string | undefined): AdapterName | undefined {
  return value !== undefined && KNOWN_ADAPTER_NAMES.has(value) ? (value as AdapterName) : undefined;
}
