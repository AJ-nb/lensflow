import {
  LENSFLOW_BRIDGE_VERSION,
  UNKNOWN_CAPABILITIES,
  bridgeResponseSchema,
  type AssetRecord,
  type BatchCreateInput,
  type BridgeMethod,
  type GenerationBatch,
  type KeywordCard,
  type ProviderCapabilities,
  type ProviderConnectionResult,
  type ProviderProfile,
  type ReferenceKind,
  type StudioReference,
  type StudioRuntime,
  type StudioSnapshot
} from "@lensflow/contracts";
import { measureImageDataUrl } from "@lensflow/core";

const EMPTY: StudioSnapshot = {
  connectionState: "checking",
  connected: false,
  readOnly: true,
  protocolVersion: LENSFLOW_BRIDGE_VERSION,
  extensionVersion: null,
  connectionMessage: "正在检测本机插件。",
  provider: null,
  capabilities: { ...UNKNOWN_CAPABILITIES },
  keywords: [],
  assets: [],
  references: [],
  batches: [],
  historyEvents: [],
  storage: null
};

class BridgeConnectionError extends Error {
  constructor(
    message: string,
    readonly state: "missing" | "incompatible" | "error",
    readonly extensionVersion: string | null = null
  ) {
    super(message);
  }
}

export class BridgeStudioRuntime implements StudioRuntime {
  private port?: MessagePort;
  private nonce = crypto.randomUUID().replaceAll("-", "");
  private connecting?: Promise<MessagePort>;
  private listeners = new Set<(snapshot: StudioSnapshot) => void>();

  private connect(): Promise<MessagePort> {
    if (this.port) return Promise.resolve(this.port);
    if (this.connecting) return this.connecting;
    this.connecting = new Promise((resolve, reject) => {
      const timer = window.setTimeout(() => {
        window.removeEventListener("message", onBridgeEvent);
        this.connecting = undefined;
        reject(new BridgeConnectionError("未检测到 Lensflow 插件。请安装后重新检测。", "missing"));
      }, 900);
      const onBridgeEvent = (event: MessageEvent) => {
        if (event.source !== window || event.origin !== location.origin || event.data?.nonce !== this.nonce) return;
        if (event.data?.type === "LENSFLOW_BRIDGE_INCOMPATIBLE") {
          window.clearTimeout(timer);
          window.removeEventListener("message", onBridgeEvent);
          this.connecting = undefined;
          reject(new BridgeConnectionError(
            `插件桥接协议不兼容：网页使用 v${LENSFLOW_BRIDGE_VERSION}，当前插件支持 v${String(event.data?.expectedVersion ?? "未知")}。`,
            "incompatible",
            typeof event.data?.extensionVersion === "string" ? event.data.extensionVersion : null
          ));
          return;
        }
        if (event.data?.type !== "LENSFLOW_BRIDGE_CONNECTED" || !event.ports[0]) return;
        window.clearTimeout(timer);
        window.removeEventListener("message", onBridgeEvent);
        this.port = event.ports[0];
        this.port.start();
        this.port.addEventListener("message", (message) => {
          if (message.data?.type === "event" && message.data?.event === "snapshot.changed") void this.emitSnapshot();
        });
        resolve(this.port);
      };
      window.addEventListener("message", onBridgeEvent);
      window.postMessage({ type: "LENSFLOW_BRIDGE_CONNECT", nonce: this.nonce, version: LENSFLOW_BRIDGE_VERSION }, location.origin);
    });
    return this.connecting;
  }

  private async rpc<T>(method: BridgeMethod, payload?: unknown): Promise<T> {
    const port = await this.connect();
    const id = crypto.randomUUID();
    return new Promise<T>((resolve, reject) => {
      const timer = window.setTimeout(() => reject(new Error("插件桥接响应超时。")), 15_000);
      const onMessage = (event: MessageEvent) => {
        const parsed = bridgeResponseSchema.safeParse(event.data);
        if (!parsed.success || parsed.data.id !== id) return;
        window.clearTimeout(timer);
        port.removeEventListener("message", onMessage);
        if (parsed.data.ok) resolve(parsed.data.data as T);
        else reject(new Error(parsed.data.error || "插件桥接请求失败。"));
      };
      port.addEventListener("message", onMessage);
      port.postMessage({ version: LENSFLOW_BRIDGE_VERSION, id, nonce: this.nonce, method, payload, timestamp: Date.now() });
    });
  }

