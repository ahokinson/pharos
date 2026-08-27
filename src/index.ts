#!/usr/bin/env bun
import { parseAdapterName } from "@adapters/registry";
import { loadConfig } from "@config";
import { runList } from "@metrics";
import { render } from "@render";
import { dispatch } from "@tmux/dispatch";
import { pulse } from "@tmux/pulse";
import pkg from "../package.json" with { type: "json" };

function usage(): never {
  console.error(
    "Usage: pharos [--tool=<id>] render | pharos list [--json] | pharos tmux dispatch <state> | pharos tmux pulse <session> <token> | pharos --version",
  );
  process.exit(2);
}

// --tool=<id> is a global flag: strip it out of argv wherever it appears,
// rather than requiring it in a fixed position ahead of the subcommand.
let toolFlag: string | undefined;
const argv: string[] = [];
for (const arg of process.argv.slice(2)) {
  if (arg.startsWith("--tool=")) toolFlag = arg.slice("--tool=".length);
  else argv.push(arg);
}

const [command, ...rest] = argv;

// Precedence: --tool flag, then PHAROS_TOOL env var, then config.tool (see
// config/merge.ts), then the AdapterName.ClaudeCode default. An unrecognized
// value from either the flag or the env var is ignored (fails open to
// config/the default) rather than erroring, same philosophy as config
// merging itself.
async function loadConfigWithToolOverride() {
  const config = await loadConfig();
  const override = parseAdapterName(toolFlag) ?? parseAdapterName(process.env.PHAROS_TOOL);
  if (override) config.tool = override;
  return config;
}

switch (command) {
  case "--version":
  case "-v":
    console.log(`pharos ${pkg.version}`);
    break;
  case "render":
    await render(rest, await loadConfigWithToolOverride());
    break;
  case "list":
    await runList(rest, await loadConfigWithToolOverride());
    break;
  case "tmux": {
    const [sub, ...tmuxArgs] = rest;
    if (sub === "dispatch") await dispatch(tmuxArgs, await loadConfigWithToolOverride());
    else if (sub === "pulse") await pulse(tmuxArgs, await loadConfigWithToolOverride());
    else usage();
    break;
  }
  default:
    usage();
}
