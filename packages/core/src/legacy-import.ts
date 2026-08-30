import { z } from "zod";
import type { AnalysisRecord, PromptRecord } from "./database";

const legacyBackupSchema = z.object({
  format: z.literal("visual-lens-backup"),
  schemaVersion: z.number().int().positive(),
  settings: z.record(z.string(), z.unknown()).optional(),
  analyses: z.array(z.record(z.string(), z.unknown())).default([]),
  promptVersions: z.array(z.record(z.string(), z.unknown())).default([])
}).passthrough();

export interface LegacyImportResult {
  settings: Record<string, unknown>;
  analyses: AnalysisRecord[];
  prompts: PromptRecord[];
  discardedSecrets: boolean;
}

export function parseLegacyBackup(value: unknown, now = new Date().toISOString()): LegacyImportResult {
  const parsed = legacyBackupSchema.parse(value);
  const settings = { ...(parsed.settings ?? {}) };
  const discardedSecrets = "apiKey" in settings;
  delete settings.apiKey;
  delete settings.rememberApiKey;
  const analyses = parsed.analyses.map((item, index) => ({
    id: typeof item.id === "string" ? item.id : `legacy-analysis-${index}`,
    assetId: typeof item.assetId === "string" ? item.assetId : typeof item.sha256 === "string" ? item.sha256 : `legacy-capture-${index}`,
    captureId: typeof item.sha256 === "string" ? item.sha256 : undefined,
    mode: "deep" as const,
    state: "partial" as const,
    providerId: "legacy",
    model: typeof item.model === "string" ? item.model : "unknown",
    rawResponse: item.result ?? item,
    error: "旧分析已保留；使用 Lensflow v2 重新分析后可获得结构化闭环字段。",
    createdAt: typeof item.generatedAt === "string" ? item.generatedAt : now,
    updatedAt: typeof item.updatedAt === "string" ? item.updatedAt : typeof item.generatedAt === "string" ? item.generatedAt : now
  }));
  const prompts = parsed.promptVersions.map((item, index) => ({
    id: typeof item.id === "string" ? item.id : `legacy-prompt-${index}`,
    text: typeof item.positivePrompt === "string" ? item.positivePrompt : "",
    negativeText: typeof item.negativePrompt === "string" ? item.negativePrompt : "",
    language: "zh" as const,
    kind: "version" as const,
    createdAt: typeof item.createdAt === "string" ? item.createdAt : now,
    updatedAt: typeof item.createdAt === "string" ? item.createdAt : now
  }));
  return { settings, analyses, prompts, discardedSecrets };
}
