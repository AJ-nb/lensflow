import {
  LENSFLOW_BRIDGE_VERSION,
  assertBridgePayloadSize,
  bridgeRequestSchema,
  parseBridgePayload,
  releaseUpdateNoticeSchema,
  generationSettingsSchema,
  providerProfileSchema,
  savePromptInputSchema,
  type AssetRecord,
  type AnalysisMode,
  type AnalysisRecord,
  type BridgeRequest,
  type GenerationBatch,
  type GenerationChild,
  type EagleWorkExportResult,
  type ModelDescriptor,
  type ProviderCapabilities,
  type ProviderConnectionResult,
  type ProviderProfile,
  type ReferenceKind,
  type SavePromptInput,
  type SavedPrompt,
  type StudioReference
} from "@lensflow/contracts";
import {
  LensflowDatabase,
  MODEL_CATALOG_CACHE_TTL_MS,
  BridgeReplayGuard,
  analysisRecordForBridge,
  ComfyUIAdapter,
  aggregateBatchState,
  createProviderAdapter,
  buildProductAnalysisPrompt,
  dataUrlToBlob,
  normalizeReferences,
  originPattern,
  isModelCatalogCacheFresh,
  readStudioSnapshot,
  redactSensitive,
  recordHistory,
  retryFailedChildren,
  QUICK_ANALYSIS_JSON_SCHEMA,
  localMeasurementsFromAsset,
  parseProductAnalysisOutput,
  runProductAnalysisRequest,
  validateKeywordInput,
  writeSetting
} from "@lensflow/core";
import type { CaptureIntent, ImageSource, RuntimeRequest } from "../shared/types";
import { STORAGE_KEYS } from "../shared/storage";
import { planLegacyProviderMigration, type LegacyProviderSettings } from "./legacy-provider-migration";
import { ChromeProviderSecretStore } from "./secret-store";

const db = new LensflowDatabase();
const secrets = new ChromeProviderSecretStore();
const bridgeReplayGuard = new BridgeReplayGuard();
const analysisControllers = new Map<string, AbortController>();

export async function migrateLegacyProviderSettings(): Promise<boolean> {
  const [local, session, active] = await Promise.all([
    browser.storage.local.get(STORAGE_KEYS.settings),
    browser.storage.session.get(STORAGE_KEYS.sessionApiKey),
    db.settingsMeta.get("activeProvider")
  ]);
  const migration = planLegacyProviderMigration({
    legacy: local[STORAGE_KEYS.settings] as LegacyProviderSettings | undefined,
    sessionKey: session[STORAGE_KEYS.sessionApiKey],
    activeProvider: active?.value
  });
  if (!migration) return false;
  await secrets.set(migration.profile.id, migration.apiKey, migration.profile.rememberSecret);
  await writeSetting(db, "activeProvider", migration.profile);
  await Promise.all([
    browser.storage.local.set({ [STORAGE_KEYS.settings]: migration.safeLegacy }),
    browser.storage.session.remove(STORAGE_KEYS.sessionApiKey)
  ]);
  return true;
}

export async function captureSourceForStudio(source: ImageSource, intent: CaptureIntent): Promise<AssetRecord> {
  const dataUrl = source.dataUrl || await fetchSourceDataUrl(source.url);
  if (!dataUrl) throw new Error("无法读取该图片。请授权图片所在站点、使用截图，或在 Studio 上传本地文件。");
  const measured = await measureCapturedImage(dataUrl);
  const now = new Date().toISOString();
  const assetId = `capture:${source.id}`;
  const asset: AssetRecord = {
    id: assetId,
    kind: "capture",
    name: source.alt?.trim() || source.fileName || source.pageTitle || "网页捕捉",
    dataUrl,
    metadata: {
      captureId: source.id,
      pageUrl: source.pageUrl,
      width: measured.width,
      height: measured.height,
      aspectRatio: measured.aspectRatio,
      sha256: measured.sha256.value,
      palette: measured.palette
    },
    createdAt: now,
    updatedAt: now
  };
  await db.transaction("rw", [db.assets, db.captures, db.settingsMeta, db.historyEvents], async () => {
    await db.assets.put(asset);
    await db.captures.put({
      id: source.id,
      sourceUrl: source.url,
      pageUrl: source.pageUrl,
      dataUrl,
      width: measured.width.value ?? undefined,
      height: measured.height.value ?? undefined,
      sha256: measured.sha256.value ?? undefined,
      createdAt: now
    });
    await writeSetting(db, "captureHandoff", { assetId, intent, createdAt: now });
    await recordHistory(db, "capture.imported", intent === "analyze-generate" ? "已捕捉图片，完成分析后将预填创作" : "已捕捉图片并准备快速分析", assetId);
  });
  await notifyChanged();
  void analyzeAsset(assetId, "quick").catch(async (error) => {
    await recordHistory(db, "analysis.blocked", error instanceof Error ? error.message : "快速分析未能启动", assetId);
    await notifyChanged();
  });
  return asset;
}

