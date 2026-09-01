import type {
  AssetRecord,
  AnalysisMode,
  AnalysisRecord,
  BackupExport,
  BackupImportMode,
  BackupImportSummary,
  BatchCreateInput,
  BatchSelection,
  GenerationBatch,
  EagleWorkExportResult,
  HistoryRetentionDays,
  KeywordCard,
  MaintenanceSummary,
  ModelDescriptor,
  OperationFailure,
  ProviderCandidateInput,
  ProviderCapabilities,
  ProviderConnectionResult,
  ProviderEditorState,
  ProviderProfile,
  ReferenceKind,
  SavePromptInput,
  SavedPrompt,
  StudioReference,
  StudioRuntime,
  StudioSnapshot
} from "@lensflow/contracts";
import {
  LensflowDatabase,
  createDiagnosticExport,
  createLensflowBackup,
  importLensflowBackup,
  loadMaintenanceSummary,
  measureImageDataUrl,
  originPattern,
  pruneHistory,
  recordHistory,
  setHistoryRetention,
  toOperationFailure
} from "@lensflow/core";
import type { RuntimeRequest, RuntimeResponse } from "../shared/types";

async function send<T>(request: RuntimeRequest): Promise<T> {
  const response = await browser.runtime.sendMessage(request) as RuntimeResponse<T>;
  if (!response?.ok) {
    const failure = response?.failure ?? toOperationFailure(response?.error || "扩展后台没有返回响应。");
    throw new StudioRuntimeError(failure);
  }
  return response.data;
}

export class StudioRuntimeError extends Error {
  constructor(readonly failure: OperationFailure) {
    super(failure.summary);
    this.name = "StudioRuntimeError";
  }
}

async function ensureOriginPermission(profile: ProviderProfile): Promise<void> {
  const origin = originPattern(profile.baseUrl);
  if (await browser.permissions.contains({ origins: [origin] })) return;
  const granted = await browser.permissions.request({ origins: [origin] });
  if (!granted) throw new Error(`需要访问 ${new URL(profile.baseUrl).origin} 才能连接 Provider。`);
}

export class ExtensionStudioRuntime implements StudioRuntime {
  private readonly db = new LensflowDatabase();

  async load(): Promise<StudioSnapshot> {
    return send({ type: "LENSFLOW_SNAPSHOT" });
  }

  subscribe(listener: (snapshot: StudioSnapshot) => void): () => void {
    const channel = new BroadcastChannel("lensflow-local-events");
    const refresh = () => { void this.load().then(listener); };
    channel.addEventListener("message", refresh);
    const runtimeListener = (message: { type?: string }) => { if (message.type === "LENSFLOW_CHANGED") refresh(); };
    browser.runtime.onMessage.addListener(runtimeListener);
    return () => { channel.close(); browser.runtime.onMessage.removeListener(runtimeListener); };
  }

  async createKeyword(input: Pick<KeywordCard, "axis" | "text">): Promise<KeywordCard> {
    return send({ type: "LENSFLOW_CREATE_KEYWORD", ...input });
  }

  async deleteKeyword(id: string): Promise<void> {
    await send({ type: "LENSFLOW_DELETE_KEYWORD", id });
  }

  async addReference(assetId: string, kind: ReferenceKind): Promise<StudioReference> {
    return send({ type: "LENSFLOW_ADD_REFERENCE", assetId, kind });
  }

  async setReferenceEnabled(id: string, enabled: boolean): Promise<StudioReference> {
    return send({ type: "LENSFLOW_SET_REFERENCE", id, enabled });
  }

  async deleteReference(id: string): Promise<void> {
    await send({ type: "LENSFLOW_DELETE_REFERENCE", id });
  }

  async loadProviderEditorState(): Promise<ProviderEditorState> {
    return send({ type: "LENSFLOW_PROVIDER_EDITOR_STATE" });
  }

