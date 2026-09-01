import { z } from "zod";
import { operationFailureSchema } from "./failure";
import type { ModelDescriptor, ProviderCandidateInput, ProviderCapabilities, ProviderCapabilityProbeResult, ProviderConnectionResult, ProviderEditorState, ProviderProfile } from "./provider";
import type {
  BackupExport,
  BackupImportMode,
  BackupImportSummary,
  HistoryRetentionDays,
  MaintenanceSummary
} from "./data";
import type { AnalysisMode, AnalysisRecord, AnalysisSummary, SavedPrompt, SavePromptInput } from "./product-analysis";
import type { ReleaseUpdateNotice } from "./release";

export const evidenceSourceSchema = z.enum(["measured", "observed", "inferred", "unknown"]);
export type EvidenceSource = z.infer<typeof evidenceSourceSchema>;

export interface EvidenceValue<T> {
  value: T | null;
  source: EvidenceSource;
  confidence?: number;
  note?: string;
}

export const AXIS_ORDER = ["style", "subject", "composition", "color", "motion"] as const;
export type AxisName = (typeof AXIS_ORDER)[number];

export const AXIS_LABELS: Record<AxisName, string> = {
  style: "风格",
  subject: "主体",
  composition: "构图",
  color: "色彩",
  motion: "动态"
};

export const keywordCardSchema = z.object({
  id: z.string().min(1),
  axis: z.enum(AXIS_ORDER),
  text: z.string().trim().min(1).max(240),
  locked: z.boolean().default(false),
  createdAt: z.string().datetime()
});
export type KeywordCard = z.infer<typeof keywordCardSchema>;

export type AxisHand = Record<AxisName, KeywordCard | null>;

export const referenceKindSchema = z.enum(["palette", "pose", "face", "image"]);
export type ReferenceKind = z.infer<typeof referenceKindSchema>;

export const studioReferenceSchema = z.object({
  id: z.string().min(1),
  kind: referenceKindSchema,
  name: z.string().min(1),
  previewUrl: z.string().optional(),
  dataUrl: z.string().optional(),
  enabled: z.boolean().default(true),
  createdAt: z.string().datetime()
});
export type StudioReference = z.infer<typeof studioReferenceSchema>;

export const generationSettingsSchema = z.object({
  model: z.string().default(""),
  size: z.string().default("1024x1024"),
  quality: z.enum(["low", "medium", "high", "auto"]).default("medium"),
  count: z.number().int().min(1).max(10).default(4),
  concurrency: z.number().int().min(1).max(4).default(2)
});
export type GenerationSettings = z.infer<typeof generationSettingsSchema>;

export const generationChildStateSchema = z.enum(["queued", "generating", "retrying", "ready", "failed"]);
export type GenerationChildState = z.infer<typeof generationChildStateSchema>;

export const generationBatchStateSchema = z.enum(["generating", "retrying", "ready", "partial", "failed"]);
export type GenerationBatchState = z.infer<typeof generationBatchStateSchema>;

export const generationChildSchema = z.object({
  id: z.string().min(1),
  batchId: z.string().min(1),
  index: z.number().int().nonnegative(),
  state: generationChildStateSchema,
  remoteId: z.string().optional(),
  remoteClientId: z.string().optional(),
  progress: z.number().min(0).max(1).optional(),
  imageUrl: z.string().optional(),
  dataUrl: z.string().optional(),
  revisedPrompt: z.string().optional(),
  error: z.string().optional(),
  failure: operationFailureSchema.optional(),
  attempt: z.number().int().nonnegative().default(0),
  updatedAt: z.string().datetime()
});
export type GenerationChild = z.infer<typeof generationChildSchema>;

export const generationBatchSchema = z.object({
  id: z.string().min(1),
  providerId: z.string().min(1),
  prompt: z.string().min(1),
  settings: generationSettingsSchema,
  referenceIds: z.array(z.string()),
  state: generationBatchStateSchema,
  children: z.array(generationChildSchema),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime()
});
export type GenerationBatch = z.infer<typeof generationBatchSchema>;

export const assetKindSchema = z.enum(["capture", "prompt", "reference", "work"]);
export type AssetKind = z.infer<typeof assetKindSchema>;

export const assetRecordSchema = z.object({
  id: z.string().min(1),
  kind: assetKindSchema,
  name: z.string().min(1),
  previewUrl: z.string().optional(),
  dataUrl: z.string().optional(),
  prompt: z.string().optional(),
  sourceTaskId: z.string().optional(),
  metadata: z.record(z.string(), z.unknown()).default({}),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime()
});
export type AssetRecord = z.infer<typeof assetRecordSchema>;

