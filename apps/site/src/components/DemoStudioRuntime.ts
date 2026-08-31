import {
  LENSFLOW_BRIDGE_VERSION,
  type AnalysisMode,
  type AnalysisRecord,
  type AssetRecord,
  type BatchCreateInput,
  type BatchSelection,
  type GenerationBatch,
  type KeywordCard,
  type ModelDescriptor,
  type ProviderCapabilities,
  type ProviderConnectionResult,
  type ProviderProfile,
  type ReferenceKind,
  type SavePromptInput,
  type SavedPrompt,
  type StudioReference,
  type StudioRuntime,
  type StudioSnapshot
} from "@lensflow/contracts";

const CREATED_AT = "2026-08-31T00:00:00.000Z";
const pair = {
  positive: { zh: "原创拱形桌灯，暖白磨砂金属，珊瑚色灯环，灰色摄影棚背景，柔和侧光，克制的编辑产品摄影", en: "original arched desk lamp, warm white matte metal, coral light ring, gray studio backdrop, soft side light, restrained editorial product photography" },
  negative: { zh: "品牌标识，文字，水印，人物，过度反光，裁切产品", en: "brand mark, text, watermark, people, excessive reflections, cropped product" }
};

export function createDemoStudioSnapshot(imageUrl: string): { snapshot: StudioSnapshot; analysis: AnalysisRecord } {
  const asset: AssetRecord = {
    id: "demo-arc-lamp",
    kind: "capture",
    name: "原创拱形桌灯.webp",
    previewUrl: imageUrl,
    metadata: {
      width: { value: 960, source: "measured" },
      height: { value: 640, source: "measured" },
      aspectRatio: { value: "3:2", source: "measured" },
      palette: { value: [{ hex: "#ece8df", proportion: 0.48 }, { hex: "#a9aaa8", proportion: 0.31 }, { hex: "#d8765b", proportion: 0.12 }, { hex: "#536b58", proportion: 0.09 }], source: "measured" }
    },
    createdAt: CREATED_AT,
    updatedAt: CREATED_AT
  };
  const analysis: AnalysisRecord = {
    id: "demo-analysis",
    assetId: asset.id,
    captureId: asset.id,
    mode: "quick",
    state: "ready",
    providerId: "demo-provider",
    model: "预计算示例",
    result: {
      schemaVersion: "2.0",
      classification: { kind: "product", confidence: 0.98, reason: "画面呈现单一、完整的桌面照明产品" },
      summary: { value: "带珊瑚色灯环与绿色旋钮的拱形桌灯", source: "observed", confidence: 0.98 },
      subject: { value: "虚构桌面照明产品", source: "observed", confidence: 0.98 },
      formStructure: [
        { value: "连续拱形主支架", source: "observed", confidence: 0.97 },
        { value: "水平圆盘灯头", source: "observed", confidence: 0.96 },
        { value: "窄幅侧置调节槽", source: "observed", confidence: 0.9 }
      ],
      cmf: {
        color: [{ value: "暖白主体、珊瑚灯环、墨绿旋钮", source: "observed", confidence: 0.96 }],
        material: [{ value: "主体可能为粉末涂层金属", source: "inferred", confidence: 0.72 }],
        finish: [{ value: "低光泽细砂纹表面", source: "observed", confidence: 0.86 }]
      },
      composition: { value: "产品略偏左，右侧留有大面积负空间", source: "observed", confidence: 0.95 },
      camera: { value: "接近平视的三分之四侧视角", source: "inferred", confidence: 0.8 },
      lighting: { value: "左上方柔和自然光与克制阴影", source: "observed", confidence: 0.94 },
      style: { value: "安静、精确的编辑产品摄影", source: "inferred", confidence: 0.88 },
      visibleText: [],
      evidenceBoundary: { observed: ["轮廓", "可见配色", "构图", "表面光泽"], inferred: ["金属材质", "拍摄视角"], unknown: ["内部结构", "真实尺寸", "电气参数"] },
      prompts: pair,
      variants: [
        { kind: "faithful", label: "忠实复现", prompts: pair },
        { kind: "commercial", label: "商业呈现", prompts: { positive: { zh: `${pair.positive.zh}，电商主视觉`, en: `${pair.positive.en}, ecommerce key visual` }, negative: pair.negative } },
        { kind: "exploratory", label: "概念变化", prompts: { positive: { zh: `${pair.positive.zh}，未来感家居场景`, en: `${pair.positive.en}, futuristic home interior` }, negative: pair.negative } }
      ],
      axisSuggestions: { style: ["编辑产品摄影"], subject: ["拱形桌灯"], composition: ["左置留白"], color: ["暖白与珊瑚"], motion: ["静态陈列"] },
      measurements: {
        width: { value: 960, source: "measured" },
        height: { value: 640, source: "measured" },
        aspectRatio: { value: "3:2", source: "measured" },
        orientation: { value: "landscape", source: "measured" },
        palette: { value: [{ hex: "#ece8df", proportion: 0.48 }, { hex: "#a9aaa8", proportion: 0.31 }, { hex: "#d8765b", proportion: 0.12 }, { hex: "#536b58", proportion: 0.09 }], source: "measured" }
      },
      createdAt: CREATED_AT
    },
    createdAt: CREATED_AT,
    updatedAt: CREATED_AT
  };
  const keywords: KeywordCard[] = [
    ["style", "编辑产品摄影"], ["subject", "拱形桌灯"], ["composition", "左置留白"], ["color", "暖白与珊瑚"], ["motion", "静态陈列"]
  ].map(([axis, text], index) => ({ id: `demo-keyword-${index}`, axis: axis as KeywordCard["axis"], text, locked: false, createdAt: CREATED_AT }));
  const batch: GenerationBatch = {
    id: "demo-batch",
    providerId: "demo-provider",
    prompt: pair.positive.zh,
    settings: { model: "离线预计算", size: "1024x1024", quality: "medium", count: 1, concurrency: 1 },
    referenceIds: [],
    state: "ready",
    children: [{ id: "demo-result", batchId: "demo-batch", index: 0, state: "ready", imageUrl, attempt: 0, updatedAt: CREATED_AT }],
    createdAt: CREATED_AT,
    updatedAt: CREATED_AT
  };
  return {
    analysis,
    snapshot: {
      connectionState: "connected",
      connected: false,
      readOnly: true,
      demoMode: true,
      protocolVersion: LENSFLOW_BRIDGE_VERSION,
      extensionVersion: null,
      connectionMessage: "离线示例已加载；不会连接插件或 Provider。",
      provider: { id: "demo-provider", name: "离线预计算", kind: "openai-compatible", baseUrl: "https://demo.invalid/v1", protocolMode: "responses", analysisModel: "预计算示例", imageModel: "离线预计算", rememberSecret: false, createdAt: CREATED_AT, updatedAt: CREATED_AT },
      capabilities: { authentication: "unsupported", visionInput: "supported", structuredOutputs: "supported", imageGeneration: "unsupported", imageEditing: "unsupported", backgroundTasks: "unsupported", cancellation: "unsupported" },
      keywords,
      analyses: [{ id: analysis.id, assetId: asset.id, mode: analysis.mode, state: analysis.state, providerId: analysis.providerId, model: analysis.model, contentKind: "product", summary: analysis.result?.summary.value ?? undefined, promptZh: pair.positive.zh, promptEn: pair.positive.en, createdAt: CREATED_AT, updatedAt: CREATED_AT }],
      prompts: [],
      assets: [asset],
      references: [],
      batches: [batch],
      historyEvents: [],
      storage: null
    }
  };
}

