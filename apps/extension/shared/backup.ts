import { z } from "zod";
import {
  normalizeSettings,
  type AnalysisArchiveRecord,
  type AppSettings,
  type PromptVersionRecord
} from "./types";

export const VISUAL_LENS_BACKUP_FORMAT = "visual-lens-backup" as const;
export const CURRENT_BACKUP_SCHEMA_VERSION = 1;

export type BackupSettings = Omit<AppSettings, "apiKey" | "rememberApiKey">;

export interface VisualLensBackup {
  format: typeof VISUAL_LENS_BACKUP_FORMAT;
  schemaVersion: typeof CURRENT_BACKUP_SCHEMA_VERSION;
  extensionVersion: string;
  exportedAt: string;
  settings?: BackupSettings;
  analyses: AnalysisArchiveRecord[];
  promptVersions: PromptVersionRecord[];
}

const isoDate = z.string().min(1).refine((value) => !Number.isNaN(Date.parse(value)), "日期格式无效");

const backupSettingsSchema = z.object({
  settingsVersion: z.number().int().nonnegative(),
  apiKey: z.string().optional(),
  rememberApiKey: z.boolean().optional(),
  apiBaseUrl: z.string(),
  analysisModel: z.string(),
  imageModel: z.string(),
  analysisFlow: z.enum(["overview-first", "full-direct"]),
  analysisMode: z.enum(["fast", "balanced", "deep"]),
  imageQuality: z.enum(["low", "medium", "high"]),
  autoAnalyze: z.boolean(),
  outputLanguage: z.enum(["zh-CN", "en"]),
  themeMode: z.enum(["daily", "manual"]).optional(),
  themeId: z.enum(["cinnabar-celadon", "mineral-gold", "indigo-coral", "ink-neon", "lacquer-pop", "woodblock-clash"]).optional()
});

const analysisArchiveSchema = z.object({
  id: z.string().min(1),
  generatedAt: isoDate,
  updatedAt: isoDate,
  title: z.string(),
  sha256: z.string().min(1),
  model: z.string(),
  sourceLabel: z.string(),
  favorite: z.boolean(),
  tags: z.array(z.string()),
  result: z.object({
    schemaVersion: z.enum(["1.1", "1.2"]),
    generatedAt: isoDate,
    model: z.string(),
    source: z.object({ id: z.string().min(1), kind: z.enum(["web", "upload", "url"]) }).passthrough(),
    measured: z.object({ sha256: z.string().min(1) }).passthrough(),
    reconstructionDirective: z.string(),
    analysis: z.object({}).passthrough(),
    previewDataUrl: z.string().min(1)
  }).passthrough(),
  perceptualHash: z.string().optional(),
  eagleSync: z.object({
    itemId: z.string(),
    folderId: z.string().optional(),
    tags: z.array(z.string()),
    syncedAt: isoDate,
    verified: z.literal(true)
  }).optional()
});

const promptVersionSchema = z.object({
  id: z.string().min(1),
  sha256: z.string().min(1),
  createdAt: isoDate,
  label: z.string(),
  positivePrompt: z.string(),
  negativePrompt: z.string(),
  reconstructionDirective: z.string()
});

const visualLensBackupSchema = z.object({
  format: z.literal(VISUAL_LENS_BACKUP_FORMAT),
  schemaVersion: z.literal(CURRENT_BACKUP_SCHEMA_VERSION),
  extensionVersion: z.string().min(1),
  exportedAt: isoDate,
  settings: backupSettingsSchema.optional(),
  analyses: z.array(analysisArchiveSchema),
  promptVersions: z.array(promptVersionSchema)
});

export function createVisualLensBackup(input: {
  extensionVersion: string;
  settings: AppSettings;
  analyses: AnalysisArchiveRecord[];
  promptVersions: PromptVersionRecord[];
  exportedAt?: string;
}): VisualLensBackup {
  const normalized = normalizeSettings(input.settings);
  const { apiKey: _apiKey, rememberApiKey: _rememberApiKey, ...settingsWithoutKey } = normalized;
  return {
    format: VISUAL_LENS_BACKUP_FORMAT,
    schemaVersion: CURRENT_BACKUP_SCHEMA_VERSION,
    extensionVersion: input.extensionVersion,
    exportedAt: input.exportedAt ?? new Date().toISOString(),
    settings: settingsWithoutKey,
    analyses: input.analyses,
    promptVersions: input.promptVersions
  };
}

export function parseVisualLensBackup(value: unknown): VisualLensBackup {
  if (!value || typeof value !== "object") throw new Error("备份文件不是有效的 JSON 对象。");
  const header = value as { format?: unknown; schemaVersion?: unknown };
  if (header.format !== VISUAL_LENS_BACKUP_FORMAT) throw new Error("这不是 Lensflow 兼容备份文件。");
  if (header.schemaVersion !== CURRENT_BACKUP_SCHEMA_VERSION) {
    throw new Error(`不支持的备份版本：${String(header.schemaVersion ?? "未知")}。`);
  }
  const parsed = visualLensBackupSchema.safeParse(value);
  if (!parsed.success) {
    const detail = parsed.error.issues[0] ?? { path: [], message: "文件结构不完整" };
    const path = detail.path.length ? detail.path.join(".") : "文件内容";
    throw new Error(`备份校验失败：${path} ${detail.message}`);
  }
  const { apiKey: _apiKey, rememberApiKey: _rememberApiKey, ...safeSettings } = parsed.data.settings ?? {};
  return {
    ...parsed.data,
    settings: parsed.data.settings ? safeSettings as BackupSettings : undefined
  } as unknown as VisualLensBackup;
}

export function applyBackupSettings(current: AppSettings, backup?: BackupSettings): AppSettings {
  if (!backup) return normalizeSettings(current);
  return normalizeSettings({
    ...current,
    ...backup,
    apiKey: current.apiKey,
    rememberApiKey: current.rememberApiKey
  });
}
