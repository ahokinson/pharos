import { homedir } from "node:os";
import { join } from "node:path";

export function xdgStateHome(): string {
  return process.env.XDG_STATE_HOME || join(homedir(), ".local", "state");
}

/** Expands $VAR / ${VAR} references and a leading ~ against the current
 * environment, so config values can be written portably. */
export function expandEnv(value: string): string {
  return value
    .replace(/^~(?=\/|$)/, homedir())
    .replace(/\$\{(\w+)\}|\$(\w+)/g, (_, braced, bare) => process.env[braced ?? bare] ?? "");
}

export function configPath(): string {
  return join(process.env.XDG_CONFIG_HOME || join(homedir(), ".config"), "pharos", "config.json");
}
