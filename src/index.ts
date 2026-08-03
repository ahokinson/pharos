#!/usr/bin/env bun
import { loadConfig } from "@config";
import { runList } from "@metrics";
import { render } from "@render";
import { dispatch } from "@tmux/dispatch";
import { pulse } from "@tmux/pulse";

function usage(): never {
  console.error(
    "Usage: pharos render | pharos list [--json] | pharos tmux dispatch <state> | pharos tmux pulse <session> <token>",
  );
  process.exit(2);
}

const [command, ...rest] = process.argv.slice(2);

switch (command) {
  case "render":
    await render(rest, await loadConfig());
    break;
  case "list":
    await runList(rest, await loadConfig());
    break;
  case "tmux": {
    const [sub, ...tmuxArgs] = rest;
    if (sub === "dispatch") await dispatch(tmuxArgs);
    else if (sub === "pulse") await pulse(tmuxArgs, await loadConfig());
    else usage();
    break;
  }
  default:
    usage();
}
