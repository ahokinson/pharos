// Tool histogram: every tool call folds into one of these buckets, always
// rendered in a fixed order (see metricStyle.tools.categoryOrder) so each
// icon keeps its place run to run. Which raw tool name maps to which bucket
// is a host's own tool vocabulary, not generic data — see
// src/adapters/*/bucket.ts for each host's lookup table.

export enum ToolCategory {
  Edits = "edits",
  Reads = "reads",
  Runs = "runs",
  Searches = "searches",
  Agents = "agents",
  Web = "web",
  Other = "other",
}

export function bucketToolCounts(
  toolCounts: Record<string, number>,
  bucketFor: (toolName: string) => ToolCategory,
): Partial<Record<ToolCategory, number>> {
  const bucket: Partial<Record<ToolCategory, number>> = {};
  for (const [name, count] of Object.entries(toolCounts)) {
    const key = bucketFor(name);
    bucket[key] = (bucket[key] ?? 0) + count;
  }
  return bucket;
}
