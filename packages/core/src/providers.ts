import {
  modelDescriptorSchema,
  UNKNOWN_CAPABILITIES,
  type AnalyzeInput,
  type AnalyzeResult,
  type EditInput,
  type GenerateInput,
  type ModelDescriptor,
  type ProviderAdapter,
  type ProviderCapabilities,
  type ProviderConnectionResult,
  type ProviderImage,
  type ProviderProfile,
  type ProviderTaskResult
} from "@lensflow/contracts";
import { endpointUrl } from "./base-url";

const PROBE_PNG_BASE64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl2VQAAAABJRU5ErkJggg==";
const PROBE_PNG_DATA_URL = `data:image/png;base64,${PROBE_PNG_BASE64}`;
export const MODEL_CATALOG_CACHE_TTL_MS = 24 * 60 * 60 * 1000;

export interface ModelCatalogCache {
  cachedAt?: number;
  expiresAt?: number;
  models?: ModelDescriptor[];
}

export function isModelCatalogCacheFresh(value: ModelCatalogCache | undefined, now = Date.now()): value is Required<ModelCatalogCache> {
  return Boolean(value?.cachedAt && value.expiresAt && value.cachedAt <= now && value.expiresAt > now && Array.isArray(value.models));
}

export class ProviderHttpError extends Error {
  constructor(message: string, readonly status: number, readonly body?: unknown) {
    super(message);
    this.name = "ProviderHttpError";
  }
}

function headers(secret: string, json = true): HeadersInit {
  return {
    Authorization: `Bearer ${secret}`,
    ...(json ? { "Content-Type": "application/json" } : {})
  };
}

async function parseResponse(response: Response): Promise<unknown> {
  const type = response.headers.get("content-type") ?? "";
  const body = type.includes("json") ? await response.json() : await response.text();
  if (!response.ok) {
    const detail = body && typeof body === "object" && "error" in body
      ? JSON.stringify((body as { error: unknown }).error)
      : String(body || response.statusText);
    throw new ProviderHttpError(`Provider 请求失败 (${response.status})：${detail}`, response.status, body);
  }
  return body;
}

function extractImages(body: unknown): ProviderImage[] {
  if (!body || typeof body !== "object") return [];
  const value = body as Record<string, unknown>;
  const nested = value.result && typeof value.result === "object" ? value.result as Record<string, unknown> : value;
  const data = [nested.data, nested.images, nested.output].find(Array.isArray);
  if (!Array.isArray(data)) return [];
  return data.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const value = item as { b64_json?: unknown; url?: unknown; revised_prompt?: unknown };
    const dataUrl = typeof value.b64_json === "string" ? `data:image/png;base64,${value.b64_json}` : undefined;
    const url = typeof value.url === "string" ? value.url : undefined;
    if (!dataUrl && !url) return [];
    return [{ dataUrl, url, revisedPrompt: typeof value.revised_prompt === "string" ? value.revised_prompt : undefined }];
  });
}

export function extractModelModalities(value: Record<string, unknown>): ModelDescriptor["modalities"] {
  const known = new Set<ModelDescriptor["modalities"][number]>();
  const add = (candidate: unknown) => {
    if (typeof candidate !== "string") return;
    const normalized = candidate.toLowerCase();
    if (["text", "image", "video", "audio"].includes(normalized)) known.add(normalized as ModelDescriptor["modalities"][number]);
  };
  for (const field of [value.modalities, value.input_modalities, value.output_modalities]) {
    if (Array.isArray(field)) field.forEach(add);
    else add(field);
  }
  const capabilities = value.capabilities;
  if (capabilities && typeof capabilities === "object") {
    const flags = capabilities as Record<string, unknown>;
    if (flags.vision === true || flags.image_input === true) known.add("image");
    if (flags.text === true || flags.chat === true || flags.responses === true) known.add("text");
    if (flags.video === true) known.add("video");
    if (flags.audio === true || flags.transcription === true) known.add("audio");
  }
  return [...known];
}

function parseJson(text: string): unknown {
  try { return JSON.parse(text); } catch { return undefined; }
}

async function probeStatus(action: () => Promise<unknown>): Promise<ProviderCapabilities[keyof ProviderCapabilities]> {
  try {
    await action();
    return "supported";
  } catch (error) {
    return error instanceof ProviderHttpError && error.status === 404 ? "unsupported" : "error";
  }
}

