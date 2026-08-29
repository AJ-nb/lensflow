import { z } from "zod";
import {
  LENSFLOW_BACKUP_FORMAT,
  LENSFLOW_BACKUP_SCHEMA_VERSION,
  assetRecordSchema,
  generationBatchSchema,
  historyEventSchema,
  studioReferenceSchema,
  type BackupExport,
  type BackupImportMode,
  type BackupImportSummary,
  type HistoryRetentionDays,
  type MaintenanceSummary
} from "@lensflow/contracts";
import {
  LensflowDatabase,
  type AnalysisRecord,
  type CaptureRecord,
  type CollectionRecord,
  type HistoryEventRecord,
  type PromptRecord,
  type SettingsMetaRecord
} from "./database";
import { parseLegacyBackup } from "./legacy-import";

const isoDate = z.string().datetime();
const captureSchema = z.object({
  id: z.string().min(1),
  sourceUrl: z.string().optional(),
  pageUrl: z.string().optional(),
  dataUrl: z.string().optional(),
  width: z.number().int().positive().optional(),
  height: z.number().int().positive().optional(),
  sha256: z.string().optional(),
  createdAt: isoDate
});
const analysisSchema = z.object({
  id: z.string().min(1),
  captureId: z.string().min(1),
  model: z.string(),
  result: z.unknown(),
  rawResponse: z.unknown().optional(),
  createdAt: isoDate
});
const promptSchema = z.object({
  id: z.string().min(1),
  text: z.string(),
  axis: z.enum(["style", "subject", "composition", "color", "motion"]).optional(),
  kind: z.enum(["keyword", "prompt", "version"]),
  createdAt: isoDate,
  updatedAt: isoDate
});
const collectionSchema = z.object({
  id: z.string().min(1),
  name: z.string(),
  assetIds: z.array(z.string()),
  createdAt: isoDate,
  updatedAt: isoDate
});
const settingsMetaSchema = z.object({ key: z.string().min(1), value: z.unknown(), updatedAt: isoDate });

const backupSchema = z.object({
  format: z.literal(LENSFLOW_BACKUP_FORMAT),
  schemaVersion: z.literal(LENSFLOW_BACKUP_SCHEMA_VERSION),
  appVersion: z.string().min(1),
  exportedAt: isoDate,
  tables: z.object({
    captures: z.array(captureSchema),
    analyses: z.array(analysisSchema),
    prompts: z.array(promptSchema),
    references: z.array(studioReferenceSchema),
    generationJobs: z.array(generationBatchSchema),
    assets: z.array(assetRecordSchema),
    collections: z.array(collectionSchema),
    historyEvents: z.array(historyEventSchema),
    settingsMeta: z.array(settingsMetaSchema)
  })
});

type LensflowBackup = z.infer<typeof backupSchema>;
const SENSITIVE_SETTING = /(?:api.?key|secret|authorization|access.?token|providersecrets|sessionprovidersecrets)/i;
const SENSITIVE_FIELD = /^(?:api.?key|secret|authorization|access.?token|token)$/i;

function safeSettingsRows(rows: SettingsMetaRecord[]): SettingsMetaRecord[] {
  return rows
    .filter((row) => !SENSITIVE_SETTING.test(row.key))
    .map((row) => ({ ...row, value: redactSensitive(row.value) }));
}

export function redactSensitive(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redactSensitive);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value).flatMap(([key, child]) =>
    SENSITIVE_FIELD.test(key) ? [] : [[key, redactSensitive(child)]]
  ));
}

export async function createLensflowBackup(
  db: LensflowDatabase,
  appVersion: string,
  exportedAt = new Date().toISOString()
): Promise<BackupExport> {
  const [captures, analyses, prompts, references, generationJobs, assets, collections, historyEvents, settingsMeta] = await Promise.all([
    db.captures.toArray(),
    db.analyses.toArray(),
    db.prompts.toArray(),
    db.references.toArray(),
    db.generationJobs.toArray(),
    db.assets.toArray(),
    db.collections.toArray(),
    db.historyEvents.toArray(),
    db.settingsMeta.toArray()
  ]);
  const backup: LensflowBackup = {
    format: LENSFLOW_BACKUP_FORMAT,
    schemaVersion: LENSFLOW_BACKUP_SCHEMA_VERSION,
    appVersion,
    exportedAt,
    tables: {
      captures,
      analyses,
      prompts,
      references,
      generationJobs,
      assets,
      collections,
      historyEvents,
      settingsMeta: safeSettingsRows(settingsMeta)
    }
  };
  return {
    fileName: `lensflow-backup-${exportedAt.slice(0, 10)}.json`,
    mimeType: "application/json",
    text: JSON.stringify(backup, null, 2),
    exportedAt
  };
}

