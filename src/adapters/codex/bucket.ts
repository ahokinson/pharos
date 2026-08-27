// Verified against real transcripts (see mining.ts): across every session
// sampled, Codex funnels nearly all work through "exec" (its one shell
// tool) plus occasional "wait", not Claude Code's many discrete named
// tools. So unlike Claude Code, this histogram will show almost everything
// as Runs regardless of whether the model was actually editing, reading, or
// searching — that distinction just isn't visible at this layer for Codex.
// "apply_patch" is Codex's other commonly-documented built-in tool for file
// edits, included even though no sample here happened to use it.
import { ToolCategory } from "@tools/bucket";

const TOOL_CATEGORY: Record<string, ToolCategory> = {
  exec: ToolCategory.Runs,
  apply_patch: ToolCategory.Edits,
  wait: ToolCategory.Other,
};

export function bucketFor(toolName: string): ToolCategory {
  return TOOL_CATEGORY[toolName] ?? ToolCategory.Other;
}
