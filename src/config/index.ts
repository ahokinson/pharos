import { z } from "zod";

import { configPath } from "@config/env";
import { mergeConfig } from "@config/merge";
import type { Config, RawConfig } from "@config/types";

export type { Config, RawConfig, FieldName, FieldSetting } from "@config/types";
export { expandEnv, xdgStateHome, configPath } from "@config/env";
export { mergeConfig } from "@config/merge";

// Only checks the parsed file is a JSON object; deep field validation is
// mergeConfig's documented fail-open territory. This just stops a non-object
// config (a bare array, string, number) from reaching the spreads below.
const rawConfigSchema = z.looseObject({});

/** Loads and merges the user's config file. Fails open to defaults on any
 * error (missing file, invalid JSON), since a broken config should never
 * break the statusline or the tmux pulse. */
export async function loadConfig(): Promise<Config> {
  let raw: RawConfig = {};
  try {
    raw = rawConfigSchema.parse(JSON.parse(await Bun.file(configPath()).text()));
  } catch {
    // fail open: defaults, per the jsdoc above
  }
  return mergeConfig(raw);
}
