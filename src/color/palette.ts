import { rgbEscape } from "@color/ansi";
import { hexToRgb } from "@color/convert";

// Catppuccin Frappe, mirroring config/common/zsh/.p10k.zsh. Hex here (not
// escape strings) so a config file can override individual entries with
// ordinary hex colors; resolvePalette() turns the merged result into
// ready-to-emit truecolor escapes.
export const DEFAULT_HEX = {
  rosewater: "#f2d5cf",
  flamingo: "#eebebe",
  pink: "#f4b8e4",
  mauve: "#ca9ee6",
  red: "#e78284",
  maroon: "#ea999c",
  peach: "#ef9f76",
  yellow: "#e5c890",
  green: "#a6d189",
  teal: "#81c8be",
  sky: "#99d1e9",
  sapphire: "#85c1dc",
  blue: "#8caaee",
  lavender: "#babbf1",
  text: "#c6d0f5",
  subtext1: "#b5bfe2",
  subtext0: "#a5adce",
  overlay2: "#949cbb",
  overlay1: "#838ba7",
  overlay0: "#737994",
  surface2: "#626880",
  surface1: "#51576d",
  surface0: "#414559",
  base: "#303446",
  mantle: "#292c3c",
  crust: "#232634",
} as const;

export type PaletteKey = keyof typeof DEFAULT_HEX;
export type Palette = Readonly<Record<PaletteKey, string>>;

/** Merge hex overrides onto the default palette and convert every entry to
 * a ready-to-emit truecolor escape string. */
export function resolvePalette(overrides: Partial<Record<PaletteKey, string>> = {}): Palette {
  return Object.fromEntries(
    (Object.keys(DEFAULT_HEX) as PaletteKey[]).map((key) => {
      const { r, g, b } = hexToRgb(overrides[key] ?? DEFAULT_HEX[key]);
      return [key, rgbEscape(r, g, b)];
    }),
  ) as Palette;
}

export const DEFAULT_PALETTE = resolvePalette();
