import type { MiningState } from "@session/mining";
import type { Session } from "@session/session";
import type { ToolCategory } from "@tools/bucket";

// Which host CLI pharos is rendering for. The generic engine (metrics,
// config, render/layout, color, plugin) never sees this — only
// adapters/registry.ts and the CLI's --tool/PHAROS_TOOL/config.tool
// resolution touch it.
export enum AdapterName {
  Claude = "claude",
  Codex = "codex",
  Cursor = "cursor",
  Opencode = "opencode",
  Hermes = "hermes",
}

// Rendering full metric text (not just a think/tool/ask pulse token) into a
// tmux status-bar segment, refreshed by the host's own hooks/events. This is
// pharos's one rendering surface (see tmux/render.ts) and is host-agnostic:
// NativeHooks means the host fires process-spawned hook commands directly,
// BridgeRequired means the host only exposes in-process plugin events and
// needs a small bridge module to shell out.
export enum TmuxStatusSupport {
  NativeHooks = "native-hooks", // host fires process-spawned hook commands directly
  BridgeRequired = "bridge-required", // host only exposes in-process plugin events; needs a small bridge module to shell out
  Unsupported = "unsupported", // hook granularity too coarse to usefully refresh a segment
}

export enum MiningSupport {
  Stable = "stable",
  BestEffort = "best-effort",
  Unsupported = "unsupported",
}

// The one boundary between "which AI coding tool is this" and the rest of
// pharos. Every other module only ever touches the generic Session/
// MiningState/ToolCategory types this interface produces/consumes.
export interface HostAdapter {
  id: AdapterName;
  parseSession(raw: unknown): Session;
  mineTranscript(ref: string, prior: MiningState, sampleCap: number): Promise<MiningState>;
  /** Given this host's parsed notification-shaped stdin payload, decide
   * whether to clear a stuck pulse (see tmux/dispatch.ts's `notify` state). */
  isIdleNotification(stdin: unknown): boolean;
  bucketFor(toolName: string): ToolCategory;
  capabilities: {
    tmuxStatus: TmuxStatusSupport;
    mining: MiningSupport;
  };
}