async function measureCapturedImage(dataUrl: string) {
  const { measureImageDataUrl } = await import("@lensflow/core");
  return measureImageDataUrl(dataUrl);
}

async function fetchSourceDataUrl(url?: string): Promise<string | undefined> {
  if (!url || !/^https?:\/\//i.test(url)) return undefined;
  const permission = originPattern(url);
  if (!await browser.permissions.contains({ origins: [permission] })) {
    const granted = await browser.permissions.request({ origins: [permission] });
    if (!granted) return undefined;
  }
  const response = await fetch(url);
  if (!response.ok) throw new Error(`图片读取失败 (${response.status})。`);
  const blob = await response.blob();
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += 0x8000) binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  return `data:${blob.type || "image/png"};base64,${btoa(binary)}`;
}

export async function handleLensflowRequest(request: RuntimeRequest): Promise<unknown> {
  switch (request.type) {
    case "LENSFLOW_SNAPSHOT":
      return readLiveStudioSnapshot();
    case "LENSFLOW_SAVE_PROVIDER":
      return saveProvider(request.profile, request.secret);
    case "LENSFLOW_LIST_MODELS":
      return listModels(request.providerId, request.refresh);
    case "LENSFLOW_TEST_PROVIDER":
      return testProvider(request.providerId);
    case "LENSFLOW_PROBE_PROVIDER":
      return probeProvider(request.providerId);
    case "LENSFLOW_CREATE_KEYWORD":
      return createKeyword(request.axis, request.text);
    case "LENSFLOW_DELETE_KEYWORD":
      await db.prompts.delete(request.id);
      await notifyChanged();
      return null;
    case "LENSFLOW_ADD_REFERENCE":
      return addReference(request.assetId, request.kind);
    case "LENSFLOW_SET_REFERENCE":
      return setReferenceEnabled(request.id, request.enabled);
    case "LENSFLOW_DELETE_REFERENCE":
      await db.references.delete(request.id);
      await notifyChanged();
      return null;
    case "LENSFLOW_CREATE_BATCH":
      return createBatch(request.input);
    case "LENSFLOW_RETRY_FAILED":
      return retryBatch(request.batchId);
    case "LENSFLOW_CANCEL_BATCH":
      return cancelBatch(request.batchId);
    case "LENSFLOW_SAVE_WORK":
      return saveWork(request.batchId, request.childId);
    case "LENSFLOW_DOWNLOAD":
      return downloadResults(request.batchId, request.childId);
    case "LENSFLOW_EXPORT_EAGLE":
      return exportWorkToEagle(request.batchId, request.childId);
    case "LENSFLOW_OPEN_WORKSPACE":
      await openWorkspace(request.hash);
      return null;
    case "LENSFLOW_OPEN_ANALYSIS":
      return openAnalysis(request.assetId);
    case "LENSFLOW_ANALYZE_ASSET":
      return analyzeAsset(request.assetId, request.mode);
    case "LENSFLOW_GET_ANALYSIS":
      return getAnalysis(request.analysisId);
    case "LENSFLOW_CANCEL_ANALYSIS":
      return cancelAnalysis(request.analysisId);
    case "LENSFLOW_SAVE_PROMPT":
      return savePrompt(request.input);
    case "LENSFLOW_DOWNLOAD_MANY":
      return downloadMany(request.selection.batchId, request.selection.childIds);
    case "LENSFLOW_EXPORT_EAGLE_MANY":
      return exportManyToEagle(request.selection.batchId, request.selection.childIds);
    case "LENSFLOW_BRIDGE_RPC":
      return handleBridgeRequest(request.request);
    default:
      return undefined;
  }
}

export async function resumeRemoteTasks(): Promise<void> {
  const incomplete = await db.generationJobs.where("state").anyOf("generating", "retrying").toArray();
  for (const batch of incomplete) {
    const remoteChildren = batch.children.filter((child) => child.remoteId && (child.state === "generating" || child.state === "retrying"));
    for (const child of remoteChildren) await pollRemoteChild(batch.id, child).catch(() => undefined);
    const ambiguousChildren = batch.children.filter((child) => !child.remoteId && (child.state === "generating" || child.state === "retrying"));
    for (const child of ambiguousChildren) {
      await updateChild(batch.id, child.index, (current) => ({
        ...current,
        state: "failed",
        error: "扩展重启前未保存远端任务 ID，无法确认请求是否已受理。为避免重复付费，Lensflow 不会自动重发；请核对 Provider 后手动补全此位置。",
        updatedAt: new Date().toISOString()
      }));
    }
  }
  if (incomplete.length) await notifyChanged();
}

