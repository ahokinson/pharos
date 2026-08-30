import { ToolCategory } from "@tools/bucket";

const categories: Record<string, ToolCategory> = {
  terminal: ToolCategory.Runs, execute_code: ToolCategory.Runs, read_file: ToolCategory.Reads,
  write_file: ToolCategory.Edits, patch: ToolCategory.Edits, browser: ToolCategory.Web,
  web_search: ToolCategory.Web, delegate: ToolCategory.Agents,
};

export function bucketFor(toolName: string): ToolCategory {
  return categories[toolName] ?? ToolCategory.Other;
}
