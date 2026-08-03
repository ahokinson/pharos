import { configPath } from "@config/env";
import { mergeConfig } from "@config/merge";
import type { Config, RawConfig } from "@config/types";

export type { Config, RawConfig, FieldName, FieldSetting } from "@config/types";
export { expandEnv, xdgStateHome, configPath } from "@config/env";
export { mergeConfig } from "@config/merge";
export type { PaletteKey } from "@color";

/** Loads and merges the user's config file. Fails open to defaults on any
 * error (missing file, invalid JSON), since a broken config should never
 * break the statusline or the tmux pulse. */
export async function loadConfig(): Promise<Config> {
  let raw: RawConfig = {};
  try {
    raw = JSON.parse(await Bun.file(configPath()).text());
  } catch {}
  return mergeConfig(raw);
}