async function saveProvider(raw: ProviderProfile, secret?: string): Promise<ProviderProfile> {
  const profile = providerProfileSchema.parse({ ...raw, updatedAt: new Date().toISOString() });
  await writeSetting(db, "activeProvider", profile);
  if (secret !== undefined) {
    if (secret.trim()) await secrets.set(profile.id, secret.trim(), profile.rememberSecret);
    else await secrets.remove(profile.id);
  }
  await recordHistory(db, "provider.updated", `已更新 Provider：${profile.name}`, profile.id);
  await notifyChanged();
  return profile;
}

async function activeProvider(providerId?: string): Promise<ProviderProfile> {
  const row = await db.settingsMeta.get("activeProvider");
  const profile = providerProfileSchema.parse(row?.value);
  if (providerId && profile.id !== providerId) throw new Error("请求的 Provider 不是当前活动配置。");
  return profile;
}

async function providerSecret(providerId: string): Promise<string> {
  const secret = await secrets.get(providerId);
  if (!secret) throw new Error("请在插件 Provider 设置中填写 API Key。");
  return secret;
}

async function listModels(providerId: string, refresh = false): Promise<ModelDescriptor[]> {
  const cacheKey = `modelCache:${providerId}`;
  const cached = await db.settingsMeta.get(cacheKey);
  const cachedValue = cached?.value as { cachedAt?: number; expiresAt?: number; models?: ModelDescriptor[] } | undefined;
  if (!refresh && isModelCatalogCacheFresh(cachedValue)) {
    return cachedValue.models;
  }
  const profile = await activeProvider(providerId);
  const secret = profile.kind === "comfyui" ? "" : await providerSecret(providerId);
  const models = await createProviderAdapter(profile).listModels(profile, secret);
  await cacheModels(providerId, models);
  return models;
}

async function testProvider(providerId: string): Promise<ProviderConnectionResult> {
  const profile = await activeProvider(providerId);
  const secret = profile.kind === "comfyui" ? "" : await providerSecret(providerId);
  const result = await createProviderAdapter(profile).testConnection(profile, secret);
  await cacheModels(providerId, result.models);
  return result;
}

async function cacheModels(providerId: string, models: ModelDescriptor[]): Promise<void> {
  const cachedAt = Date.now();
  await writeSetting(db, `modelCache:${providerId}`, { cachedAt, expiresAt: cachedAt + MODEL_CATALOG_CACHE_TTL_MS, models });
}

async function probeProvider(providerId: string): Promise<ProviderCapabilities> {
  const profile = await activeProvider(providerId);
  const secret = profile.kind === "comfyui" ? "" : await providerSecret(providerId);
  const result = await createProviderAdapter(profile).probeCapabilities(profile, secret);
  await writeSetting(db, "providerCapabilities", result);
  await notifyChanged();
  return result;
}

async function analyzeAsset(assetId: string, mode: AnalysisMode): Promise<AnalysisRecord> {
  const asset = await db.assets.get(assetId);
  const imageDataUrl = asset?.dataUrl;
  if (!asset || !imageDataUrl) throw new Error("所选素材不存在或没有可分析的本地图片数据。");
  const profile = await activeProvider();
  if (!profile.analysisModel) throw new Error("请先在 Provider 设置中选择分析模型。");
  const secret = profile.kind === "comfyui" ? "" : await providerSecret(profile.id);
  if (profile.kind === "comfyui") throw new Error("ComfyUI 首版只用于图片生成与编辑，不能执行结构化产品分析。");
  const now = new Date().toISOString();
  const record: AnalysisRecord = {
    id: crypto.randomUUID(),
    assetId,
    captureId: typeof asset.metadata.captureId === "string" ? asset.metadata.captureId : assetId,
    mode,
    state: "preparing",
    providerId: profile.id,
    model: profile.analysisModel,
    createdAt: now,
    updatedAt: now
  };
  await db.analyses.add(record);
  await recordHistory(db, "analysis.created", mode === "deep" ? "已启动深入产品分析" : "已启动快速产品分析", record.id);
  await notifyChanged();

  const controller = new AbortController();
  analysisControllers.set(record.id, controller);
  try {
    await db.analyses.update(record.id, { state: "analyzing", updatedAt: new Date().toISOString() });
    await notifyChanged();
    const quickCandidates = mode === "deep"
      ? await db.analyses.where("assetId").equals(assetId).filter((item) => item.mode === "quick" && Boolean(item.result)).toArray()
      : [];
    const latestQuick = quickCandidates.sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))[0];
    const parsed = await runProductAnalysisRequest({
      adapter: createProviderAdapter(profile),
      profile,
      secret,
      asset,
      mode,
      baseResult: latestQuick?.result,
      signal: controller.signal
    });
    const partialMessage = parsed.segmentErrors.length
      ? `深入分析部分完成：${parsed.segmentErrors.join("；")}`
      : "Provider 返回的部分字段未通过 Schema，Lensflow 已保留并标记缺失边界。";
    const complete: AnalysisRecord = {
      ...record,
      state: parsed.partial ? "partial" : "ready",
      result: parsed.result,
      rawResponse: parsed.rawResponse,
      error: parsed.partial ? partialMessage : undefined,
      updatedAt: new Date().toISOString()
    };
    await db.analyses.put(complete);
    await recordHistory(db, parsed.partial ? "analysis.partial" : "analysis.ready", parsed.partial ? "产品分析部分完成" : "产品分析完成", complete.id);
    await notifyChanged();
    return complete;
  } catch (error) {
    const interrupted = controller.signal.aborted || (error instanceof DOMException && error.name === "AbortError");
    const failed: AnalysisRecord = {
      ...record,
      state: interrupted ? "interrupted" : "failed",
      error: interrupted ? "分析已由用户中断；Lensflow 不会自动重发请求。" : error instanceof Error ? error.message : "分析失败",
      updatedAt: new Date().toISOString()
    };
    await db.analyses.put(failed);
    await recordHistory(db, interrupted ? "analysis.interrupted" : "analysis.failed", failed.error!, failed.id);
    await notifyChanged();
    return failed;
  } finally {
    analysisControllers.delete(record.id);
  }
}

