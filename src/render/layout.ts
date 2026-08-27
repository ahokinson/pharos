import { RESET, visibleWidth } from "@color";
import type { RowNumber } from "@config/types";

// Each row is composed and width-fit independently: a narrow terminal drops
// the lowest-priority droppable field on that row until it fits, rather than
// dropping across the whole bar. Fields with priority >=100 are never
// dropped.

export interface Field {
  line: RowNumber;
  text: string;
  priority: number;
}

const PINNED_PRIORITY = 100;

/** Column fallback when neither COLUMNS nor the terminal reports a width. */
export const FALLBACK_COLUMNS = 80;

function composeRow(fields: Field[], active: boolean[], row: RowNumber): string {
  const texts = fields.filter((f, i) => active[i] && f.line === row).map((f) => f.text);
  return (texts.length ? ` ${texts.join("  ")}` : "") + RESET;
}

export function fitRow(fields: Field[], row: RowNumber, cols: number): string {
  const active = fields.map(() => true);
  let rendered = composeRow(fields, active, row);
  while (visibleWidth(rendered) > cols) {
    let lowest = -1;
    let lowestPriority = Infinity;
    fields.forEach((f, i) => {
      if (!active[i] || f.priority >= PINNED_PRIORITY || f.line !== row) return;
      if (f.priority < lowestPriority) {
        lowest = i;
        lowestPriority = f.priority;
      }
    });
    if (lowest === -1) break;
    active[lowest] = false;
    rendered = composeRow(fields, active, row);
  }
  return rendered;
}
