// Tool histogram: every tool call folds into one of these buckets, always
// rendered in a fixed order (see metricStyle.tools.categoryOrder) so each
// icon keeps its place run to run.

export enum ToolCategory {
  Edits = "edits",
  Reads = "reads",
  Runs = "runs",
  Searches = "searches",
  Agents = "agents",
  Web = "web",
  Other = "other",
}

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

export function bucketToolCounts(toolCounts: Record<string, number>): Partial<Record<ToolCategory, number>> {
  const bucket: Partial<Record<ToolCategory, number>> = {};
  for (const [name, count] of Object.entries(toolCounts)) {
    const key = bucketFor(name);
    bucket[key] = (bucket[key] ?? 0) + count;
  }
  return bucket;
}