async function getAnalysis(analysisId: string): Promise<AnalysisRecord> {
  const record = await db.analyses.get(analysisId);
  if (!record) throw new Error("分析记录不存在。");
  return record;
}

async function cancelAnalysis(analysisId: string): Promise<AnalysisRecord> {
  const record = await getAnalysis(analysisId);
  analysisControllers.get(analysisId)?.abort();
  if (["ready", "partial", "failed", "interrupted"].includes(record.state)) return record;
  const next: AnalysisRecord = { ...record, state: "interrupted", error: "分析已由用户中断；Lensflow 不会自动重发请求。", updatedAt: new Date().toISOString() };
  await db.analyses.put(next);
  await notifyChanged();
  return next;
}

async function savePrompt(raw: SavePromptInput): Promise<SavedPrompt> {
  const input = savePromptInputSchema.parse(raw);
  const now = new Date().toISOString();
  const saved: SavedPrompt = { ...input, id: crypto.randomUUID(), createdAt: now, updatedAt: now };
  await db.prompts.add({ ...saved, kind: "prompt" });
  await recordHistory(db, "prompt.saved", "已将分析提示词保存到提示词册", saved.id);
  await notifyChanged();
  return saved;
}

async function createKeyword(axis: "style" | "subject" | "composition" | "color" | "motion", text: string) {
  const existing = await db.prompts.where("kind").equals("keyword").toArray();
  const trimmed = validateKeywordInput(text, axis, existing.map((row) => ({
    id: row.id,
    axis: row.axis ?? "style",
    text: row.text,
    locked: false,
    createdAt: row.createdAt
  })));
  const now = new Date().toISOString();
  const row = { id: crypto.randomUUID(), axis, text: trimmed, kind: "keyword" as const, createdAt: now, updatedAt: now };
  await db.prompts.add(row);
  await recordHistory(db, "keyword.created", `已添加${axis}关键词：${trimmed}`, row.id);
  await notifyChanged();
  return { id: row.id, axis, text: trimmed, locked: false, createdAt: now };
}

async function addReference(assetId: string, kind: ReferenceKind): Promise<StudioReference> {
  const asset = await db.assets.get(assetId);
  if (!asset || (!asset.dataUrl && !asset.previewUrl)) throw new Error("参考资产不存在或没有可发送的图片数据。");
  const existing = await db.references.filter((reference) => reference.kind === kind && reference.dataUrl === asset.dataUrl && reference.previewUrl === asset.previewUrl).first();
  if (existing) return existing;
  const reference: StudioReference = {
    id: crypto.randomUUID(),
    kind,
    name: asset.name,
    dataUrl: asset.dataUrl,
    previewUrl: asset.previewUrl,
    enabled: true,
    createdAt: new Date().toISOString()
  };
  await db.transaction("rw", db.references, async () => {
    if (kind === "palette") {
      const activePalettes = await db.references.where("kind").equals("palette").toArray();
      await db.references.bulkPut(activePalettes.map((item) => ({ ...item, enabled: false })));
    }
    await db.references.add(reference);
  });
  await recordHistory(db, "reference.created", `已将“${asset.name}”设为${referenceLabel(kind)}`, reference.id);
  await notifyChanged();
  return reference;
}

async function setReferenceEnabled(id: string, enabled: boolean): Promise<StudioReference> {
  const reference = await db.references.get(id);
  if (!reference) throw new Error("参考资产不存在。");
  const next = { ...reference, enabled };
  await db.references.put(next);
  await notifyChanged();
  return next;
}