  async saveProviderDraft(candidate: ProviderCandidateInput): Promise<ProviderEditorState> {
    return send({ type: "LENSFLOW_SAVE_PROVIDER_DRAFT", candidate });
  }

  async testProviderCandidate(candidate: ProviderCandidateInput): Promise<ProviderConnectionResult> {
    await ensureOriginPermission(candidate.profile);
    return send({ type: "LENSFLOW_TEST_PROVIDER_CANDIDATE", candidate });
  }

  async probeProviderCandidate(candidate: ProviderCandidateInput): Promise<ProviderCapabilities> {
    await ensureOriginPermission(candidate.profile);
    return send({ type: "LENSFLOW_PROBE_PROVIDER_CANDIDATE", candidate });
  }

  async activateProviderCandidate(candidate: ProviderCandidateInput): Promise<ProviderProfile> {
    await ensureOriginPermission(candidate.profile);
    return send({ type: "LENSFLOW_ACTIVATE_PROVIDER_CANDIDATE", candidate });
  }

  async listModels(providerId: string, refresh?: boolean): Promise<ModelDescriptor[]> {
    return send({ type: "LENSFLOW_LIST_MODELS", providerId, refresh });
  }

  async testConnection(providerId: string): Promise<ProviderConnectionResult> {
    return send({ type: "LENSFLOW_TEST_PROVIDER", providerId });
  }

  async probeCapabilities(providerId: string): Promise<ProviderCapabilities> {
    return send({ type: "LENSFLOW_PROBE_PROVIDER", providerId });
  }

  async createBatch(input: BatchCreateInput): Promise<GenerationBatch> {
    return send({ type: "LENSFLOW_CREATE_BATCH", input });
  }

  async retryFailed(batchId: string): Promise<GenerationBatch> {
    return send({ type: "LENSFLOW_RETRY_FAILED", batchId });
  }

  async cancelBatch(batchId: string): Promise<void> {
    await send({ type: "LENSFLOW_CANCEL_BATCH", batchId });
  }

  async saveWork(batchId: string, childId: string): Promise<AssetRecord> {
    return send({ type: "LENSFLOW_SAVE_WORK", batchId, childId });
  }

  async download(batchId: string, childId?: string): Promise<void> {
    await send({ type: "LENSFLOW_DOWNLOAD", batchId, childId });
  }

  async exportToEagle(batchId: string, childId: string): Promise<EagleWorkExportResult> {
    const origin = "http://localhost/*";
    if (!await browser.permissions.contains({ origins: [origin] })) {
      const granted = await browser.permissions.request({ origins: [origin] });
      if (!granted) throw new Error("需要本机 Eagle API 权限才能导出。");
    }
    return send({ type: "LENSFLOW_EXPORT_EAGLE", batchId, childId });
  }

  async openCapture(): Promise<void> {
    await send({ type: "LENSFLOW_OPEN_WORKSPACE", hash: "#capture" });
  }

  async openBackup(): Promise<void> {
    await send({ type: "LENSFLOW_OPEN_WORKSPACE", hash: "#backup" });
  }

  async openProviderSettings(): Promise<void> {
    await send({ type: "LENSFLOW_OPEN_WORKSPACE", hash: "#provider" });
  }

  async openAnalysis(assetId: string): Promise<void> {
    await send({ type: "LENSFLOW_OPEN_ANALYSIS", assetId });
  }

  async analyzeAsset(assetId: string, mode: AnalysisMode): Promise<AnalysisRecord> {
    return send({ type: "LENSFLOW_ANALYZE_ASSET", assetId, mode });
  }

  async getAnalysis(analysisId: string): Promise<AnalysisRecord> {
    return send({ type: "LENSFLOW_GET_ANALYSIS", analysisId });
  }

  async cancelAnalysis(analysisId: string): Promise<AnalysisRecord> {
    return send({ type: "LENSFLOW_CANCEL_ANALYSIS", analysisId });
  }

