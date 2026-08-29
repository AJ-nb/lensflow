import {
  LENSFLOW_BRIDGE_VERSION,
  assertBridgePayloadSize,
  bridgeRequestSchema,
  parseBridgePayload,
  generationSettingsSchema,
  providerProfileSchema,
  type AssetRecord,
  type BridgeRequest,
  type GenerationBatch,
  type GenerationChild,
  type EagleWorkExportResult,
  type ModelDescriptor,
  type ProviderCapabilities,
  type ProviderProfile,
  type ReferenceKind,
  type StudioReference
} from "@lensflow/contracts";
import {
  LensflowDatabase,
  BridgeReplayGuard,
  ComfyUIAdapter,
  aggregateBatchState,
  createProviderAdapter,
  dataUrlToBlob,
  normalizeReferences,
  readStudioSnapshot,
  redactSensitive,
  recordHistory,
  retryFailedChildren,
  writeSetting
} from "@lensflow/core";
import type { RuntimeRequest } from "../shared/types";
import { ChromeProviderSecretStore } from "./secret-store";

const db = new LensflowDatabase();
const secrets = new ChromeProviderSecretStore();
const bridgeReplayGuard = new BridgeReplayGuard();
const CACHE_TTL = 24 * 60 * 60 * 1000;

export async function handleLensflowRequest(request: RuntimeRequest): Promise<unknown> {
  switch (request.type) {
    case "LENSFLOW_SNAPSHOT":
      return readStudioSnapshot(db);
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
  const cachedValue = cached?.value as { expiresAt?: number; models?: ModelDescriptor[] } | undefined;
  if (!refresh && cachedValue?.expiresAt && cachedValue.expiresAt > Date.now() && Array.isArray(cachedValue.models)) {
    return cachedValue.models;
  }
  const profile = await activeProvider(providerId);
  const secret = profile.kind === "comfyui" ? "" : await providerSecret(providerId);
  const models = await createProviderAdapter(profile).listModels(profile, secret);
  await writeSetting(db, cacheKey, { expiresAt: Date.now() + CACHE_TTL, models });
  return models;
}

async function testProvider(providerId: string): Promise<{ latencyMs: number; modelCount: number }> {
  const profile = await activeProvider(providerId);
  const secret = profile.kind === "comfyui" ? "" : await providerSecret(providerId);
  const result = await createProviderAdapter(profile).testConnection(profile, secret);
  return { latencyMs: result.latencyMs, modelCount: result.models.length };
}

async function probeProvider(providerId: string): Promise<ProviderCapabilities> {
  const profile = await activeProvider(providerId);
  const secret = profile.kind === "comfyui" ? "" : await providerSecret(providerId);
  const result = await createProviderAdapter(profile).probeCapabilities(profile, secret);
  await writeSetting(db, "providerCapabilities", result);
  await notifyChanged();
  return result;
}

async function createKeyword(axis: "style" | "subject" | "composition" | "color" | "motion", text: string) {
  const trimmed = text.trim();
  if (!trimmed) throw new Error("关键词不能为空。");
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

function safeEagleTag(value: string): string {
  return value.replace(/[\\/]+/g, "-").trim() || "未指定";
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
      return readStudioSnapshot(db);
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
    case "task.subscribe":
      return { subscribed: true };
  }
}

async function notifyChanged(): Promise<void> {
  try { await browser.runtime.sendMessage({ type: "LENSFLOW_CHANGED" }); } catch { /* no open extension view */ }
}