export interface StorageSummary {
  usage: number;
  quota: number;
  persisted: boolean;
}

export interface StudioCaptureHandoff {
  assetId: string;
  intent: "analyze" | "analyze-generate";
  createdAt: string;
}

export const historyEventSchema = z.object({
  id: z.string().min(1),
  type: z.string().min(1),
  message: z.string(),
  entityId: z.string().optional(),
  createdAt: z.string().datetime()
});
export type HistoryEvent = z.infer<typeof historyEventSchema>;

export interface StudioSnapshot {
  connectionState: "checking" | "connected" | "missing" | "incompatible" | "error";
  connected: boolean;
  readOnly: boolean;
  protocolVersion: number;
  extensionVersion: string | null;
  connectionMessage: string | null;
  provider: ProviderProfile | null;
  capabilities: ProviderCapabilities;
  keywords: KeywordCard[];
  analyses: AnalysisSummary[];
  prompts: SavedPrompt[];
  assets: AssetRecord[];
  references: StudioReference[];
  batches: GenerationBatch[];
  historyEvents: HistoryEvent[];
  storage: StorageSummary | null;
  demoMode?: boolean;
  updateNotice?: ReleaseUpdateNotice | null;
  captureHandoff?: StudioCaptureHandoff | null;
}

export interface BatchCreateInput {
  prompt: string;
  settings: GenerationSettings;
  referenceIds: string[];
}

export interface EagleWorkExportResult {
  itemId: string;
  name: string;
  tags: string[];
  folders: string[];
  libraryName: string;
  itemCount: number;
}

export interface BatchSelection {
  batchId: string;
  childIds: string[];
}

export interface StudioRuntime {
  load(): Promise<StudioSnapshot>;
  subscribe?(listener: (snapshot: StudioSnapshot) => void): () => void;
  createKeyword(input: Pick<KeywordCard, "axis" | "text">): Promise<KeywordCard>;
  deleteKeyword(id: string): Promise<void>;
  addReference?(assetId: string, kind: ReferenceKind): Promise<StudioReference>;
  setReferenceEnabled?(id: string, enabled: boolean): Promise<StudioReference>;
  deleteReference?(id: string): Promise<void>;
  loadProviderEditorState(): Promise<ProviderEditorState>;
  saveProviderDraft(candidate: ProviderCandidateInput): Promise<ProviderEditorState>;
  testProviderCandidate(candidate: ProviderCandidateInput): Promise<ProviderConnectionResult>;
  probeProviderCandidate(candidate: ProviderCandidateInput): Promise<ProviderCapabilityProbeResult>;
  activateProviderCandidate(candidate: ProviderCandidateInput, probeResult?: ProviderCapabilityProbeResult): Promise<ProviderProfile>;
  listModels(providerId: string, refresh?: boolean): Promise<ModelDescriptor[]>;
  testConnection(providerId: string): Promise<ProviderConnectionResult>;
  probeCapabilities(providerId: string): Promise<ProviderCapabilities>;
  createBatch(input: BatchCreateInput): Promise<GenerationBatch>;
  retryFailed(batchId: string): Promise<GenerationBatch>;
  cancelBatch(batchId: string): Promise<void>;
  saveWork(batchId: string, childId: string): Promise<AssetRecord>;
  download(batchId: string, childId?: string): Promise<void>;
  exportToEagle?(batchId: string, childId: string): Promise<EagleWorkExportResult>;
  openCapture(): Promise<void>;
  openBackup(): Promise<void>;
  openProviderSettings(): Promise<void>;
  openAnalysis(assetId: string): Promise<void>;
  analyzeAsset(assetId: string, mode: AnalysisMode): Promise<AnalysisRecord>;
  getAnalysis(id: string): Promise<AnalysisRecord>;
  cancelAnalysis(id: string): Promise<AnalysisRecord>;
  savePrompt(input: SavePromptInput): Promise<SavedPrompt>;
  downloadMany(selection: BatchSelection): Promise<void>;
  exportManyToEagle?(selection: BatchSelection): Promise<EagleWorkExportResult[]>;
  openLegacyWorkbench?(): Promise<void>;
  importCapture?(input: { name: string; dataUrl: string; mimeType: string; size: number }): Promise<AssetRecord>;
  exportBackup?(): Promise<BackupExport>;
  importBackup?(text: string, mode: BackupImportMode): Promise<BackupImportSummary>;
  exportDiagnostics?(): Promise<BackupExport>;
  loadMaintenance?(): Promise<MaintenanceSummary>;
  setHistoryRetention?(days: HistoryRetentionDays): Promise<MaintenanceSummary>;
  pruneHistory?(): Promise<MaintenanceSummary>;
}
