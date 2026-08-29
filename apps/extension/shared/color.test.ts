import { describe, expect, it } from "vitest";
import {
  calculateDeltaE2000,
  createCorrectedPaletteColor,
  normalizeHexColor,
  rgbToCmyk,
  withPaletteComparisons
} from "./color";
import type { PaletteColor } from "./types";

const base: PaletteColor = {
  hex: "#FF0000",
  rgb: { r: 255, g: 0, b: 0 },
  cmyk: { c: 0, m: 100, y: 100, k: 0 },
  oklch: { l: 0.628, c: 0.258, h: 29.2 },
  proportion: 0.6,
  population: 60,
  isDark: false,
  textColor: "#000000"
};

describe("color evidence helpers", () => {
  it("normalizes supported HEX notation", () => {
    expect(normalizeHexColor("0f8")).toBe("#00FF88");
    expect(normalizeHexColor("#123ABC")).toBe("#123ABC");
    expect(normalizeHexColor("red")).toBeNull();
  });

  it("records a reversible manual correction with CIEDE2000", () => {
    const corrected = createCorrectedPaletteColor(base, "#00FF00");
    expect(corrected.hex).toBe("#00FF00");
    expect(corrected.correction?.originalHex).toBe("#FF0000");
    expect(corrected.correction?.deltaE2000).toBeGreaterThan(80);

    const restored = createCorrectedPaletteColor(corrected, "#FF0000");
    expect(restored.correction).toBeUndefined();
  });

  it("adds primary-color differences without changing proportions", () => {
    const palette = withPaletteComparisons([base, createCorrectedPaletteColor(base, "#FE0101")]);
    expect(palette[0]?.deltaEFromPrimary).toBe(0);
    expect(palette[1]?.deltaEFromPrimary).toBeGreaterThan(0);
    expect(palette[1]?.proportion).toBe(0.6);
  });

  it("keeps CMYK output explicitly deterministic", () => {
    expect(rgbToCmyk({ r: 0, g: 0, b: 0 })).toEqual({ c: 0, m: 0, y: 0, k: 100 });
    expect(calculateDeltaE2000("#FFFFFF", "#FFFFFF")).toBe(0);
  });
});
