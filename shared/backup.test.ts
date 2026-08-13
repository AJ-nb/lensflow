import { describe, expect, it } from "vitest";
import {
  applyBackupSettings,
  createVisualLensBackup,
  parseVisualLensBackup
} from "./backup";
import { CURRENT_SETTINGS_VERSION, DEFAULT_SETTINGS, type AnalysisArchiveRecord, type PromptVersionRecord } from "./types";

const exportedAt = "2026-08-13T08:00:00.000Z";

function archiveRecord(): AnalysisArchiveRecord {
  return {
    id: "analysis-1",
    generatedAt: exportedAt,
    updatedAt: exportedAt,
    title: "测试档案",
    sha256: "a".repeat(64),
    model: "test-model",
    sourceLabel: "测试图片",
    favorite: true,
    tags: ["CMF"],
    result: {
      schemaVersion: "1.2",
      generatedAt: exportedAt,
      model: "test-model",
      source: { id: "source-1", kind: "upload" },
      measured: { sha256: "a".repeat(64) },
      reconstructionDirective: "保持结构",
      analysis: { title: "测试分析" },
      previewDataUrl: "data:image/png;base64,AA=="
    }
  } as unknown as AnalysisArchiveRecord;
}

function promptVersion(): PromptVersionRecord {
  return {
    id: "prompt-1",
    sha256: "a".repeat(64),
    createdAt: exportedAt,
    label: "第一版",
    positivePrompt: "正向",
    negativePrompt: "负向",
    reconstructionDirective: "保持结构"
  };
}

describe("砚台兼容备份格式", () => {
  it("excludes API key by default and round-trips valid data", () => {
    const backup = createVisualLensBackup({
      extensionVersion: "0.5.2",
      settings: { ...DEFAULT_SETTINGS, apiKey: "secret-key" },
      analyses: [archiveRecord()],
      promptVersions: [promptVersion()],
      exportedAt
    });

    expect(backup.settings).not.toHaveProperty("apiKey");
    expect(parseVisualLensBackup(JSON.parse(JSON.stringify(backup)))).toEqual(backup);
  });

  it("includes API key only after explicit opt-in", () => {
    const backup = createVisualLensBackup({
      extensionVersion: "0.5.2",
      settings: { ...DEFAULT_SETTINGS, apiKey: "secret-key" },
      analyses: [],
      promptVersions: [],
      includeApiKey: true,
      exportedAt
    });

    expect(backup.settings?.apiKey).toBe("secret-key");
  });

  it("rejects malformed, foreign and unsupported backups", () => {
    expect(() => parseVisualLensBackup({})).toThrow("不是砚台备份");
    expect(() => parseVisualLensBackup({ format: "visual-lens-backup", schemaVersion: 99 })).toThrow("不支持的备份版本");
    expect(() => parseVisualLensBackup({
      format: "visual-lens-backup",
      schemaVersion: 1,
      extensionVersion: "0.5.2",
      exportedAt,
      analyses: [{}],
      promptVersions: []
    })).toThrow("备份校验失败");
  });

  it("normalizes imported settings and preserves the current API key when absent", () => {
    const restored = applyBackupSettings(
      { ...DEFAULT_SETTINGS, apiKey: "current-key", rememberApiKey: false },
      { ...DEFAULT_SETTINGS, settingsVersion: 0, apiKey: undefined, rememberApiKey: true, autoAnalyze: true }
    );

    expect(restored.settingsVersion).toBe(CURRENT_SETTINGS_VERSION);
    expect(restored.apiKey).toBe("current-key");
    expect(restored.rememberApiKey).toBe(false);
    expect(restored.autoAnalyze).toBe(false);
  });
});