function referenceLabel(kind: ReferenceKind) {
  return ({ image: "主体参考", face: "角色脸参考", pose: "姿态参考", palette: "色卡参考" } as const)[kind];
}

async function createBatch(input: { prompt: string; settings: unknown; referenceIds: string[] }): Promise<GenerationBatch> {
  const prompt = input.prompt.trim();
  if (!prompt) throw new Error("最终提示词不能为空。");
  const settings = generationSettingsSchema.parse(input.settings);
  const profile = await activeProvider();
  if (!settings.model) throw new Error("请先选择图片模型。");
  const selectedReferences = normalizeReferences((await db.references.bulkGet(input.referenceIds)).filter((item): item is StudioReference => Boolean(item)));
  if (selectedReferences.length) {
    const capabilities = (await db.settingsMeta.get("providerCapabilities"))?.value as ProviderCapabilities | undefined;
    if (capabilities?.imageEditing !== "supported") throw new Error("当前 Provider 尚未验证图片编辑能力，不能提交参考图片。请先运行能力检测或移除参考。");
    if (selectedReferences.some((reference) => !reference.dataUrl)) throw new Error("参考资产缺少本地图片数据，提交前请重新导入该参考。");
  }
  const now = new Date().toISOString();
  const batchId = crypto.randomUUID();
  const children: GenerationChild[] = Array.from({ length: settings.count }, (_, index) => ({
    id: crypto.randomUUID(), batchId, index, state: "queued", attempt: 0, updatedAt: now
  }));
  const batch: GenerationBatch = {
    id: batchId,
    providerId: profile.id,
    prompt,
    settings,
    referenceIds: selectedReferences.map((reference) => reference.id),
    state: "generating",
    children,
    createdAt: now,
    updatedAt: now
  };
  await db.generationJobs.add(batch);
  await recordHistory(db, "batch.created", `已创建 ${settings.count} 张生成批次`, batch.id);
  await notifyChanged();
  void runBatchChildren(batch.id, children.map((child) => child.index), settings.concurrency);
  return batch;
}

async function runBatchChildren(batchId: string, indexes: number[], concurrency: number): Promise<void> {
  const queue = [...indexes];
  const workers = Array.from({ length: Math.min(concurrency, queue.length) }, async () => {
    while (queue.length) {
      const index = queue.shift();
      if (index === undefined) return;
      await submitChild(batchId, index).catch(async (error) => {
        await updateChild(batchId, index, (child) => ({ ...child, state: "failed", error: error instanceof Error ? error.message : "生成失败", updatedAt: new Date().toISOString() }));
      });
    }
  });
  await Promise.all(workers);
  await notifyChanged();
}

async function submitChild(batchId: string, index: number): Promise<void> {
  const batch = await db.generationJobs.get(batchId);
  if (!batch) throw new Error("生成批次不存在。");
  const profile = await activeProvider(batch.providerId);
  const secret = profile.kind === "comfyui" ? "" : await providerSecret(profile.id);
  const adapter = createProviderAdapter(profile);
  await updateChild(batchId, index, (child) => ({ ...child, state: child.attempt ? "retrying" : "generating", error: undefined, updatedAt: new Date().toISOString() }));
  const references = normalizeReferences((await db.references.bulkGet(batch.referenceIds)).filter((item): item is StudioReference => Boolean(item)));
  const prompt = references.length ? `${batch.prompt}\n\n参考约束（按优先级）：${references.map(referenceInstruction).join("；")}` : batch.prompt;
  const result = references.length
    ? await adapter.edit(profile, secret, {
      model: batch.settings.model,
      prompt,
      size: batch.settings.size,
      quality: batch.settings.quality,
      image: dataUrlToBlob(references[0]!.dataUrl!),
      additionalImages: references.slice(1).map((reference) => ({ kind: reference.kind, image: dataUrlToBlob(reference.dataUrl!) })),
      async: profile.kind === "biyuan" || profile.kind === "comfyui"
    })
    : await adapter.generate(profile, secret, {
      model: batch.settings.model,
      prompt,
      size: batch.settings.size,
      quality: batch.settings.quality,
      count: 1,
      async: profile.kind === "biyuan" || profile.kind === "comfyui"
    });
  if (result.remoteId && result.state !== "succeeded" && result.state !== "failed") {
    await updateChild(batchId, index, (child) => ({ ...child, state: "generating", remoteId: result.remoteId, remoteClientId: result.remoteClientId, progress: 0, updatedAt: new Date().toISOString() }));
    if (adapter instanceof ComfyUIAdapter && result.remoteClientId) {
      void adapter.watchTask(profile, result.remoteId, result.remoteClientId, (progress) => {
        void updateChild(batchId, index, (child) => ({ ...child, progress, updatedAt: new Date().toISOString() })).then(notifyChanged);
      }).then(async () => {
        const current = await db.generationJobs.get(batchId);
        const child = current?.children.find((item) => item.index === index);
        if (child) await pollRemoteChild(batchId, child);
      }).catch(() => undefined);
    }
    return;
  }
  const image = result.images[0];
  await updateChild(batchId, index, (child) => ({
    ...child,
    state: result.state === "succeeded" && image ? "ready" : "failed",
    dataUrl: image?.dataUrl,
    imageUrl: image?.url,
    revisedPrompt: image?.revisedPrompt,
    error: result.error,
    remoteId: result.remoteId,
    remoteClientId: result.remoteClientId,
    progress: result.state === "succeeded" ? 1 : child.progress,
    updatedAt: new Date().toISOString()
  }));
}