export class DemoStudioRuntime implements StudioRuntime {
  private readonly data;

  constructor(private readonly imageUrl: string) {
    this.data = createDemoStudioSnapshot(imageUrl);
  }

  async load() { return structuredClone(this.data.snapshot); }
  subscribe() { return () => undefined; }
  async getAnalysis() { return structuredClone(this.data.analysis); }
  async download() { this.downloadImage(); }
  async downloadMany(_selection: BatchSelection) { this.downloadImage(); }
  async createKeyword(_input: Pick<KeywordCard, "axis" | "text">) { return this.readOnly(); }
  async deleteKeyword(_id: string) { return this.readOnly(); }
  async addReference(_assetId: string, _kind: ReferenceKind): Promise<StudioReference> { return this.readOnly(); }
  async saveProvider(_profile: ProviderProfile, _secret?: string) { return this.readOnly(); }
  async listModels(_providerId: string, _refresh?: boolean): Promise<ModelDescriptor[]> { return this.readOnly(); }
  async testConnection(_providerId: string): Promise<ProviderConnectionResult> { return this.readOnly(); }
  async probeCapabilities(_providerId: string): Promise<ProviderCapabilities> { return this.readOnly(); }
  async createBatch(_input: BatchCreateInput) { return this.readOnly(); }
  async retryFailed(_batchId: string) { return this.readOnly(); }
  async cancelBatch(_batchId: string) { return this.readOnly(); }
  async saveWork(_batchId: string, _childId: string) { return this.readOnly(); }
  async openCapture() { return this.readOnly(); }
  async openBackup() { return this.readOnly(); }
  async openProviderSettings() { return this.readOnly(); }
  async openAnalysis(_assetId: string) { return this.readOnly(); }
  async analyzeAsset(_assetId: string, _mode: AnalysisMode) { return this.readOnly(); }
  async cancelAnalysis(_id: string) { return this.readOnly(); }
  async savePrompt(_input: SavePromptInput): Promise<SavedPrompt> { return this.readOnly(); }

  private readOnly(): never {
    throw new Error("离线示例为只读，不会写入资产或调用 Provider。");
  }

  private downloadImage() {
    const anchor = document.createElement("a");
    anchor.href = this.imageUrl;
    anchor.download = "lensflow-demo-arc-lamp.webp";
    anchor.click();
  }
}
