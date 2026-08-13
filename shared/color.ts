import {
  convertLabToLch,
  convertRgbToLab65,
  convertRgbToOklab,
  differenceCiede2000,
  parseHex
} from "culori/fn";
import type { PaletteColor } from "./types";

const ciede2000 = differenceCiede2000();

export function normalizeHexColor(value: string): string | null {
  const trimmed = value.trim();
  const expanded = /^#?[0-9a-f]{3}$/i.test(trimmed)
    ? trimmed.replace(/^#?(.)(.)(.)$/i, "#$1$1$2$2$3$3")
    : trimmed.startsWith("#") ? trimmed : `#${trimmed}`;
  return /^#[0-9a-f]{6}$/i.test(expanded) ? expanded.toUpperCase() : null;
}

export function createCorrectedPaletteColor(color: PaletteColor, value: string): PaletteColor {
  const hex = normalizeHexColor(value);
  if (!hex) throw new Error("请输入有效的 3 位或 6 位 HEX 颜色。");
  const originalHex = color.correction?.originalHex ?? color.hex;
  const metrics = metricsFromHex(hex);
  const restored = hex === originalHex.toUpperCase();

  return {
    ...color,
    ...metrics,
    correction: restored ? undefined : {
      originalHex,
      correctedAt: new Date().toISOString(),
      deltaE2000: calculateDeltaE2000(originalHex, hex)
    }
  };
}

export function withPaletteComparisons(palette: PaletteColor[]): PaletteColor[] {
  const primary = palette[0]?.hex;
  if (!primary) return palette;
  return palette.map((color) => ({
    ...color,
    deltaEFromPrimary: round(calculateDeltaE2000(primary, color.hex), 2)
  }));
}

export function calculateDeltaE2000(left: string, right: string): number {
  const leftRgb = parseRequiredHex(left);
  const rightRgb = parseRequiredHex(right);
  return round(ciede2000(convertRgbToLab65(leftRgb), convertRgbToLab65(rightRgb)), 3);
}

export function rgbToCmyk(rgb: { r: number; g: number; b: number }): { c: number; m: number; y: number; k: number } {
  const red = clampChannel(rgb.r) / 255;
  const green = clampChannel(rgb.g) / 255;
  const blue = clampChannel(rgb.b) / 255;
  const black = 1 - Math.max(red, green, blue);
  if (black >= 1) return { c: 0, m: 0, y: 0, k: 100 };
  return {
    c: Math.round(((1 - red - black) / (1 - black)) * 100),
    m: Math.round(((1 - green - black) / (1 - black)) * 100),
    y: Math.round(((1 - blue - black) / (1 - black)) * 100),
    k: Math.round(black * 100)
  };
}

function metricsFromHex(hex: string): Pick<PaletteColor, "hex" | "rgb" | "cmyk" | "oklch" | "isDark" | "textColor"> {
  const parsed = parseRequiredHex(hex);
  const rgb = {
    r: Math.round(parsed.r * 255),
    g: Math.round(parsed.g * 255),
    b: Math.round(parsed.b * 255)
  };
  const oklch = convertLabToLch(convertRgbToOklab(parsed), "oklch");
  const luminance = relativeLuminance(rgb);
  return {
    hex,
    rgb,
    cmyk: rgbToCmyk(rgb),
    oklch: { l: oklch.l, c: oklch.c, h: oklch.h ?? 0 },
    isDark: luminance < 0.18,
    textColor: luminance < 0.42 ? "#ffffff" : "#000000"
  };
}

function parseRequiredHex(value: string) {
  const normalized = normalizeHexColor(value);
  const parsed = normalized ? parseHex(normalized) : undefined;
  if (!parsed || parsed.r === undefined || parsed.g === undefined || parsed.b === undefined) {
    throw new Error(`无效 HEX 颜色：${value}`);
  }
  return parsed as { mode: "rgb"; r: number; g: number; b: number; alpha?: number };
}

function relativeLuminance(rgb: { r: number; g: number; b: number }): number {
  const linear = [rgb.r, rgb.g, rgb.b].map((channel) => {
    const value = channel / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * (linear[0] ?? 0) + 0.7152 * (linear[1] ?? 0) + 0.0722 * (linear[2] ?? 0);
}

function clampChannel(value: number): number {
  return Math.min(255, Math.max(0, Math.round(value)));
}

function round(value: number, digits: number): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}
