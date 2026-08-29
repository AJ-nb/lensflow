import Dexie, { type EntityTable } from "dexie";
import {
  UNKNOWN_CAPABILITIES,
  type AssetRecord,
  type GenerationBatch,
  type HistoryEvent,
  type KeywordCard,
  type ProviderCapabilities,
  type ProviderProfile,
  type StudioReference,
  type StudioSnapshot
} from "@lensflow/contracts";

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

export interface AnalysisRecord {
  id: string;
  captureId: string;
  model: string;
  result: unknown;
  rawResponse?: unknown;
  createdAt: string;
}

export interface PromptRecord {
  id: string;
  text: string;
  axis?: KeywordCard["axis"];
  kind: "keyword" | "prompt" | "version";
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
  }
}

export async function readStudioSnapshot(db: LensflowDatabase, connected = true, readOnly = false): Promise<StudioSnapshot> {
  const [providerMeta, capabilitiesMeta, promptRows, assets, references, batches, historyEvents, estimate] = await Promise.all([
    db.settingsMeta.get("activeProvider"),
    db.settingsMeta.get("providerCapabilities"),
    db.prompts.where("kind").equals("keyword").toArray(),
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
    connected,
    readOnly,
    protocolVersion: 1,
    provider: (providerMeta?.value as ProviderProfile | undefined) ?? null,
    capabilities: (capabilitiesMeta?.value as ProviderCapabilities | undefined) ?? { ...UNKNOWN_CAPABILITIES },
    keywords: promptRows.map((row) => ({ id: row.id, axis: row.axis ?? "style", text: row.text, locked: false, createdAt: row.createdAt })),
    assets,
    references,
    batches,
    historyEvents,
    storage: {
      usage: estimate.usage ?? 0,
      quota: estimate.quota ?? 0,
      persisted
    }
  };
}

export async function writeSetting(db: LensflowDatabase, key: string, value: unknown): Promise<void> {
  await db.settingsMeta.put({ key, value, updatedAt: new Date().toISOString() });
}

export async function recordHistory(db: LensflowDatabase, type: string, message: string, entityId?: string): Promise<void> {
  await db.historyEvents.add({ id: crypto.randomUUID(), type, message, entityId, createdAt: new Date().toISOString() });
}