function referenceInstruction(reference: StudioReference) {
  return reference.kind === "face" ? `角色脸“${reference.name}”只约束身份与面部一致性`
    : reference.kind === "pose" ? `姿态“${reference.name}”只约束动作、位置、透视和受力`
      : reference.kind === "palette" ? `色卡“${reference.name}”只约束整批色彩关系`
        : `主体参考“${reference.name}”约束主要视觉对象`;
}

async function pollRemoteChild(batchId: string, child: GenerationChild): Promise<void> {
  const batch = await db.generationJobs.get(batchId);
  if (!batch || !child.remoteId) return;
  const profile = await activeProvider(batch.providerId);
  const secret = profile.kind === "comfyui" ? "" : await providerSecret(profile.id);
  const result = await createProviderAdapter(profile).retrieve(profile, secret, child.remoteId);
  if (result.state === "queued" || result.state === "running") return;
  const image = result.images[0];
  await updateChild(batchId, child.index, (current) => ({
    ...current,
    state: result.state === "succeeded" && image ? "ready" : "failed",
    dataUrl: image?.dataUrl,
    imageUrl: image?.url,
    revisedPrompt: image?.revisedPrompt,
    error: result.error,
    progress: result.state === "succeeded" ? 1 : current.progress,
    updatedAt: new Date().toISOString()
  }));
  await notifyChanged();
}

async function updateChild(batchId: string, index: number, update: (child: GenerationChild) => GenerationChild): Promise<void> {
  await db.transaction("rw", db.generationJobs, async () => {
    const batch = await db.generationJobs.get(batchId);
    if (!batch) throw new Error("生成批次不存在。");
    const children = batch.children.map((child) => child.index === index ? update(child) : child);
    await db.generationJobs.put({ ...batch, children, state: aggregateBatchState(children), updatedAt: new Date().toISOString() });
  });
}

async function retryBatch(batchId: string): Promise<GenerationBatch> {
  const batch = await db.generationJobs.get(batchId);
  if (!batch) throw new Error("生成批次不存在。");
  const retrying = retryFailedChildren(batch);
  const indexes = retrying.children.filter((child) => child.state === "retrying").map((child) => child.index);
  if (!indexes.length) return retrying;
  await db.generationJobs.put(retrying);
  await recordHistory(db, "batch.retry", `正在补全 ${indexes.length} 个失败位置`, batchId);
  await notifyChanged();
  void runBatchChildren(batchId, indexes, batch.settings.concurrency);
  return retrying;
}

async function cancelBatch(batchId: string): Promise<void> {
  const batch = await db.generationJobs.get(batchId);
  if (!batch) throw new Error("生成批次不存在。");
  const profile = await activeProvider(batch.providerId);
  const secret = profile.kind === "comfyui" ? "" : await providerSecret(profile.id);
  const adapter = createProviderAdapter(profile);
  if (adapter.capabilities(profile).cancellation !== "supported") throw new Error("当前 Provider 没有可验证的取消接口。");
  for (const child of batch.children) if (child.remoteId) await adapter.cancel(profile, secret, child.remoteId);
  const now = new Date().toISOString();
  const children = batch.children.map((child) => child.state === "ready" ? child : { ...child, state: "failed" as const, error: "已由用户取消", updatedAt: now });
  await db.generationJobs.put({ ...batch, children, state: aggregateBatchState(children), updatedAt: now });
  await notifyChanged();
}

async function saveWork(batchId: string, childId: string): Promise<AssetRecord> {
  const batch = await db.generationJobs.get(batchId);
  const child = batch?.children.find((item) => item.id === childId);
  if (!batch || !child || child.state !== "ready") throw new Error("只能保存已完成的生成结果。");
  const now = new Date().toISOString();
  const existing = await db.assets.where("sourceTaskId").equals(child.id).first();
  if (existing) return existing;
  const asset: AssetRecord = {
    id: crypto.randomUUID(),
    kind: "work",
    name: `作品 ${child.index + 1}`,
    previewUrl: child.imageUrl,
    dataUrl: child.dataUrl,
    prompt: batch.prompt,
    sourceTaskId: child.id,
    metadata: { model: batch.settings.model, size: batch.settings.size, references: batch.referenceIds, batchId },
    createdAt: now,
    updatedAt: now
  };
  await db.assets.add(asset);
  await recordHistory(db, "work.saved", `已将结果 ${child.index + 1} 收入作品集`, asset.id);
  await notifyChanged();
  return asset;
}