function probePngBlob(): Blob {
  const bytes = Uint8Array.from(atob(PROBE_PNG_BASE64), (character) => character.charCodeAt(0));
  return new Blob([bytes], { type: "image/png" });
}

export class OpenAICompatibleAdapter implements ProviderAdapter {
  capabilities(_profile: ProviderProfile): ProviderCapabilities {
    return { ...UNKNOWN_CAPABILITIES };
  }

  async listModels(profile: ProviderProfile, secret: string, signal?: AbortSignal): Promise<ModelDescriptor[]> {
    const response = await fetch(endpointUrl(profile.baseUrl, "models"), { headers: headers(secret), signal });
    const body = await parseResponse(response);
    const raw = body && typeof body === "object" && Array.isArray((body as { data?: unknown }).data)
      ? (body as { data: unknown[] }).data
      : [];
    return raw.flatMap((item) => {
      if (!item || typeof item !== "object") return [];
      const value = item as Record<string, unknown>;
      const parsed = modelDescriptorSchema.safeParse({
        id: value.id,
        ownedBy: value.owned_by,
        created: value.created,
        modalities: extractModelModalities(value),
        raw: value
      });
      return parsed.success ? [parsed.data] : [];
    });
  }

  async testConnection(profile: ProviderProfile, secret: string, signal?: AbortSignal): Promise<ProviderConnectionResult> {
    const started = performance.now();
    const models = await this.listModels(profile, secret, signal);
    return {
      reachable: true,
      endpoint: endpointUrl(profile.baseUrl, "models"),
      latencyMs: Math.round(performance.now() - started),
      models,
      warnings: models.length ? [] : ["端点已响应，但当前令牌没有返回模型。"]
    };
  }

  async probeCapabilities(profile: ProviderProfile, secret: string, signal?: AbortSignal): Promise<ProviderCapabilities> {
    const result = { ...this.capabilities(profile) };
    try {
      await this.listModels(profile, secret, signal);
      result.authentication = "supported";
    } catch {
      return { ...result, authentication: "error" };
    }

    if (profile.analysisModel) {
      result.visionInput = await probeStatus(async () => {
        await this.analyze(profile, secret, {
          prompt: "Reply with the single word OK after inspecting this image.",
          imageDataUrl: PROBE_PNG_DATA_URL,
          signal
        });
      });
      result.structuredOutputs = await probeStatus(async () => {
        await this.analyze(profile, secret, {
          prompt: "Return JSON with ok set to true.",
          schema: {
            type: "object",
            properties: { ok: { type: "boolean" } },
            required: ["ok"],
            additionalProperties: false
          },
          signal
        });
      });
    }

    if (profile.imageModel) {
      let generated: ProviderTaskResult | undefined;
      result.imageGeneration = await probeStatus(async () => {
        generated = await this.generate(profile, secret, {
          prompt: "A plain white square on a black background. Capability probe.",
          model: profile.imageModel,
          size: "1024x1024",
          quality: "low",
          count: 1,
          async: result.backgroundTasks === "supported",
          signal
        });
        if (generated.state === "failed") throw new Error(generated.error || "图片生成探测失败。");
      });
      if (result.backgroundTasks !== "unsupported" && generated) {
        result.backgroundTasks = generated.remoteId && generated.state !== "succeeded" ? "supported" : result.backgroundTasks;
      }
      result.imageEditing = await probeStatus(async () => {
        const edited = await this.edit(profile, secret, {
          prompt: "Keep the image unchanged. Capability probe.",
          model: profile.imageModel,
          size: "1024x1024",
          quality: "low",
          image: probePngBlob(),
          async: result.backgroundTasks === "supported",
          signal
        });
        if (edited.state === "failed") throw new Error(edited.error || "图片编辑探测失败。");
      });
    }
    return result;
  }

