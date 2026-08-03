import { parseEscape, rgbEscape } from "@color/ansi";
import { hexToRgb, hex2, hslToRgb, rgbToHsl } from "@color/convert";

interface HueDelta {
  h1: number;
  s1: number;
  l1: number;
  s2: number;
  l2: number;
  dh: number;
}

// Shared by gradient() and lerpColor(): the hue delta is swept the shorter
// way round the wheel, not linearly from h1 to h2.
function hueDelta(start: string, end: string): HueDelta {
  const s = parseEscape(start);
  const e = parseEscape(end);
  const hsl1 = rgbToHsl(s.r, s.g, s.b);
  const hsl2 = rgbToHsl(e.r, e.g, e.b);
  let dh = hsl2.h - hsl1.h;
  if (dh > 0.5) dh -= 1;
  if (dh < -0.5) dh += 1;
  return { h1: hsl1.h, s1: hsl1.s, l1: hsl1.l, s2: hsl2.s, l2: hsl2.l, dh };
}

/** Per-character truecolor gradient between two palette colours, in HSL so
 * the hue sweeps and midtones stay saturated (RGB interpolation greys them
 * out). `offset`/`span` let a gradient span more text than is passed in
 * (e.g. coloring two numbers as one continuous sweep). */
export function gradient(text: string, start: string, end: string, offset = 0, span?: number): string {
  const n = text.length;
  const effectiveSpan = span ?? n;
  const { h1, s1, l1, s2, l2, dh } = hueDelta(start, end);
  let out = "";
  for (let i = 0; i < n; i++) {
    const t = effectiveSpan > 1 ? (offset + i) / (effectiveSpan - 1) : 0;
    let h = h1 + dh * t;
    if (h < 0) h += 1;
    if (h >= 1) h -= 1;
    const { r, g, b } = hslToRgb(h, s1 + (s2 - s1) * t, l1 + (l2 - l1) * t);
    out += `${rgbEscape(r, g, b)}${text[i]}`;
  }
  return out;
}

/** A single colour interpolated at fraction `t` (0..1) from start to end,
 * same hue-wheel maths as gradient() but one point, not a sweep. */
export function lerpColor(t: number, start: string, end: string): string {
  const tc = Math.min(1, Math.max(0, t));
  const { h1, s1, l1, s2, l2, dh } = hueDelta(start, end);
  let h = h1 + dh * tc;
  if (h < 0) h += 1;
  if (h >= 1) h -= 1;
  const { r, g, b } = hslToRgb(h, s1 + (s2 - s1) * tc, l1 + (l2 - l1) * tc);
  return rgbEscape(r, g, b);
}

/** Linear (not HSL) hex interpolation from `from` to `to` in `length` steps.
 * Used for the tmux pulse's fading comet tail, where a fast ramp matters
 * more than the perceptual evenness gradient() gives. */
export function buildTail(from: string, to: string, length: number): string[] {
  const fromRgb = hexToRgb(from);
  const toRgb = hexToRgb(to);
  const out: string[] = [];
  for (let i = 0; i < length; i++) {
    const r = fromRgb.r + ((toRgb.r - fromRgb.r) * i) / (length - 1);
    const g = fromRgb.g + ((toRgb.g - fromRgb.g) * i) / (length - 1);
    const b = fromRgb.b + ((toRgb.b - fromRgb.b) * i) / (length - 1);
    out.push(`#${hex2(r)}${hex2(g)}${hex2(b)}`);
  }
  return out;
}
