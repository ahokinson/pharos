import { describe, expect, test } from "bun:test";

import { renderTemplate, templateOptionName } from "@render/templates";
import { TemplateFormat } from "@config/types";

describe("renderTemplate", () => {
  test("renders Mustache sections and removes blank lines", () => {
    expect(
      renderTemplate(
        { format: TemplateFormat.Ansi, lines: ["⚓ {{tool}} · {{state}}", "{{#tokens}}Tokens {{{tokens}}}{{/tokens}}", "{{#cost}}Cost {{{cost}}}{{/cost}}"] },
        { tool: "codex", state: "tool", tokens: "12k", cost: "" },
      ),
    ).toBe("⚓ codex · tool\nTokens 12k");
  });

  test("converts formatted values for tmux targets", () => {
    expect(renderTemplate({ format: TemplateFormat.Tmux, lines: ["{{{tokens}}}"] }, { tool: "codex", state: "think", tokens: "\x1b[38;2;1;2;3m12k\x1b[0m" })).toContain("#[fg=#010203]");
  });

  test("treats an ANSI reset-only metric as unavailable", () => {
    expect(renderTemplate({ format: TemplateFormat.Ansi, lines: ["{{#tokens}}󰞙 {{{tokens}}}{{/tokens}}"] }, { tool: "codex", state: "think", tokens: "\x1b[0m" })).toBe("");
  });

  test("iterates compact template rows", () => {
    expect(
      renderTemplate(
        { format: TemplateFormat.Ansi, lines: ["{{#rateLines}}│  {{{.}}}\n{{/rateLines}}"] },
        { tool: "codex", state: "think", rateLines: ["42% of 5h", "6% of 7d"] },
      ),
    ).toBe("│  42% of 5h\n│  6% of 7d");
  });

  test("sanitizes a template name for a tmux option", () => {
    expect(templateOptionName("side-card/v1")).toBe("@pharos_template_side_card_v1");
  });
});