  async analyze(profile: ProviderProfile, secret: string, input: AnalyzeInput): Promise<AnalyzeResult> {
    const model = profile.analysisModel;
    if (!model) throw new Error("请先选择分析模型。");
    if (profile.protocolMode === "responses") {
      const content: Array<Record<string, unknown>> = [{ type: "input_text", text: input.prompt }];
      if (input.imageDataUrl) content.push({ type: "input_image", image_url: input.imageDataUrl });
      const response = await fetch(endpointUrl(profile.baseUrl, "responses"), {
        method: "POST",
        headers: headers(secret),
        signal: input.signal,
        body: JSON.stringify({
          model,
          input: [{ role: "user", content }],
          ...(input.schema ? { text: { format: { type: "json_schema", name: "lensflow_analysis", strict: true, schema: input.schema } } } : {})
        })
      });
      const body = await parseResponse(response) as { output_text?: unknown; output?: unknown };
      const text = typeof body.output_text === "string" ? body.output_text : "";
      return { text, structured: input.schema ? parseJson(text) : undefined, model, raw: body.output };
    }
    const messageContent: Array<Record<string, unknown>> = [{ type: "text", text: input.prompt }];
    if (input.imageDataUrl) messageContent.push({ type: "image_url", image_url: { url: input.imageDataUrl } });
    const response = await fetch(endpointUrl(profile.baseUrl, "chat/completions"), {
      method: "POST",
      headers: headers(secret),
      signal: input.signal,
      body: JSON.stringify({
        model,
        messages: [{ role: "user", content: messageContent }],
        ...(input.schema ? { response_format: { type: "json_schema", json_schema: { name: "lensflow_analysis", strict: true, schema: input.schema } } } : {})
      })
    });
    const body = await parseResponse(response) as { choices?: Array<{ message?: { content?: unknown } }> };
    const text = body.choices?.[0]?.message?.content;
    const output = typeof text === "string" ? text : "";
    return { text: output, structured: input.schema ? parseJson(output) : undefined, model, raw: body };
  }

  async generate(profile: ProviderProfile, secret: string, input: GenerateInput): Promise<ProviderTaskResult> {
    const response = await fetch(endpointUrl(profile.baseUrl, "images/generations"), {
      method: "POST",
      headers: headers(secret),
      signal: input.signal,
      body: JSON.stringify({ model: input.model, prompt: input.prompt, n: input.count, size: input.size, quality: input.quality })
    });
    const body = await parseResponse(response);
    const images = extractImages(body);
    return { state: images.length ? "succeeded" : "failed", images, error: images.length ? undefined : "Provider 未返回图片。", raw: body };
  }

  async edit(profile: ProviderProfile, secret: string, input: EditInput): Promise<ProviderTaskResult> {
    const form = new FormData();
    form.set("model", input.model);
    form.set("prompt", input.prompt);
    appendEditImages(form, input);
    form.set("size", input.size);
    form.set("quality", input.quality);
    if (input.mask) form.set("mask", input.mask, "mask.png");
    const response = await fetch(endpointUrl(profile.baseUrl, "images/edits"), {
      method: "POST",
      headers: headers(secret, false),
      signal: input.signal,
      body: form
    });
    const body = await parseResponse(response);
    const images = extractImages(body);
    return { state: images.length ? "succeeded" : "failed", images, error: images.length ? undefined : "Provider 未返回图片。", raw: body };
  }

  async retrieve(
    _profile: ProviderProfile,
    _secret: string,
    _remoteId: string,
    _signal?: AbortSignal
  ): Promise<ProviderTaskResult> {
    return { state: "failed", images: [], error: "当前 Provider 不支持后台任务查询。" };
  }

  async cancel(
    _profile: ProviderProfile,
    _secret: string,
    _remoteId: string,
    _signal?: AbortSignal
  ): Promise<boolean> {
    return false;
  }
}

export class BiyuanAdapter extends OpenAICompatibleAdapter {
  override capabilities(): ProviderCapabilities {
    return {
      authentication: "unknown",
      visionInput: "unknown",
      structuredOutputs: "unknown",
      imageGeneration: "supported",
      imageEditing: "supported",
      backgroundTasks: "supported",
      cancellation: "unsupported"
    };
  }

  override async generate(profile: ProviderProfile, secret: string, input: GenerateInput): Promise<ProviderTaskResult> {
    if (!input.async) return super.generate(profile, secret, input);
    const response = await fetch(endpointUrl(profile.baseUrl, "images/generations/async"), {
      method: "POST",
      headers: headers(secret),
      signal: input.signal,
      body: JSON.stringify({ model: input.model, prompt: input.prompt, n: input.count, size: input.size, quality: input.quality })
    });
    return parseAsyncTask(await parseResponse(response));
  }

  override async edit(profile: ProviderProfile, secret: string, input: EditInput): Promise<ProviderTaskResult> {
    if (!input.async) return super.edit(profile, secret, input);
    const form = new FormData();
    form.set("model", input.model);
    form.set("prompt", input.prompt);
    appendEditImages(form, input);
    form.set("size", input.size);
    form.set("quality", input.quality);
    if (input.mask) form.set("mask", input.mask, "mask.png");
    const response = await fetch(endpointUrl(profile.baseUrl, "images/edits/async"), {
      method: "POST",
      headers: headers(secret, false),
      signal: input.signal,
      body: form
    });
    return parseAsyncTask(await parseResponse(response));
  }

