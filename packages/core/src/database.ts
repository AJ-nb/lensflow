import Dexie, { type EntityTable } from "dexie";
import {
  UNKNOWN_CAPABILITIES,
  type AssetRecord,
  type AnalysisRecord,
  type AnalysisSummary,
  type GenerationBatch,
  type HistoryEvent,
  type KeywordCard,
  type ProviderCapabilities,
  type ProviderProfile,
  type SavedPrompt,
  type StudioReference,
  type StudioSnapshot
} from "@lensflow/contracts";
export type { AnalysisRecord } from "@lensflow/contracts";

export interface CaptureRecord {
  id: string;
  sourceUrl?: string;
  pageUrl?: string;
  dataUrl?: string;
  width?: number;
  height?: number;
  sha256?: string;
  createdAt: string;
}

export interface PromptRecord {
  id: string;
  text: string;
  axis?: KeywordCard["axis"];
  kind: "keyword" | "prompt" | "version";
  negativeText?: string;
  language?: "zh" | "en";
  sourceAssetId?: string;
  sourceAnalysisId?: string;
  variantKind?: "faithful" | "commercial" | "exploratory";
  model?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CollectionRecord {
  id: string;
  name: string;
  assetIds: string[];
  createdAt: string;
  updatedAt: string;
}

export type HistoryEventRecord = HistoryEvent;

export interface SettingsMetaRecord {
  key: string;
  value: unknown;
  updatedAt: string;
}

export class LensflowDatabase extends Dexie {
  captures!: EntityTable<CaptureRecord, "id">;
  analyses!: EntityTable<AnalysisRecord, "id">;
  prompts!: EntityTable<PromptRecord, "id">;
  references!: EntityTable<StudioReference, "id">;
  generationJobs!: EntityTable<GenerationBatch, "id">;
  assets!: EntityTable<AssetRecord, "id">;
  collections!: EntityTable<CollectionRecord, "id">;
  historyEvents!: EntityTable<HistoryEventRecord, "id">;
  settingsMeta!: EntityTable<SettingsMetaRecord, "key">;

  constructor(name = "lensflow-local") {
    super(name);
    this.version(1).stores({
      captures: "id, createdAt, sha256, pageUrl",
      analyses: "id, captureId, createdAt, model",
      prompts: "id, kind, axis, createdAt, updatedAt",
      references: "id, kind, createdAt, enabled",
      generationJobs: "id, state, providerId, createdAt, updatedAt",
      assets: "id, kind, sourceTaskId, createdAt, updatedAt",
      collections: "id, createdAt, updatedAt",
      historyEvents: "id, type, entityId, createdAt",
      settingsMeta: "key, updatedAt"
    });
    this.version(2).stores({
      captures: "id, createdAt, sha256, pageUrl",
      analyses: "id, assetId, captureId, state, mode, providerId, updatedAt",
      prompts: "id, kind, axis, sourceAssetId, sourceAnalysisId, variantKind, createdAt, updatedAt",
      references: "id, kind, createdAt, enabled",
      generationJobs: "id, state, providerId, createdAt, updatedAt",
      assets: "id, kind, sourceTaskId, createdAt, updatedAt",
      collections: "id, createdAt, updatedAt",
      historyEvents: "id, type, entityId, createdAt",
      settingsMeta: "key, updatedAt"
    }).upgrade(async (transaction) => {
      const analyses = transaction.table("analyses");
      await analyses.toCollection().modify((row: Record<string, unknown>) => {
        const createdAt = typeof row.createdAt === "string" ? row.createdAt : new Date().toISOString();
        row.assetId = typeof row.assetId === "string" ? row.assetId : row.captureId;
        row.mode = row.mode === "deep" ? "deep" : "quick";
        row.state = typeof row.state === "string" ? row.state : "ready";
        row.providerId = typeof row.providerId === "string" ? row.providerId : "legacy";
        row.updatedAt = typeof row.updatedAt === "string" ? row.updatedAt : createdAt;
      });
    });
  }
}

export function summarizeAnalysis(row: AnalysisRecord): AnalysisSummary {
  return {
    id: row.id,
    assetId: row.assetId,
    mode: row.mode,
    state: row.state,
    providerId: row.providerId,
    model: row.model,
    error: row.error,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    contentKind: row.result?.classification.kind,
    summary: row.result?.summary.value ?? undefined,
    promptZh: row.result?.prompts.positive.zh,
    promptEn: row.result?.prompts.positive.en
  };
}

export async function readStudioSnapshot(
  db: LensflowDatabase,
  connected = true,
  readOnly = false,
  extensionVersion: string | null = null
): Promise<StudioSnapshot> {
  const [providerMeta, capabilitiesMeta, captureHandoffMeta, promptRows, savedPromptRows, analysisRows, assets, references, batches, historyEvents, estimate] = await Promise.all([
    db.settingsMeta.get("activeProvider"),
    db.settingsMeta.get("providerCapabilities"),
    db.settingsMeta.get("captureHandoff"),
    db.prompts.where("kind").equals("keyword").toArray(),
    db.prompts.where("kind").anyOf("prompt", "version").reverse().sortBy("updatedAt"),
    db.analyses.orderBy("updatedAt").reverse().limit(100).toArray(),
    db.assets.orderBy("updatedAt").reverse().toArray(),
    db.references.orderBy("createdAt").reverse().toArray(),
    db.generationJobs.orderBy("updatedAt").reverse().toArray(),
    db.historyEvents.orderBy("createdAt").reverse().limit(100).toArray(),
    typeof navigator !== "undefined" && navigator.storage?.estimate
      ? navigator.storage.estimate()
      : Promise.resolve({ usage: 0, quota: 0 } satisfies StorageEstimate)
  ]);
  const persisted = typeof navigator !== "undefined" && navigator.storage?.persisted ? await navigator.storage.persisted() : false;
  return {
    connectionState: connected ? "connected" : "missing",
    connected,
    readOnly,
    protocolVersion: 2,
    extensionVersion,
    connectionMessage: connected ? "本机插件已连接。" : "未检测到本机插件。",
    provider: (providerMeta?.value as ProviderProfile | undefined) ?? null,
    capabilities: (capabilitiesMeta?.value as ProviderCapabilities | undefined) ?? { ...UNKNOWN_CAPABILITIES },
    keywords: promptRows.map((row) => ({ id: row.id, axis: row.axis ?? "style", text: row.text, locked: false, createdAt: row.createdAt })),
    analyses: analysisRows.map(summarizeAnalysis),
    prompts: savedPromptRows.map((row): SavedPrompt => ({
      id: row.id,
      text: row.text,
      negativeText: row.negativeText ?? "",
      language: row.language ?? "zh",
      sourceAssetId: row.sourceAssetId,
      sourceAnalysisId: row.sourceAnalysisId,
      variantKind: row.variantKind,
      model: row.model,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt
    })),
    assets,
    references,
    batches,
    historyEvents,
    storage: {
      usage: estimate.usage ?? 0,
      quota: estimate.quota ?? 0,
      persisted
    },
    captureHandoff: (captureHandoffMeta?.value as StudioSnapshot["captureHandoff"]) ?? null
  };
}

export async function writeSetting(db: LensflowDatabase, key: string, value: unknown): Promise<void> {
  await db.settingsMeta.put({ key, value, updatedAt: new Date().toISOString() });
}

export async function recordHistory(db: LensflowDatabase, type: string, message: string, entityId?: string): Promise<void> {
  await db.historyEvents.add({ id: crypto.randomUUID(), type, message, entityId, createdAt: new Date().toISOString() });
}
