// Claude Code's own tool-name vocabulary, mapped into the generic
// ToolCategory buckets metrics/builtins.ts renders. Not configurable via
// metricStyle: this mapping is Claude Code's own tool vocabulary, not user
// data — see src/tools/bucket.ts for the host-agnostic aggregation logic
// this table feeds.
import { ToolCategory } from "@tools/bucket";

const TOOL_CATEGORY: Record<string, ToolCategory> = {
  Edit: ToolCategory.Edits,
  Write: ToolCategory.Edits,
  MultiEdit: ToolCategory.Edits,
  NotebookEdit: ToolCategory.Edits,
  Read: ToolCategory.Reads,
  Bash: ToolCategory.Runs,
  Grep: ToolCategory.Searches,
  Glob: ToolCategory.Searches,
  Task: ToolCategory.Agents,
  Agent: ToolCategory.Agents,
  WebFetch: ToolCategory.Web,
  WebSearch: ToolCategory.Web,
};

export function bucketFor(toolName: string): ToolCategory {
  return TOOL_CATEGORY[toolName] ?? ToolCategory.Other;
}
