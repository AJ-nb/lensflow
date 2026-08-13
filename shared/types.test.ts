import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS, normalizeSettings } from "./types";

describe("settings normalization", () => {
  it("migrates older settings to overview-first", () => {
    expect(normalizeSettings({ analysisMode: "deep" }).analysisFlow).toBe("overview-first");
  });

  it("preserves direct full analysis and rejects unknown flows", () => {
    expect(normalizeSettings({ analysisFlow: "full-direct" }).analysisFlow).toBe("full-direct");
    expect(normalizeSettings({ analysisFlow: "unknown" as never }).analysisFlow).toBe(DEFAULT_SETTINGS.analysisFlow);
  });

  it("defaults automatic analysis off and migrates the previous opt-in state once", () => {
    expect(DEFAULT_SETTINGS.autoAnalyze).toBe(false);
    expect(normalizeSettings({ autoAnalyze: true }).autoAnalyze).toBe(false);
    expect(normalizeSettings({ ...DEFAULT_SETTINGS, autoAnalyze: true }).autoAnalyze).toBe(true);
  });

  it("removes the former built-in API endpoint while preserving custom endpoints", () => {
    expect(normalizeSettings({ settingsVersion: 2, apiBaseUrl: "https://api.biyuan.ai/v1" }).apiBaseUrl).toBe("");
    expect(normalizeSettings({ settingsVersion: 2, apiBaseUrl: "https://api.example.com/v1" }).apiBaseUrl)
      .toBe("https://api.example.com/v1");
  });

  it("defaults new API keys to session storage and preserves legacy saved keys", () => {
    expect(DEFAULT_SETTINGS.rememberApiKey).toBe(false);
    expect(normalizeSettings({ settingsVersion: 2, apiKey: "legacy-key" }).rememberApiKey).toBe(true);
  });
});