async function downloadResults(batchId: string, childId?: string): Promise<void> {
  const batch = await db.generationJobs.get(batchId);
  if (!batch) throw new Error("生成批次不存在。");
  const targets = childId ? batch.children.filter((child) => child.id === childId) : batch.children.filter((child) => child.state === "ready");
  for (const child of targets) {
    const url = child.dataUrl || child.imageUrl;
    if (url) await browser.downloads.download({ url, filename: `lensflow/${batch.id}-${child.index + 1}.png`, saveAs: false });
  }
}

async function downloadMany(batchId: string, childIds: string[]): Promise<void> {
  const unique = [...new Set(childIds)].slice(0, 10);
  if (!unique.length) throw new Error("请至少选择一个生成结果。");
  for (const childId of unique) await downloadResults(batchId, childId);
}

async function exportWorkToEagle(batchId: string, childId: string): Promise<EagleWorkExportResult> {
  const batch = await db.generationJobs.get(batchId);
  const child = batch?.children.find((item) => item.id === childId);
  const sourceUrl = child?.dataUrl || child?.imageUrl;
  if (!batch || !child || child.state !== "ready" || !sourceUrl) throw new Error("只能导出已完成且包含图片的结果。");
  const { connectToEagle, importGeneratedWorkToEagle } = await import("../lib/eagle");
  const before = await connectToEagle();
  const tags = [
    "同步/Lensflow",
    `模型/${safeEagleTag(batch.settings.model)}`,
    `尺寸/${safeEagleTag(batch.settings.size)}`
  ];
  const imported = await importGeneratedWorkToEagle({
    name: `Lensflow ${batch.id.slice(0, 8)}-${child.index + 1}`,
    sourceUrl,
    tags,
    annotation: [
      `提示词：${batch.prompt}`,
      `模型：${batch.settings.model}`,
      `尺寸：${batch.settings.size}`,
      `批次：${batch.id}`,
      `位置：${child.index + 1}/${batch.children.length}`
    ].join("\n")
  });
  const after = await connectToEagle();
  await recordHistory(db, "work.eagle", `已将结果 ${child.index + 1} 导入 Eagle 并回读验证`, child.id);
  await notifyChanged();
  return {
    itemId: imported.itemId,
    name: imported.name,
    tags: imported.tags,
    folders: imported.folders,
    libraryName: after.libraryName || before.libraryName,
    itemCount: after.itemCount
  };
}

async function exportManyToEagle(batchId: string, childIds: string[]): Promise<EagleWorkExportResult[]> {
  const origin = "http://localhost/*";
  if (!await browser.permissions.contains({ origins: [origin] })) {
    const granted = await browser.permissions.request({ origins: [origin] });
    if (!granted) throw new Error("需要本机 Eagle API 权限才能导出。");
  }
  const unique = [...new Set(childIds)].slice(0, 10);
  if (!unique.length) throw new Error("请至少选择一个生成结果。");
  const results: EagleWorkExportResult[] = [];
  for (const childId of unique) results.push(await exportWorkToEagle(batchId, childId));
  return results;
}

function safeEagleTag(value: string): string {
  return value.replace(/[\\/]+/g, "-").trim() || "未指定";
}

async function openAnalysis(assetId: string): Promise<void> {
  const asset = await db.assets.get(assetId);
  const dataUrl = asset?.dataUrl || asset?.previewUrl;
  if (!asset || !dataUrl) throw new Error("所选素材不存在或没有可分析的图片数据。");
  await browser.storage.session.set({
    [STORAGE_KEYS.selection]: {
      id: asset.id,
      kind: "upload",
      dataUrl,
      fileName: asset.name
    }
  });
  await browser.storage.session.remove([STORAGE_KEYS.references, STORAGE_KEYS.overview, STORAGE_KEYS.result]);
  await openWorkspace("#legacy");
}

async function openWorkspace(hash = ""): Promise<void> {
  await browser.tabs.create({ url: browser.runtime.getURL(`/workspace.html${hash}`) });
}

async function handleBridgeRequest(raw: unknown): Promise<unknown> {
  assertBridgePayloadSize(raw);
  const request = bridgeRequestSchema.parse(raw);
  bridgeReplayGuard.assertFresh(request);
  const payload = parseBridgePayload(request);
  return redactSensitive(await routeBridgeMethod(request, payload));
}

