// A worked plugin example: rebuilds pharos's old built-in "guards" feature,
// a shield glyph plus one severity-colored deny count per guard, each
// backed by "is this binary on PATH, plus some requirements," entirely as
// an ordinary metric plugin. Nothing here is special-cased by pharos; it's
// built from the same compute/render + ctx.style/ctx.process surface any
// plugin gets (see README's "Writing a plugin"). Point `plugins` at this
// file, or a copy you've customized, to use it, or fork it wholesale as a
// starting point for wiring up your own guard tool.
//
// The concrete ids/binaries below wire up cerberus (see README's "Example:
// cerberus"), but the shape works for any binary-backed health check.
//
// Type imports below are erased at compile time (verbatimModuleSyntax), so
// this file has no runtime dependency on pharos, same as any plugin.
//
// HealthStatus's string values ("absent", "degraded", ...) are part of
// pharos's documented ProcessKit contract, so comparing against locally
// declared copies of those literals keeps the zero-runtime-dependency rule
// without sprinkling `as HealthStatus` casts through the render body.
const ABSENT = "absent" as HealthStatus;
const DEGRADED = "degraded" as HealthStatus;

import { readFileSync } from "node:fs";
import type { PaletteKey } from "@color";
import type { HealthStatus } from "@process";
import type { Metric } from "@metrics";
import type { Plugin } from "@plugin";

interface GuardDef {
  color: PaletteKey;
  binary: string;
  requirements: string[];
}

type GuardsStyle = {
  shieldGlyph: string;
  degradedSentinel: string;
  order: string[];
  definitions: Record<string, GuardDef>;
};

// XDG_STATE_HOME is stable for the life of a single pharos invocation, so
// the default below only needs to read it once, at load time, the same
// pattern every other built-in's static styleDefaults uses.
const defaultStateHome = process.env.XDG_STATE_HOME || `${process.env.HOME}/.local/state`;

const DEFAULTS: GuardsStyle = {
  shieldGlyph: "", // fa-shield
  degradedSentinel: `${defaultStateHome}/guard/degraded`,
  order: ["risk", "policy", "judgement"],
  definitions: {
    risk: { color: "red", binary: "cerberus", requirements: ["tirith"] },
    policy: { color: "peach", binary: "cerberus", requirements: ["cupcake", "opa"] },
    judgement: { color: "yellow", binary: "cerberus", requirements: [] },
  },
};

// Per-session deny counts, written by whatever guard tool `binary` is, as
// sourceable "id=N" lines. The ids above match cerberus's own head names
// (risk/policy/judgement), which is what makes the lookup below line up
// with the file cerberus writes. This is entirely this plugin's own
// concern, not something pharos core reads or knows the shape of. Reads
// XDG_STATE_HOME fresh (not the module-load-time default above), so this
// stays correct even outside a single stable process.
function readViolations(sessionId: string): Record<string, number> {
  const stateHome = process.env.XDG_STATE_HOME || `${process.env.HOME}/.local/state`;
  const path = `${stateHome}/guard/violations-${sessionId}.state`;
  const counts: Record<string, number> = {};
  try {
    const text = readFileSync(path, "utf8");
    for (const line of text.split("\n")) {
      const [, id, count] = /^([\w-]+)=(\d+)$/.exec(line.trim()) ?? [];
      if (id) counts[id] = Number(count);
    }
  } catch {
    // fail open: unreadable/missing counts just render as zeros
  }
  return counts;
}

const guardsMetric: Metric<Record<string, number>> = {
  id: "guards",
  label: "Guard shields",
  row: 2,
  priority: 100,
  styleDefaults: DEFAULTS,
  compute: (ctx) => readViolations(ctx.session.sessionId),
  render: (violations, ctx) => {
    const s = ctx.style.settings("guards", DEFAULTS);
    const states: HealthStatus[] = [];
    let cells = "";
    for (const id of s.order) {
      const def = s.definitions[id];
      if (!def) continue; // unknown id (e.g. a removed entry): fail open, skip
      const state = ctx.process.checkHealth(def.binary, def.requirements, s.degradedSentinel);
      states.push(state);
      const count = violations[id] ?? 0;
      // Position and color are what identify each guard, so the counts read
      // as one group under the shield. An absent guard shows "-" rather
      // than a count it can't vouch for; a live zero stays dim so that a
      // nonzero count is the thing that draws the eye.
      const cellFg =
        state === ABSENT
          ? ctx.style.color("surface2")
          : count > 0
            ? ctx.style.color(def.color)
            : ctx.style.color("overlay2");
      // Padded to 2 digits (or the "-" placeholder, right-aligned the same
      // way) so one guard crossing a digit boundary doesn't nudge the ones
      // after it sideways under the shield.
      const cell = (state === ABSENT ? "-" : String(count)).padStart(2);
      cells += ` ${cellFg}${cell}`;
    }
    // Shield = the guards' worst state: red if any is degraded, else peach
    // if any is missing, else green.
    const shieldFg = states.includes(DEGRADED)
      ? ctx.style.color("red")
      : states.includes(ABSENT)
        ? ctx.style.color("peach")
        : ctx.style.color("green");
    return `${shieldFg}${s.shieldGlyph}${cells}`;
  },
};

export default { metrics: [guardsMetric] } satisfies Plugin;