export async function importLensflowBackup(
  db: LensflowDatabase,
  raw: unknown,
  mode: BackupImportMode
): Promise<BackupImportSummary> {
  if (raw && typeof raw === "object" && (raw as { format?: unknown }).format === "visual-lens-backup") {
    const legacy = parseLegacyBackup(raw);
    await db.transaction("rw", [db.analyses, db.prompts, db.settingsMeta], async () => {
      if (mode === "replace") await Promise.all([db.analyses.clear(), db.prompts.clear()]);
      await Promise.all([
        db.analyses.bulkPut(legacy.analyses),
        db.prompts.bulkPut(legacy.prompts)
      ]);
      for (const [key, value] of Object.entries(legacy.settings)) {
        if (!SENSITIVE_SETTING.test(key)) {
          await db.settingsMeta.put({ key: `legacy:${key}`, value: redactSensitive(value), updatedAt: new Date().toISOString() });
        }
      }
    });
    return {
      sourceFormat: "visual-lens",
      imported: { analyses: legacy.analyses.length, prompts: legacy.prompts.length },
      discardedSecrets: legacy.discardedSecrets
    };
  }

  const parsed = backupSchema.safeParse(raw);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    throw new Error(`备份校验失败：${issue?.path.join(".") || "根对象"} ${issue?.message || "结构无效"}`);
  }
  const tables = parsed.data.tables;
  const settingsMeta = safeSettingsRows(tables.settingsMeta as SettingsMetaRecord[]);
  await db.transaction("rw", db.tables, async () => {
    if (mode === "replace") await Promise.all(db.tables.map((table) => table.clear()));
    await Promise.all([
      db.captures.bulkPut(tables.captures as CaptureRecord[]),
      db.analyses.bulkPut(tables.analyses as AnalysisRecord[]),
      db.prompts.bulkPut(tables.prompts as PromptRecord[]),
      db.references.bulkPut(tables.references),
      db.generationJobs.bulkPut(tables.generationJobs),
      db.assets.bulkPut(tables.assets),
      db.collections.bulkPut(tables.collections as CollectionRecord[]),
      db.historyEvents.bulkPut(tables.historyEvents as HistoryEventRecord[]),
      db.settingsMeta.bulkPut(settingsMeta)
    ]);
  });
  return {
    sourceFormat: "lensflow",
    imported: Object.fromEntries(Object.entries(tables).map(([key, rows]) => [key, rows.length])),
    discardedSecrets: settingsMeta.length !== tables.settingsMeta.length
  };
}

export async function findDuplicateAssets(db: LensflowDatabase): Promise<MaintenanceSummary["duplicateGroups"]> {
  const assets = await db.assets.toArray();
  const groups = new Map<string, typeof assets>();
  for (const asset of assets) {
    const fingerprint = typeof asset.metadata.sha256 === "string" ? asset.metadata.sha256 : undefined;
    if (!fingerprint) continue;
    const group = groups.get(fingerprint) ?? [];
    group.push(asset);
    groups.set(fingerprint, group);
  }
  return [...groups.entries()].filter(([, rows]) => rows.length > 1).map(([fingerprint, rows]) => ({
    fingerprint,
    assetIds: rows.map((row) => row.id),
    names: rows.map((row) => row.name)
  }));
}

export async function loadMaintenanceSummary(db: LensflowDatabase): Promise<MaintenanceSummary> {
  const [policy, duplicateGroups, historyEventCount, completedBatchCount] = await Promise.all([
    db.settingsMeta.get("historyRetentionDays"),
    findDuplicateAssets(db),
    db.historyEvents.count(),
    db.generationJobs.where("state").anyOf("ready", "partial", "failed").count()
  ]);
  const rawDays = policy?.value;
  const historyRetentionDays: HistoryRetentionDays = [30, 90, 180, 365].includes(Number(rawDays))
    ? Number(rawDays) as Exclude<HistoryRetentionDays, null>
    : null;
  return { historyRetentionDays, duplicateGroups, historyEventCount, completedBatchCount };
}

export async function setHistoryRetention(db: LensflowDatabase, days: HistoryRetentionDays): Promise<MaintenanceSummary> {
  await db.settingsMeta.put({ key: "historyRetentionDays", value: days, updatedAt: new Date().toISOString() });
  return loadMaintenanceSummary(db);
}

export async function pruneHistory(db: LensflowDatabase): Promise<MaintenanceSummary> {
  const summary = await loadMaintenanceSummary(db);
  if (summary.historyRetentionDays === null) return summary;
  const cutoff = new Date(Date.now() - summary.historyRetentionDays * 86_400_000).toISOString();
  await db.transaction("rw", [db.historyEvents, db.generationJobs], async () => {
    await db.historyEvents.where("createdAt").below(cutoff).delete();
    const old = await db.generationJobs.where("updatedAt").below(cutoff).toArray();
    await db.generationJobs.bulkDelete(old.filter((batch) => ["ready", "partial", "failed"].includes(batch.state)).map((batch) => batch.id));
  });
  return loadMaintenanceSummary(db);
}

export async function createDiagnosticExport(
  db: LensflowDatabase,
  appVersion: string,
  exportedAt = new Date().toISOString()
): Promise<BackupExport> {
  const [counts, provider, capabilities, recentEvents, maintenance, estimate] = await Promise.all([
    Promise.all(db.tables.map(async (table) => [table.name, await table.count()] as const)),
    db.settingsMeta.get("activeProvider"),
    db.settingsMeta.get("providerCapabilities"),
    db.historyEvents.orderBy("createdAt").reverse().limit(50).toArray(),
    loadMaintenanceSummary(db),
    typeof navigator !== "undefined" && navigator.storage?.estimate
      ? navigator.storage.estimate()
      : Promise.resolve({ usage: 0, quota: 0 } satisfies StorageEstimate)
  ]);
  const payload = {
    format: "lensflow-sanitized-diagnostics",
    schemaVersion: 1,
    appVersion,
    exportedAt,
    database: { name: db.name, version: db.verno, counts: Object.fromEntries(counts) },
    provider: redactSensitive(provider?.value),
    capabilities: capabilities?.value ?? null,
    storage: { usage: estimate.usage ?? 0, quota: estimate.quota ?? 0 },
    maintenance: { ...maintenance, duplicateGroups: maintenance.duplicateGroups.map((group) => ({ fingerprint: group.fingerprint, count: group.assetIds.length })) },
    recentEvents: recentEvents.map((event) => ({ type: event.type, entityId: event.entityId, createdAt: event.createdAt }))
  };
  return {
    fileName: `lensflow-diagnostics-${exportedAt.slice(0, 10)}.json`,
    mimeType: "application/json",
    text: JSON.stringify(payload, null, 2),
    exportedAt
  };
}
