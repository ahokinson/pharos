import { runSync } from "@process/spawn";

/** A hook is spawned fresh for every event, so anything this young in the
 * chain belongs to that invocation rather than to the agent behind it. */
const MIN_AGENT_AGE_SECONDS = 2;

/** Process trees are shallow; this only exists so a malformed table can't
 * spin the walk forever. */
const MAX_HOPS = 64;

export interface ProcessEntry {
  ppid: number;
  ageSeconds: number;
  comm: string;
}

/** `[[dd-]hh:]mm:ss`, the one elapsed-time format both GNU and BSD ps print.
 * (`etimes`, which would hand us seconds directly, is Linux-only.) */
function parseEtime(field: string): number {
  const [dayPart, clockPart] = field.includes("-") ? field.split("-") : [null, field];
  const parts = (clockPart ?? "").split(":").map(Number);
  if (parts.length < 2 || parts.length > 3 || parts.some(Number.isNaN)) return 0;
  const [hours, minutes, seconds] = parts.length === 3 ? parts : [0, ...parts];
  return Number(dayPart ?? 0) * 86400 + (hours ?? 0) * 3600 + (minutes ?? 0) * 60 + (seconds ?? 0);
}

/** Parses `ps -eo pid=,ppid=,etime=,comm=` into a pid -> parent/age/name map.
 * `comm` is the executable's own name, never the full argv — that's what
 * keeps this a plain whitespace split, the same one etime already relies on.
 * Exported so resolveAgentPid below is testable without a real process tree,
 * the same split as activePanesFrom in tmux/pulse.ts. */
export function parseProcessTable(output: string): Map<number, ProcessEntry> {
  const table = new Map<number, ProcessEntry>();
  for (const line of output.trim().split("\n")) {
    const [pid, ppid, etime, comm] = line.trim().split(/\s+/);
    if (!pid || !ppid || !etime) continue;
    if (Number.isNaN(Number(pid)) || Number.isNaN(Number(ppid))) continue;
    table.set(Number(pid), { ppid: Number(ppid), ageSeconds: parseEtime(etime), comm: comm ?? "" });
  }
  return table;
}

/**
 * The agent process behind a hook invocation: walking up from `hookPid`, the
 * first ancestor whose parent is the pane's own shell. A normal launch reads
 * zsh(panePid) -> claude -> sh -> pharos and resolves to claude.
 *
 * A launcher that starts the session and then execs or forks the agent
 * itself — a wrapper script, an npx-style shim, a work tool that builds the
 * tmux session for you — puts an extra hop between panePid and the agent, and
 * the positional rule above would hand back the launcher instead: the wrong
 * pid to poll if that launcher exits (or was never meant to outlive its
 * child) while the agent it started keeps running. `agentName`, when given,
 * settles that ahead of the positional rule: any ancestor along the walk
 * whose own `comm` matches it is the agent, however many hops up it sits.
 * Omit it (or leave it unmatched) and this falls back to the positional rule
 * exactly as before.
 *
 * Returns null rather than guessing when the chain doesn't have that shape.
 * The case worth naming is a pane whose command *is* the agent (`exec
 * claude`): there the chain is claude(panePid) -> sh -> pharos, and the
 * positional rule would hand back the transient hook shell — a pid that dies
 * in milliseconds and would resurrect the very bug this signal exists to fix.
 * The age check catches it, since an agent always predates its own hook, and
 * null is the right answer anyway: in that shape the pane and the agent die
 * together, so pane existence is already the better signal.
 */
export function resolveAgentPid(
  table: Map<number, ProcessEntry>,
  hookPid: number,
  panePid: number,
  agentName?: string,
): number | null {
  if (hookPid === panePid) return null;
  let current = hookPid;
  for (let hop = 0; hop < MAX_HOPS; hop += 1) {
    const entry = table.get(current);
    if (!entry) return null;
    if (agentName && entry.comm === agentName && entry.ageSeconds >= MIN_AGENT_AGE_SECONDS) {
      return current;
    }
    if (entry.ppid === panePid) {
      return entry.ageSeconds >= MIN_AGENT_AGE_SECONDS ? current : null;
    }
    current = entry.ppid;
  }
  return null;
}

/** Resolves the agent pid from the live process table. `agentName`, when
 * known (the adapter id — "claude", "codex", ...), lets this see past
 * wrapper layers a launcher inserts above the agent; see resolveAgentPid. */
export function currentAgentPid(hookPid: number, panePid: number, agentName?: string): number | null {
  const result = runSync(["ps", "-eo", "pid=,ppid=,etime=,comm="]);
  if (!result.ok) return null;
  return resolveAgentPid(parseProcessTable(result.stdout), hookPid, panePid, agentName);
}

/** Signal 0 checks for the process without touching it. */
export function processAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}