async function routeBridgeMethod(request: BridgeRequest, payload: unknown): Promise<unknown> {
  switch (request.method) {
    case "handshake":
    case "version.get":
      return { version: LENSFLOW_BRIDGE_VERSION, extensionVersion: browser.runtime.getManifest().version };
    case "snapshot.get":
      return readLiveStudioSnapshot();
    case "task.create":
      return createBatch(payload as Parameters<typeof createBatch>[0]);
    case "task.cancel":
      return cancelBatch((payload as { batchId: string }).batchId);
    case "task.retryFailed":
      return retryBatch((payload as { batchId: string }).batchId);
    case "asset.put": {
      const value = payload as Partial<AssetRecord>;
      if (value.kind === "reference" && value.metadata?.action === "create-reference") {
        const assetId = value.metadata.assetId;
        const referenceKind = value.metadata.referenceKind;
        if (typeof assetId === "string" && ["image", "face", "pose", "palette"].includes(String(referenceKind))) {
          return addReference(assetId, referenceKind as ReferenceKind);
        }
      }
      if (value.kind === "reference" && value.metadata?.action === "toggle-reference") {
        const id = value.metadata.id;
        const enabled = value.metadata.enabled;
        if (typeof id === "string" && typeof enabled === "boolean") return setReferenceEnabled(id, enabled);
      }
      if (value.kind === "prompt" && typeof value.name === "string") {
        const axis = value.metadata?.axis;
        if (["style", "subject", "composition", "color", "motion"].includes(String(axis))) {
          return createKeyword(axis as "style" | "subject" | "composition" | "color" | "motion", value.name);
        }
      }
      if (value.kind === "work" && value.metadata?.action === "save-generated-work") {
        const batchId = value.metadata.batchId;
        const childId = value.metadata.childId;
        if (typeof batchId === "string" && typeof childId === "string") return saveWork(batchId, childId);
      }
      const now = new Date().toISOString();
      const asset = { ...value, id: value.id ?? crypto.randomUUID(), createdAt: value.createdAt ?? now, updatedAt: now } as AssetRecord;
      await db.transaction("rw", [db.assets, db.captures], async () => {
        await db.assets.put(asset);
        if (asset.kind === "capture") {
          const metadata = asset.metadata;
          const measured = (name: string) => {
            const value = metadata[name];
            return value && typeof value === "object" && "value" in value ? (value as { value?: unknown }).value : value;
          };
          await db.captures.put({
            id: asset.id,
            dataUrl: asset.dataUrl,
            width: typeof measured("width") === "number" ? measured("width") as number : undefined,
            height: typeof measured("height") === "number" ? measured("height") as number : undefined,
            sha256: typeof metadata.sha256 === "string" ? metadata.sha256 : undefined,
            createdAt: asset.createdAt
          });
        }
      });
      await notifyChanged();
      return asset;
    }
    case "asset.delete":
      await Promise.all([
        db.assets.delete((payload as { id: string }).id),
        db.prompts.delete((payload as { id: string }).id),
        db.captures.delete((payload as { id: string }).id),
        db.references.delete((payload as { id: string }).id)
      ]);
      await notifyChanged();
      return null;
    case "download": {
      const value = payload as { batchId: string; childId?: string };
      return downloadResults(value.batchId, value.childId);
    }
    case "backup.open":
      return openWorkspace("#backup");
    case "capture.open":
      return openWorkspace("#capture");
    case "provider.open":
      return openWorkspace("#provider");
    case "analysis.open":
      return openAnalysis((payload as { assetId: string }).assetId);
    case "analysis.create":
      return analysisRecordForBridge(await analyzeAsset((payload as { assetId: string; mode: AnalysisMode }).assetId, (payload as { mode: AnalysisMode }).mode));
    case "analysis.get":
      return analysisRecordForBridge(await getAnalysis((payload as { analysisId: string }).analysisId));
    case "analysis.cancel":
      return analysisRecordForBridge(await cancelAnalysis((payload as { analysisId: string }).analysisId));
    case "prompt.save":
      return savePrompt(payload as SavePromptInput);
    case "eagle.export": {
      const value = payload as { batchId: string; childIds: string[] };
      return exportManyToEagle(value.batchId, value.childIds);
    }
    case "task.subscribe":
      return { subscribed: true };
  }
}

async function readLiveStudioSnapshot() {
  const [snapshot, stored] = await Promise.all([
    readStudioSnapshot(db, true, false, browser.runtime.getManifest().version),
    browser.storage.local.get(STORAGE_KEYS.releaseUpdateNotice)
  ]);
  const parsed = releaseUpdateNoticeSchema.safeParse(stored[STORAGE_KEYS.releaseUpdateNotice]);
  return { ...snapshot, updateNotice: parsed.success ? parsed.data : null };
}

async function notifyChanged(): Promise<void> {
  try { await browser.runtime.sendMessage({ type: "LENSFLOW_CHANGED" }); } catch { /* no open extension view */ }
}