  private async emitSnapshot() {
    const snapshot = await this.load();
    for (const listener of this.listeners) listener(snapshot);
  }

  async load(): Promise<StudioSnapshot> {
    try {
      const snapshot = await this.rpc<StudioSnapshot>("snapshot.get");
      const mobileReadOnly = window.matchMedia("(max-width: 760px)").matches;
      return { ...snapshot, connectionState: "connected", connected: true, readOnly: mobileReadOnly, connectionMessage: mobileReadOnly ? "插件已连接；移动端保持只读。" : "网页与本机插件已连接。" };
    } catch (reason) {
      const state = reason instanceof BridgeConnectionError ? reason.state : "error";
      return {
        ...EMPTY,
        connectionState: state,
        extensionVersion: reason instanceof BridgeConnectionError ? reason.extensionVersion : null,
        connectionMessage: reason instanceof Error ? reason.message : "插件桥接发生未知错误。"
      };
    }
  }

  subscribe(listener: (snapshot: StudioSnapshot) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  async createKeyword(input: Pick<KeywordCard, "axis" | "text">): Promise<KeywordCard> {
    return this.rpc("asset.put", { kind: "prompt", name: input.text, metadata: { axis: input.axis } });
  }

  async deleteKeyword(id: string): Promise<void> { await this.rpc("asset.delete", { id }); }
  async addReference(assetId: string, kind: ReferenceKind): Promise<StudioReference> {
    return this.rpc("asset.put", { kind: "reference", name: "参考资产", metadata: { action: "create-reference", assetId, referenceKind: kind } });
  }
  async setReferenceEnabled(id: string, enabled: boolean): Promise<StudioReference> {
    return this.rpc("asset.put", { kind: "reference", name: "参考资产", metadata: { action: "toggle-reference", id, enabled } });
  }
  async deleteReference(id: string): Promise<void> { await this.rpc("asset.delete", { id }); }
  async saveProvider(_profile: ProviderProfile, _secret?: string): Promise<ProviderProfile> { throw new Error("请在 Lensflow 插件中配置 Provider 和 API Key。"); }
  async listModels(): Promise<never[]> { throw new Error("模型发现只能在插件 Provider 设置中执行。"); }
  async testConnection(): Promise<ProviderConnectionResult> { throw new Error("连接检测只能在插件中执行。"); }
  async probeCapabilities(): Promise<ProviderCapabilities> { throw new Error("能力检测只能在插件中主动执行。"); }
  async createBatch(input: BatchCreateInput): Promise<GenerationBatch> { return this.rpc("task.create", input); }
  async retryFailed(batchId: string): Promise<GenerationBatch> { return this.rpc("task.retryFailed", { batchId }); }
  async cancelBatch(batchId: string): Promise<void> { await this.rpc("task.cancel", { batchId }); }
  async saveWork(batchId: string, childId: string): Promise<AssetRecord> { return this.rpc("asset.put", { kind: "work", name: "生成作品", metadata: { action: "save-generated-work", batchId, childId } }); }
  async download(batchId: string, childId?: string): Promise<void> { await this.rpc("download", { batchId, childId }); }
  async openCapture(): Promise<void> { await this.rpc("capture.open"); }
  async openBackup(): Promise<void> { await this.rpc("backup.open"); }
  async openProviderSettings(): Promise<void> { await this.rpc("provider.open"); }
  async openAnalysis(assetId: string): Promise<void> { await this.rpc("analysis.open", { assetId }); }
  async importCapture(input: { name: string; dataUrl: string; mimeType: string; size: number }): Promise<AssetRecord> {
    if (input.size > 1_400_000) throw new Error("网页桥接单次图片限制为 1.4 MB。请在插件工作台上传较大的原图。");
    const measured = await measureImageDataUrl(input.dataUrl);
    const now = new Date().toISOString();
    return this.rpc("asset.put", {
      kind: "capture",
      name: input.name,
      dataUrl: input.dataUrl,
      metadata: {
        mimeType: input.mimeType,
        byteSize: input.size,
        width: measured.width,
        height: measured.height,
        aspectRatio: measured.aspectRatio,
        sha256: measured.sha256.value,
        palette: measured.palette
      },
      createdAt: now,
      updatedAt: now
    });
  }
}
