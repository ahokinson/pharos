// opencode's own tool-name vocabulary (verified against a real DB: bash,
// read, write, edit, grep, glob, webfetch, websearch, task, todowrite,
// question, skill), plus list/lsp from opencode's documented permission
// keys, mapped into the generic ToolCategory buckets metrics/builtins.ts
// renders. Not configurable via metricStyle: this mapping is opencode's own
// tool vocabulary, not user data — see src/tools/bucket.ts.
import { ToolCategory } from "@tools/bucket";

const TOOL_CATEGORY: Record<string, ToolCategory> = {
  edit: ToolCategory.Edits,
  write: ToolCategory.Edits,
  patch: ToolCategory.Edits,
  read: ToolCategory.Reads,
  bash: ToolCategory.Runs,
  grep: ToolCategory.Searches,
  glob: ToolCategory.Searches,
  list: ToolCategory.Searches,
  task: ToolCategory.Agents,
  webfetch: ToolCategory.Web,
  websearch: ToolCategory.Web,
};

export function bucketFor(toolName: string): ToolCategory {
  return TOOL_CATEGORY[toolName] ?? ToolCategory.Other;
}
