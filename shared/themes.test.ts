import { describe, expect, it } from "vitest";
import { dailyThemeId, randomThemeId, resolveTheme, THEME_IDS } from "./themes";

describe("visual themes", () => {
  it("keeps the daily theme stable for the same local date", () => {
    const morning = new Date(2026, 7, 13, 8, 0);
    const evening = new Date(2026, 7, 13, 22, 30);
    expect(dailyThemeId(morning)).toBe(dailyThemeId(evening));
  });

  it("resolves manual themes without changing them", () => {
    expect(resolveTheme("manual", "indigo-coral").id).toBe("indigo-coral");
  });

  it("randomizes to a different known theme", () => {
    const next = randomThemeId("cinnabar-celadon", () => 0);
    expect(next).not.toBe("cinnabar-celadon");
    expect(THEME_IDS).toContain(next);
  });
});
