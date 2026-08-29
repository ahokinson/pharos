# pharos

[![CI](https://github.com/ahokinson/pharos/actions/workflows/ci.yml/badge.svg)](https://github.com/ahokinson/pharos/actions/workflows/ci.yml)

Renders an AI coding agent's live session state in tmux's status bar: a
pulsing light sweep while the agent is active, and statusline fields —
cost, tokens, context burn-down, tool calls — refreshed by the host's own
hook events. Works with Claude Code, Codex, and
[opencode](https://opencode.ai).

## Philosophy

Named for the lighthouse of Alexandria: a fixed beacon that makes what's
happening somewhere else visible from a distance, without you having to
go look. The tmux pulse is a literal sweeping beam signaling the agent is
active. The statusline is everything else worth a glance without
switching windows: cost, tokens, context burn-down, and whatever else a
plugin adds (see `examples/guards.ts` for a full worked example). Paired
with [psyche](https://github.com/ahokinson/psyche), which injects the
agent's inner voice, `pharos` is what a human standing outside the agent
can actually see of it.

## Installation

```sh
curl -fsSL https://raw.githubusercontent.com/ahokinson/pharos/develop/scripts/install.sh | sh
```

Installs the latest release binary to `~/.local/bin/pharos` (set
`PHAROS_INSTALL_DIR` to install elsewhere, or `PHAROS_VERSION` to pin a
specific tag). Prebuilt binaries cover macOS and Linux, arm64 and x64; see
[Releases](https://github.com/ahokinson/pharos/releases). To build from
source instead, see [CONTRIBUTING.md](CONTRIBUTING.md).

Check `pharos --version` after installing, then run `pharos tmux init`
from inside a tmux session to wire the status bar. It keeps your normal
tab line, adds up to two lighthouse lanes, and shows field rows only when
the selected pane has emitted AI hooks. Wiring the host's hooks to
`pharos tmux render`/`pharos tmux dispatch` is still manual (see
[Design](#design) below); an automated `pharos init` covering both sides
is on the roadmap.

## Design

One binary, four entry points, sharing color/palette code that today is
duplicated across two zsh scripts against the same Catppuccin Frappe
theme:

- `pharos tmux init` — wires the display side in one shot. tmux >= 3.4
  gets `status 4`: beam lane one stays on the normal tab line, lane two
  is on `status-format[1]`, and conditional field rows are on lines 3–4.
  Ordinary shell panes stay quiet; older tmux keeps one beam and selected-
  pane joined fields in `status-right`.
- `pharos tmux dispatch <state>` — wired as several Claude Code hooks
  (PreToolUse/PostToolUse/UserPromptSubmit/Stop/Notification/
  SessionStart/SessionEnd); flips tmux state to start or stop the pulse,
  captured on the hook-emitting pane as `#{@pharos_pulse}`.
- `pharos tmux pulse <session> <token>` — spawned detached via
  `tmux run-shell -b` by `dispatch`; a ~30fps session loop that animates
  up to two active-agent lanes (and summarizes overflow), independent of
  the agents' process trees.
- `pharos tmux render` — reads the host's JSON on stdin (the same payload
  `dispatch` gets) and writes rendered field rows to the hook-emitting
  pane's `#{@pharos_row1}` and `#{@pharos_row2}`, marking that pane as an
  AI pane. The rows remain available after it becomes idle, until tmux
  closes the pane. `#{@pharos_status}` is the joined pre-3.4 fallback. Each
  row has its own status line and budgets the client width in full, so the lowest-priority field (see
  `fieldSettings`) is what surrenders space first — there's no clutter to
  trim by hand.
- `pharos list` — prints every metric pharos knows about, built-in and
  plugin-loaded, with whether it's currently on. See "Discovering metrics"
  below.

`tmux init` is reverted by hand with: `tmux set -g status 1 && tmux set -gu
status-format[1] && tmux set -gu status-format[2] && tmux set -gu
status-format[3]`.

## Rendering for opencode

pharos can render for [opencode](https://opencode.ai) instead of Claude
Code: pass `--tool=opencode`, or set `"tool": "opencode"` in config. The
opencode adapter reads opencode's own history DB
(`${XDG_DATA_HOME:-~/.local/share}/opencode/opencode-stable.db`; override
with `PHAROS_OPENCODE_DB`) rather than a JSONL transcript, and rebuilds its
numbers from aggregate reads on every render — SQLite rows mutate (tool
parts go running→error, token counts finalize as they stream), so a
read-once checkpoint would silently miss status changes. The DB schema is
internal to opencode and migration-owned; if a future migration breaks
mining, pharos fails open to an unenriched render rather than erroring.

opencode doesn't spawn hook processes itself; it exposes in-process plugin
events instead. Copy [`examples/opencode-bridge.ts`](examples/opencode-bridge.ts)
to `~/.config/opencode/plugins/` (or a project's `.opencode/plugins/`),
restart opencode, and the bridge maps opencode's plugin events onto `pharos
tmux dispatch`/`tmux render` — the pulsing light while the agent works, and
the field rows on tmux's two pharos lines. A `task`-spawned subagent
session folds into the same totals as the main conversation, and opencode's
plan mode lights up the (opt-in) `permission` field the same way Claude
Code's does.

## Known gaps

Hosts render differently, and the differences are honest: a Claude Code
hook payload carries `session_id`/`transcript_path` but not the
statusline-era fields (cost, rate limit, context window), so those read
empty under hook-only rendering — transcript mining still feeds tools,
tokens, tool errors, and permission. Codex has the same story plus a
smaller verified surface (see `src/adapters/codex/session.ts`). opencode
gets the full set, since its DB enriches by session id alone. And the bar
only refreshes while the agent is alive in the first place — its hooks fire
around the session's own events, so when it exits, the bar falls still.

## Configuration

Optional, at `${XDG_CONFIG_HOME:-$HOME/.config}/pharos/config.json`. A
missing or invalid file falls back to the built-in defaults, so nothing
here is required. Every section is independently overridable; unset keys
keep their default.

```json
{
  "palette": { "green": "#a6d189" },
  "fieldOrder": ["diff", "tools", "toolErrors", "cost", "tokens", "context", "model", "rate"],
  "fieldSettings": { "diff": { "row": 1, "priority": 10 } },
  "widths": { "diff": 7, "tools": 15, "cost": 6, "tokens": 13 },
  "metricStyle": {
    "cost": {
      "steps": [{ "at": 15, "color": "red" }, { "at": 5, "color": "peach" }, { "at": 1, "color": "yellow" }],
      "base": "green"
    },
    "rate": { "warnAt": 80, "from": "green", "to": "red" },
    "context": { "sparklineWindow": 8, "trendSlopeThreshold": 1000 },
    "tools": {
      "categoryOrder": ["agents", "reads", "searches", "web", "edits", "runs", "other"],
      "glyphs": { "edits": "*" }
    }
  },
  "context": { "sampleCap": 40 },
  "pulse": {
    "tail": 200, "stepMs": 33, "sweep": 28, "gapFraction": 0.33,
    "statusLeft": 1, "leadSpace": 1, "margin": 2, "remeasureEvery": 30,
    "themeVars": { "think": "@thm_blue", "tool": "@thm_lavender", "ask": "@thm_yellow", "background": "@thm_mantle" },
    "fallbackColors": { "think": "#8caaee", "tool": "#babbf1", "ask": "#e5c890", "background": "#292c3c" }
  },
  "plugins": ["~/.config/pharos/plugins/example.ts"]
}
```

- `palette`: hex overrides for any named color; unnamed colors keep the
  Catppuccin Frappe default.
- `fieldOrder`: which metrics render, and in what left-to-right order.
  Omitting an id disables it entirely. Defaults to every built-in except
  `permission` (see below), plus nothing from plugins until you list it.
- `fieldSettings`: per-metric `row` (1 or 2) and `priority` (dropped first
  when a row is too narrow to fit; `priority >= 100` is never dropped).
- `widths`: a fixed visible-width to pad each metric to, so a shorter or
  absent value still holds its column; `0` (the default for `context`,
  `permission`, `model`, `rate`) means no padding.
- `metricStyle`: metric id → that metric's own style config (ramp
  thresholds, gradient endpoints, glyphs, whatever its `render` function
  reads back via `ctx.style.settings(id, defaults)`). Every built-in
  publishes its own shape here (run `pharos list` to see the ids). Which
  raw tool name falls into which `tools` bucket (e.g. `Edit`/`Write` →
  `edits`) isn't configurable this way, since that mapping is Claude
  Code's own tool vocabulary and not user data; the bucket order and
  glyphs are (`metricStyle.tools.categoryOrder`/`glyphs`).
- `toolErrors`: silent unless a tool call actually failed this session
  (`tool_result.is_error` in the transcript). Counts failures across the
  main transcript and any subagent ones: a `Task`-spawned agent gets its
  own transcript file, and its tool calls and token spend fold into the
  same totals as the main conversation's, since it's still work this
  session did (see `src/session/mining.ts`).
- `permission`: off by default, since Claude Code already surfaces the live
  permission mode itself and pharos repeating it just costs a column. Add
  `"permission"` to `fieldOrder` to turn it on. Once enabled it stays silent
  while the mode is `"default"`; otherwise it shows the mode by name,
  colored per `metricStyle.permission.colors` (`bypassPermissions` red by
  default, since that's the mode where whatever external safety tooling
  you've wired up via a plugin is the only protection left; see "Example:
  cerberus" below).
- `pulse.statusLeft`/`leadSpace`/`margin`: geometry offsets subtracted from
  the tmux client width when measuring how much room the pulse sweep has
  (see `measureWidth` in `src/tmux/pulse.ts`). `remeasureEvery`: how many
  animation frames between re-measuring that width (tabs can resize
  between renders).
- `plugins`: absolute paths (env-expanded, `~`/`$VAR` work) to plugin
  modules — see below.

## Example: cerberus

A concrete worked example of what a plugin can do: `examples/guards.ts`
(shipped in this repo) rebuilds pharos's old built-in "guards" feature, a
shield glyph plus one severity-colored deny count per guard, as an ordinary
metric plugin with nothing pharos-specific beyond `compute`/`render` and
`ctx.style`/`ctx.process`. Point `plugins` at it directly, or copy it as a
starting point for your own guard tool:

```json
{ "plugins": ["/path/to/pharos/examples/guards.ts"] }
```

Its defaults already wire up [cerberus](https://github.com/ahokinson/cerberus),
a three-headed PreToolUse guard whose heads are `risk` (command-pattern
scanning), `policy` (policy evaluation), and `judgement` (scripted
situational checks like git safety), with nothing further to configure. A
few things about that mapping aren't obvious from the plugin's shape alone:

- The guard ids are cerberus's head names verbatim. Its violations file is
  keyed the same way (`risk=N`, `policy=N`, `judgement=N`), which is what
  lets each count land in the right place. Renaming an id here without
  renaming it there means that count silently reads zero forever.
- The counts carry no glyph of their own. Position within `order` and the
  guard's `color` are what tell them apart, so they read as one group under
  the shield instead of three separate widgets.
- `binary` is `"cerberus"` for all three guards rather than `"tirith"` or
  `"cupcake"`. A single `cerberus guard` hook runs all three heads, so
  `cerberus` on PATH is what every cell actually needs. `requirements`
  covers what each head wraps underneath: `tirith`, and `cupcake`/`opa`,
  are separate binaries cerberus shells out to, while `judgement` runs
  in-process with nothing external to require.
- The default `degradedSentinel` (`$XDG_STATE_HOME/guard/degraded`) already
  matches where `cerberus health` writes it at `SessionStart`. That check
  is a real canary rather than a presence test: it feeds a known-dangerous
  command through each enabled head and confirms it actually comes back
  denied. So a degraded cell here means the guard truly isn't enforcing,
  not merely that a binary is missing.

To wire up a different guard tool, override `metricStyle.guards` in your
own config (`shieldGlyph`, `degradedSentinel`, `order`, `definitions`,
same shape with your own values), or fork `examples/guards.ts` outright.

## Writing a plugin

Everything above configures pharos's own built-in metrics. Plugins are for
new behavior: a metric pharos doesn't compute, styled however you like.
There's no separate concept for anything more elaborate — `examples/guards.ts`
(see above) is a full worked example of building something as involved as
a multi-count health-check shield entirely as an ordinary plugin. Each path
in `plugins` is dynamically imported at startup (`pharos list` and `pharos
tmux render` only, not the tmux pulse); a plugin that fails to import, or
throws at render time, is skipped and never breaks the statusline.

**Trust model**: a plugin path is your own code, loaded and run with
pharos's own privileges. That's the same trust boundary as a shell rc
file or tmux config, not a sandboxed extension format. Only point
`plugins` at files you wrote or trust.

A plugin's default export matches this shape. No import needed: pharos
isn't published, so a plugin just duck-types it. Palette colors, ramps,
gradients, humanized numbers, and external-tool health checks all arrive
through `ctx`, so a plugin never has to import pharos internals or
hand-roll PATH scanning to style or check its output:

```typescript
// ~/.config/pharos/plugins/example.ts
export default {
  metrics: [
    {
      id: "greeting",       // add this id to fieldOrder to show it
      label: "Greeting",    // shown by `pharos list`; defaults to id
      row: 1,               // defaults used only if fieldSettings/widths
      priority: 15,         // don't already configure this id
      styleDefaults: { color: "teal" }, // this metric's own style knobs
      compute: (ctx) => ctx.session.model,
      render: (model, ctx) => {
        const { color } = ctx.style.settings("greeting", { color: "teal" });
        return `${ctx.style.color(color)}hi, ${model}`;
      },
    },
  ],
};
```

`compute(ctx)` receives the same context every built-in metric does:
`ctx.session`, `ctx.mined` (tool histogram, token counts, context
samples), `ctx.onPlan`, `ctx.nowEpoch`, `ctx.config`, `ctx.style`, and
`ctx.process`. It returns whatever raw value `render(value, ctx)` needs to
produce the field's text (plain or ANSI-colored), or `null` to hide it for
this render.

`ctx.style` is the coloring/formatting toolkit every built-in uses:
`ramp`/`lerp`/`gradient` (palette-key-based coloring), `sparkline`/`trend`
(context-style burn-down helpers), `countdown`/`humanize`, and
`settings(id, defaults)`, which reads this metric's own slice of
`metricStyle`, shallow-merged over `defaults`.

`ctx.process` covers external-tool liveness: the exact checks pharos's
own guards feature used to have, now available to any plugin.
`commandExists(bin)` checks whether it's on PATH; `checkHealth(binary,
requirements?, sentinel?)` returns absent/degraded/healthy from binary
presence plus optional path/binary requirements plus an optional shared
kill-switch sentinel file. See `examples/guards.ts` for both in real use.

A plugin id matching a built-in one (e.g. `"cost"`) shadows it entirely,
letting a plugin replace built-in behavior, not just add to it.

## Discovering metrics

`pharos list` prints every metric pharos knows about, built-in and loaded
from `plugins`, with its row/priority, whether it's currently in
`fieldOrder`, and where it came from. `pharos list --json` gives the same
data as JSON, for scripting your own config.

## Status

Fully implemented, tested (`bun test`), and running as the live daily
`tmux render`/hook commands. CI runs typecheck and tests on every PR; tagged
releases publish prebuilt binaries (see [Installation](#installation)).
See [CONTRIBUTING.md](CONTRIBUTING.md) for build and test tooling.
