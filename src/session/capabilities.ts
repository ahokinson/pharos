import type { Session } from "@session/session";

const THINKING_LEVELS: Record<string, string> = {
  minimal: "Minimal",
  minimum: "Minimal",
  low: "Low",
  medium: "Medium",
  high: "High",
  xhigh: "X-High",
  "x-high": "X-High",
  extra_high: "X-High",
  "extra-high": "X-High",
  max: "Max",
  maximum: "Max",
};

/** A host-independent capability label. Every adapter normalizes its native
 * reasoning controls into Session, so all harnesses share this vocabulary. */
export function thinkingCapability(session: Pick<Session, "effort" | "thinking" | "fast">): string {
  const rawLevel = session.effort.trim().toLowerCase();
  const level = THINKING_LEVELS[rawLevel] ?? session.effort.trim();
  const capabilities: string[] = [];
  if (level || session.thinking) capabilities.push(`󰑑${level ? ` ${level}` : ""}`);
  if (session.fast) capabilities.push("⚡ Fast");
  return capabilities.join(" · ");
}

/** Translates each harness's approval vocabulary into a small shared set. */
export function approvalCapability(policy: string | null | undefined): string {
  const normalized = policy?.trim().toLowerCase().replaceAll("_", "-");
  if (!normalized) return "";
  const labels: Record<string, string> = {
    default: "Confirm",
    build: "Confirm",
    "on-request": "Confirm",
    "accept-edits": "Edits",
    acceptedits: "Edits",
    plan: "Plan",
    "bypass-permissions": "Unrestricted",
    bypasspermissions: "Unrestricted",
    never: "Unrestricted",
  };
  return `󰌾 ${labels[normalized] ?? policy}`;
}

/** Sandbox names are similarly normalized without pretending that an absent
 * sandbox signal means a harness has one. */
export function sandboxCapability(sandbox: string | null | undefined): string {
  const normalized = sandbox?.trim().toLowerCase().replaceAll("_", "-");
  if (!normalized) return "";
  const labels: Record<string, string> = {
    restricted: "Scoped",
    "workspace-write": "Scoped",
    readonly: "Read-only",
    "read-only": "Read-only",
    "danger-full-access": "Full access",
    "full-access": "Full access",
  };
  return ` ${labels[normalized] ?? sandbox}`;
}

/** The live pulse state is a different concern from approval policy. */
export function interactionCapability(state: string): string {
  const labels: Record<string, string> = {
    ask: " Input",
    think: "󰑑 Reasoning",
    tool: "󰈸 Tool",
  };
  return labels[state] ?? "";
}
