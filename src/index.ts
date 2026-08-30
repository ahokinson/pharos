#!/usr/bin/env bun
import { parseAdapterName } from "@adapters/registry";
import { generateBootstrapBundle } from "@bootstrap/init";
import { loadConfig } from "@config";
import { runList } from "@metrics";
import { dispatch } from "@tmux/dispatch";
import { initTmux } from "@tmux/init";
import { pulse } from "@tmux/pulse";
import { renderPane } from "@tmux/pane";
import { renderToTmux } from "@tmux/render";
import pkg from "../package.json" with { type: "json" };

function usage(): never {
  console.error(
    "Usage: pharos init --harness <claude|codex|opencode|hermes|all> --output <directory> [--force] | pharos [--tool=<id>] tmux init | pharos tmux render | pharos tmux pane <template> <source-pane> | pharos tmux dispatch <state> | pharos tmux pulse <session> <token> | pharos list [--json] | pharos --version",
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
// config/merge.ts), then the AdapterName.Claude default. An unrecognized
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
    // Removed when pharos aligned on tmux as its one rendering surface;
    // kept as a loud pointer so a stale statusLine/hook config fails with
    // instructions instead of silence.
    console.error(
      "pharos: 'pharos render' is gone — pharos now renders in tmux's status bar for every host. " +
        "Run 'pharos tmux init' to wire the status bar, point your host's hooks at 'pharos tmux render', " +
        "and remove any statusLine entry pointing here (see README).",
    );
    process.exit(1);
  case "list":
    await runList(rest, await loadConfigWithToolOverride());
    break;
  case "init":
    await generateBootstrapBundle(rest);
    break;
  case "tmux": {
    const [sub, ...tmuxArgs] = rest;
    if (sub === "dispatch") await dispatch(tmuxArgs, await loadConfigWithToolOverride());
    else if (sub === "pulse") await pulse(tmuxArgs, await loadConfigWithToolOverride());
    else if (sub === "pane") await renderPane(tmuxArgs, await loadConfigWithToolOverride());
    else if (sub === "render") await renderToTmux(tmuxArgs, await loadConfigWithToolOverride());
    else if (sub === "init") await initTmux(tmuxArgs);
    else usage();
    break;
  }
  default:
    usage();
}
