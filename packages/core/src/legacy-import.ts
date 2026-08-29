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
    captureId: typeof item.sha256 === "string" ? item.sha256 : `legacy-capture-${index}`,
    model: typeof item.model === "string" ? item.model : "unknown",
    result: item.result ?? item,
    createdAt: typeof item.generatedAt === "string" ? item.generatedAt : now
  }));
  const prompts = parsed.promptVersions.map((item, index) => ({
    id: typeof item.id === "string" ? item.id : `legacy-prompt-${index}`,
    text: typeof item.positivePrompt === "string" ? item.positivePrompt : "",
    kind: "version" as const,
    createdAt: typeof item.createdAt === "string" ? item.createdAt : now,
    updatedAt: typeof item.createdAt === "string" ? item.createdAt : now
  }));
  return { settings, analyses, prompts, discardedSecrets };
}