  override async retrieve(profile: ProviderProfile, secret: string, remoteId: string, signal?: AbortSignal): Promise<ProviderTaskResult> {
    const response = await fetch(endpointUrl(profile.baseUrl, `images/tasks/${encodeURIComponent(remoteId)}`), {
      headers: headers(secret),
      signal
    });
    const body = await parseResponse(response);
    return parseAsyncTask(body, remoteId);
  }
}

function parseAsyncTask(body: unknown, fallbackId?: string): ProviderTaskResult {
  const value = body && typeof body === "object" ? body as Record<string, unknown> : {};
  const nested = value.data && typeof value.data === "object" ? value.data as Record<string, unknown> : value;
  const remoteId = [nested.task_id, nested.id, fallbackId].find((item): item is string => typeof item === "string");
  const status = String(nested.status ?? nested.state ?? "queued").toLowerCase();
  const state = status.includes("success") || status.includes("complete") ? "succeeded"
    : status.includes("fail") || status.includes("error") ? "failed"
      : status.includes("run") || status.includes("process") ? "running" : "queued";
  const images = extractImages(nested);
  return { remoteId, state, images, error: typeof nested.error === "string" ? nested.error : undefined, raw: body };
}

function appendEditImages(form: FormData, input: EditInput) {
  const images = [{ kind: "image" as const, image: input.image }, ...(input.additionalImages ?? [])];
  if (images.length === 1) {
    form.set("image", input.image, "image.png");
    return;
  }
  images.forEach((item, index) => form.append("image[]", item.image, `${String(index + 1).padStart(2, "0")}-${item.kind}.png`));
}

export class ComfyUIAdapter implements ProviderAdapter {
  capabilities(): ProviderCapabilities {
    return {
      authentication: "supported",
      visionInput: "unknown",
      structuredOutputs: "unsupported",
      imageGeneration: "supported",
      imageEditing: "unknown",
      backgroundTasks: "supported",
      cancellation: "supported"
    };
  }

  async listModels(profile: ProviderProfile, _secret: string, signal?: AbortSignal): Promise<ModelDescriptor[]> {
    const response = await fetch(endpointUrl(profile.baseUrl, "object_info"), { signal });
    const body = await parseResponse(response);
    const loaders = body && typeof body === "object" ? Object.entries(body as Record<string, unknown>) : [];
    const names = new Set<string>();
    for (const [, raw] of loaders) {
      const inputs = raw && typeof raw === "object" ? (raw as { input?: { required?: Record<string, unknown> } }).input?.required : undefined;
      const checkpoint = inputs?.ckpt_name;
      if (Array.isArray(checkpoint) && Array.isArray(checkpoint[0])) {
        for (const name of checkpoint[0]) if (typeof name === "string") names.add(name);
      }
    }
    return [...names].map((id) => ({ id, modalities: ["image"] as const }));
  }

  async testConnection(profile: ProviderProfile, secret: string, signal?: AbortSignal): Promise<ProviderConnectionResult> {
    const started = performance.now();
    const models = await this.listModels(profile, secret, signal);
    return { reachable: true, endpoint: endpointUrl(profile.baseUrl, "object_info"), latencyMs: Math.round(performance.now() - started), models, warnings: [] };
  }

  async probeCapabilities(profile: ProviderProfile, secret: string, signal?: AbortSignal): Promise<ProviderCapabilities> {
    await this.listModels(profile, secret, signal);
    return this.capabilities();
  }

  async analyze(): Promise<AnalyzeResult> {
    throw new Error("ComfyUI 适配器不提供文本分析。");
  }

  async generate(profile: ProviderProfile, _secret: string, input: GenerateInput): Promise<ProviderTaskResult> {
    if (!profile.comfyWorkflow) throw new Error("请先导入 ComfyUI API-workflow JSON。");
    const workflow = replacePrompt(profile.comfyWorkflow, input.prompt);
    const clientId = crypto.randomUUID();
    const response = await fetch(endpointUrl(profile.baseUrl, "prompt"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: input.signal,
      body: JSON.stringify({ prompt: workflow, client_id: clientId })
    });
    const body = await parseResponse(response) as { prompt_id?: unknown };
    return { remoteId: typeof body.prompt_id === "string" ? body.prompt_id : undefined, remoteClientId: clientId, state: "queued", images: [], raw: body };
  }

