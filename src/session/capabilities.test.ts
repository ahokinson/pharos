import { describe, expect, test } from "bun:test";

import { approvalCapability, interactionCapability, sandboxCapability, thinkingCapability } from "@session/capabilities";

describe("thinkingCapability", () => {
  test("normalizes reasoning levels across harness spellings", () => {
    expect(thinkingCapability({ effort: "xhigh", thinking: true, fast: false })).toBe("󰑑 X-High");
    expect(thinkingCapability({ effort: "extra_high", thinking: false, fast: false })).toBe("󰑑 X-High");
    expect(thinkingCapability({ effort: "maximum", thinking: false, fast: false })).toBe("󰑑 Max");
  });

  test("uses compact capability icons without losing fast mode", () => {
    expect(thinkingCapability({ effort: "medium", thinking: true, fast: true })).toBe("󰑑 Medium · ⚡ Fast");
    expect(thinkingCapability({ effort: "", thinking: true, fast: false })).toBe("󰑑");
  });
});

describe("execution capabilities", () => {
  test("normalizes approval and sandbox vocabulary", () => {
    expect(approvalCapability("on-request")).toBe("󰌾 Confirm");
    expect(approvalCapability("bypassPermissions")).toBe("󰌾 Unrestricted");
    expect(sandboxCapability("restricted")).toBe(" Scoped");
    expect(sandboxCapability("workspace-write")).toBe(" Scoped");
  });

  test("keeps live interaction separate from the execution posture", () => {
    expect(interactionCapability("ask")).toBe(" Input");
    expect(interactionCapability("tool")).toBe("󰈸 Tool");
  });
});