  async savePrompt(input: SavePromptInput): Promise<SavedPrompt> {
    return send({ type: "LENSFLOW_SAVE_PROMPT", input });
  }

  async downloadMany(selection: BatchSelection): Promise<void> {
    await send({ type: "LENSFLOW_DOWNLOAD_MANY", selection });
  }

  async exportManyToEagle(selection: BatchSelection): Promise<EagleWorkExportResult[]> {
    const origin = "http://localhost/*";
    if (!await browser.permissions.contains({ origins: [origin] })) {
      const granted = await browser.permissions.request({ origins: [origin] });
      if (!granted) throw new Error("需要本机 Eagle API 权限才能导出。");
    }
    return send({ type: "LENSFLOW_EXPORT_EAGLE_MANY", selection });
  }

  async openLegacyWorkbench(): Promise<void> {
    location.hash = "legacy";
    location.reload();
  }

  async importCapture(input: { name: string; dataUrl: string; mimeType: string; size: number }): Promise<AssetRecord> {
    const measured = await measureImageDataUrl(input.dataUrl);
    const sha256 = measured.sha256.value!;
    const duplicate = await this.db.captures.where("sha256").equals(sha256).first();
    if (duplicate) {
      const existing = await this.db.assets.filter((asset) => asset.metadata.captureId === duplicate.id).first();
      if (existing) return existing;
    }
    const now = new Date().toISOString();
    const id = crypto.randomUUID();
    const asset: AssetRecord = {
      id,
      kind: "capture",
      name: input.name,
      dataUrl: input.dataUrl,
      metadata: {
        captureId: id,
        mimeType: input.mimeType,
        byteSize: input.size,
        width: measured.width,
        height: measured.height,
        aspectRatio: measured.aspectRatio,
        sha256,
        palette: measured.palette
      },
      createdAt: now,
      updatedAt: now
    };
    await this.db.transaction("rw", [this.db.captures, this.db.assets, this.db.historyEvents], async () => {
      await this.db.captures.add({ id, dataUrl: input.dataUrl, width: measured.width.value!, height: measured.height.value!, sha256, createdAt: now });
      await this.db.assets.add(asset);
      await recordHistory(this.db, "capture.imported", "已导入并完成本地尺寸、比例、哈希与色卡测量", id);
    });
    this.announceChanged();
    return asset;
  }

  async exportBackup(): Promise<BackupExport> {
    const output = await createLensflowBackup(this.db, browser.runtime.getManifest().version);
    downloadText(output);
    return output;
  }

  async importBackup(text: string, mode: BackupImportMode): Promise<BackupImportSummary> {
    let value: unknown;
    try { value = JSON.parse(text); } catch { throw new Error("备份文件不是有效的 JSON。"); }
    const result = await importLensflowBackup(this.db, value, mode);
    this.announceChanged();
    return result;
  }

  async exportDiagnostics(): Promise<BackupExport> {
    const output = await createDiagnosticExport(this.db, browser.runtime.getManifest().version);
    downloadText(output);
    return output;
  }

  async loadMaintenance(): Promise<MaintenanceSummary> {
    return loadMaintenanceSummary(this.db);
  }

  async setHistoryRetention(days: HistoryRetentionDays): Promise<MaintenanceSummary> {
    const summary = await setHistoryRetention(this.db, days);
    this.announceChanged();
    return summary;
  }

  async pruneHistory(): Promise<MaintenanceSummary> {
    const summary = await pruneHistory(this.db);
    this.announceChanged();
    return summary;
  }

  private announceChanged() {
    const channel = new BroadcastChannel("lensflow-local-events");
    channel.postMessage({ type: "changed" });
    channel.close();
  }
}

function downloadText(output: BackupExport) {
  const url = URL.createObjectURL(new Blob([output.text], { type: `${output.mimeType};charset=utf-8` }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = output.fileName;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}