  async edit(profile: ProviderProfile, secret: string, input: EditInput): Promise<ProviderTaskResult> {
    return this.generate(profile, secret, { ...input, count: 1 });
  }

  async retrieve(profile: ProviderProfile, _secret: string, remoteId: string, signal?: AbortSignal): Promise<ProviderTaskResult> {
    const response = await fetch(endpointUrl(profile.baseUrl, `history/${encodeURIComponent(remoteId)}`), { signal });
    const body = await parseResponse(response) as Record<string, unknown>;
    const task = body[remoteId];
    if (!task || typeof task !== "object") return { remoteId, state: "running", images: [], raw: body };
    const outputs = (task as { outputs?: Record<string, { images?: Array<Record<string, unknown>> }> }).outputs ?? {};
    const images = Object.values(outputs).flatMap((output) => output.images ?? []).flatMap((image) => {
      if (typeof image.filename !== "string") return [];
      const url = new URL(endpointUrl(profile.baseUrl, "view"));
      url.searchParams.set("filename", image.filename);
      if (typeof image.subfolder === "string") url.searchParams.set("subfolder", image.subfolder);
      if (typeof image.type === "string") url.searchParams.set("type", image.type);
      return [{ url: url.toString() }];
    });
    return { remoteId, state: images.length ? "succeeded" : "running", images, raw: task };
  }

  async cancel(profile: ProviderProfile, _secret: string, _remoteId: string, signal?: AbortSignal): Promise<boolean> {
    const response = await fetch(endpointUrl(profile.baseUrl, "interrupt"), { method: "POST", signal });
    await parseResponse(response);
    return true;
  }

  watchTask(
    profile: ProviderProfile,
    remoteId: string,
    clientId: string,
    onProgress: (progress: number) => void,
    signal?: AbortSignal
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      const socket = new WebSocket(comfyWebSocketUrl(profile.baseUrl, clientId));
      let completed = false;
      const finish = (error?: Error) => {
        if (completed) return;
        completed = true;
        clearTimeout(timeout);
        signal?.removeEventListener("abort", onAbort);
        socket.close();
        if (error) reject(error); else resolve();
      };
      const timeout = setTimeout(() => finish(new Error("ComfyUI WebSocket 等待超时。")), 30 * 60 * 1000);
      const onAbort = () => finish(new DOMException("Aborted", "AbortError"));
      signal?.addEventListener("abort", onAbort, { once: true });
      socket.addEventListener("message", (event) => {
        try {
          const message = JSON.parse(String(event.data)) as { type?: string; data?: Record<string, unknown> };
          const data = message.data ?? {};
          if (typeof data.prompt_id === "string" && data.prompt_id !== remoteId) return;
          if (message.type === "progress" && typeof data.value === "number" && typeof data.max === "number" && data.max > 0) onProgress(Math.max(0, Math.min(1, data.value / data.max)));
          if (message.type === "execution_error") finish(new Error(typeof data.exception_message === "string" ? data.exception_message : "ComfyUI 执行失败。"));
          if (message.type === "executing" && data.node === null && data.prompt_id === remoteId) finish();
        } catch {
          // ComfyUI also emits binary preview frames.
        }
      });
      socket.addEventListener("error", () => finish(new Error("ComfyUI WebSocket 连接失败。")));
      socket.addEventListener("close", () => { if (!completed) finish(new Error("ComfyUI WebSocket 提前关闭。")); });
    });
  }
}

export function comfyWebSocketUrl(baseUrl: string, clientId: string): string {
  const url = new URL(endpointUrl(baseUrl, "ws"));
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  url.searchParams.set("clientId", clientId);
  return url.toString();
}

function replacePrompt(workflow: Record<string, unknown>, prompt: string): Record<string, unknown> {
  return JSON.parse(JSON.stringify(workflow).replaceAll("{{LENSFLOW_PROMPT}}", prompt)) as Record<string, unknown>;
}

export function createProviderAdapter(profile: ProviderProfile): ProviderAdapter {
  if (profile.kind === "biyuan") return new BiyuanAdapter();
  if (profile.kind === "comfyui") return new ComfyUIAdapter();
  return new OpenAICompatibleAdapter();
}
