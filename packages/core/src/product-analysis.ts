import {
  AXIS_ORDER,
  productAnalysisModelOutputSchema,
  productAnalysisResultSchema,
  type AssetRecord,
  type LocalAnalysisMeasurements,
  type ProviderAdapter,
  type ProviderProfile,
  type ProductAnalysisModelOutput,
  type ProductAnalysisResult
} from "@lensflow/contracts";

const deepFormOutputSchema = productAnalysisModelOutputSchema.pick({
  classification: true,
  summary: true,
  subject: true,
  formStructure: true,
  evidenceBoundary: true
});

const deepCmfOutputSchema = productAnalysisModelOutputSchema.pick({
  cmf: true,
  visibleText: true
});

const deepPresentationOutputSchema = productAnalysisModelOutputSchema.pick({
  composition: true,
  camera: true,
  lighting: true,
  style: true,
  prompts: true,
  variants: true,
  axisSuggestions: true
});

export const QUICK_ANALYSIS_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["classification", "summary", "subject", "formStructure", "cmf", "composition", "camera", "lighting", "style", "visibleText", "evidenceBoundary", "prompts", "variants", "axisSuggestions"],
  properties: {
    classification: { type: "object", additionalProperties: false, required: ["kind", "confidence", "reason"], properties: { kind: { enum: ["product", "person", "scene", "graphic", "other"] }, confidence: { type: "number", minimum: 0, maximum: 1 }, reason: { type: "string" } } },
    summary: evidenceSchema(), subject: evidenceSchema(),
    formStructure: { type: "array", items: evidenceSchema() },
    cmf: { type: "object", additionalProperties: false, required: ["color", "material", "finish"], properties: { color: { type: "array", items: evidenceSchema() }, material: { type: "array", items: evidenceSchema() }, finish: { type: "array", items: evidenceSchema() } } },
    composition: evidenceSchema(), camera: evidenceSchema(), lighting: evidenceSchema(), style: evidenceSchema(),
    visibleText: { type: "array", items: evidenceSchema() },
    evidenceBoundary: { type: "object", additionalProperties: false, required: ["observed", "inferred", "unknown"], properties: { observed: stringArraySchema(), inferred: stringArraySchema(), unknown: stringArraySchema() } },
    prompts: promptPairSchema(),
    variants: { type: "array", minItems: 3, maxItems: 3, items: { type: "object", additionalProperties: false, required: ["kind", "label", "prompts"], properties: { kind: { enum: ["faithful", "commercial", "exploratory"] }, label: { type: "string" }, prompts: promptPairSchema() } } },
    axisSuggestions: { type: "object", additionalProperties: false, required: [...AXIS_ORDER], properties: Object.fromEntries(AXIS_ORDER.map((axis) => [axis, stringArraySchema()])) }
  }
} as const;

export const DEEP_ANALYSIS_JSON_SCHEMAS = {
  form: {
    type: "object",
    additionalProperties: false,
    required: ["classification", "summary", "subject", "formStructure", "evidenceBoundary"],
    properties: {
      classification: QUICK_ANALYSIS_JSON_SCHEMA.properties.classification,
      summary: QUICK_ANALYSIS_JSON_SCHEMA.properties.summary,
      subject: QUICK_ANALYSIS_JSON_SCHEMA.properties.subject,
      formStructure: QUICK_ANALYSIS_JSON_SCHEMA.properties.formStructure,
      evidenceBoundary: QUICK_ANALYSIS_JSON_SCHEMA.properties.evidenceBoundary
    }
  },
  cmf: {
    type: "object",
    additionalProperties: false,
    required: ["cmf", "visibleText"],
    properties: {
      cmf: QUICK_ANALYSIS_JSON_SCHEMA.properties.cmf,
      visibleText: QUICK_ANALYSIS_JSON_SCHEMA.properties.visibleText
    }
  },
  presentation: {
    type: "object",
    additionalProperties: false,
    required: ["composition", "camera", "lighting", "style", "prompts", "variants", "axisSuggestions"],
    properties: {
      composition: QUICK_ANALYSIS_JSON_SCHEMA.properties.composition,
      camera: QUICK_ANALYSIS_JSON_SCHEMA.properties.camera,
      lighting: QUICK_ANALYSIS_JSON_SCHEMA.properties.lighting,
      style: QUICK_ANALYSIS_JSON_SCHEMA.properties.style,
      prompts: QUICK_ANALYSIS_JSON_SCHEMA.properties.prompts,
      variants: QUICK_ANALYSIS_JSON_SCHEMA.properties.variants,
      axisSuggestions: QUICK_ANALYSIS_JSON_SCHEMA.properties.axisSuggestions
    }
  }
} as const;

function evidenceSchema() {
  return { type: "object", additionalProperties: false, required: ["value", "source"], properties: { value: { type: ["string", "null"] }, source: { enum: ["observed", "inferred", "unknown"] }, confidence: { type: "number", minimum: 0, maximum: 1 }, note: { type: "string" } } } as const;
}

function stringArraySchema() { return { type: "array", items: { type: "string" } } as const; }
function promptPairSchema() { return { type: "object", additionalProperties: false, required: ["positive", "negative"], properties: { positive: languagePairSchema(), negative: languagePairSchema() } } as const; }
function languagePairSchema() { return { type: "object", additionalProperties: false, required: ["zh", "en"], properties: { zh: { type: "string" }, en: { type: "string" } } } as const; }

export function buildProductAnalysisPrompt(mode: "quick" | "deep"): string {
  const depth = mode === "deep"
    ? "这是用户主动发起的深入分析。提高结构、CMF、设计意图、构图与商业呈现的细节密度，但仍只依据可见证据。"
    : "这是快速分析。用紧凑、可编辑的字段完成产品优先识别和提示词反推。";
  return [
    "你是 Lensflow 的视觉分析器。优先判断画面是否为实体产品或器物；人物、场景、平面内容应退化为通用视觉分析。",
    depth,
    "严格区分 observed、inferred、unknown。不要输出 measured；尺寸、比例、方向与十六进制色卡由本地代码测量。",
    "一次返回完整 JSON：中英文正向/负向提示词、忠实复现/商业呈现/概念变化三种变体，以及风格/主体/构图/色彩/动态五轴关键词。",
    "不要猜测不可见的内部结构、材质牌号、尺寸、品牌或镜头参数；不确定内容进入 unknown。"
  ].join("\n");
}

export function localMeasurementsFromAsset(asset: AssetRecord): LocalAnalysisMeasurements {
  const metadata = asset.metadata ?? {};
  const width = measuredNumber(metadata.width);
  const height = measuredNumber(metadata.height);
  const aspectRatio = measuredString(metadata.aspectRatio) ?? (width && height ? `${width}:${height}` : null);
  const orientation = width && height ? (width === height ? "square" : width > height ? "landscape" : "portrait") : null;
  const paletteValue = unwrapMeasured(metadata.palette);
  const palette = Array.isArray(paletteValue) ? paletteValue.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const value = item as { hex?: unknown; proportion?: unknown };
    return typeof value.hex === "string" && /^#[0-9a-f]{6}$/i.test(value.hex) && typeof value.proportion === "number"
      ? [{ hex: value.hex.toLowerCase(), proportion: Math.max(0, Math.min(1, value.proportion)) }]
      : [];
  }).slice(0, 12) : [];
  return {
    width: { value: width, source: "measured" },
    height: { value: height, source: "measured" },
    aspectRatio: { value: aspectRatio, source: "measured" },
    orientation: { value: orientation, source: "measured" },
    palette: { value: palette, source: "measured" }
  };
}

function unwrapMeasured(value: unknown): unknown {
  return value && typeof value === "object" && "value" in value ? (value as { value?: unknown }).value : value;
}

function measuredNumber(value: unknown): number | null {
  const unwrapped = unwrapMeasured(value);
  return typeof unwrapped === "number" && Number.isFinite(unwrapped) ? unwrapped : null;
}

function measuredString(value: unknown): string | null {
  const unwrapped = unwrapMeasured(value);
  return typeof unwrapped === "string" && unwrapped.trim() ? unwrapped.trim() : null;
}

export function parseProductAnalysisOutput(value: unknown, measurements: LocalAnalysisMeasurements, createdAt = new Date().toISOString()): { result: ProductAnalysisResult; partial: boolean } {
  const candidate = productAnalysisModelOutputSchema.safeParse(value);
  const normalized = candidate.success ? candidate.data : salvageModelOutput(value);
  return {
    result: productAnalysisResultSchema.parse({ ...normalized, schemaVersion: "2.0", measurements, createdAt }),
    partial: !candidate.success
  };
}

export async function runProductAnalysisRequest(input: {
  adapter: ProviderAdapter;
  profile: ProviderProfile;
  secret: string;
  asset: AssetRecord;
  mode: "quick" | "deep";
  baseResult?: ProductAnalysisResult;
  signal?: AbortSignal;
}) {
  if (!input.asset.dataUrl) throw new Error("分析素材缺少本地图片数据。");
  if (input.mode === "deep") return runDeepProductAnalysisRequests(input);
  const response = await input.adapter.analyze(input.profile, input.secret, {
    prompt: buildProductAnalysisPrompt(input.mode),
    imageDataUrl: input.asset.dataUrl,
    schema: QUICK_ANALYSIS_JSON_SCHEMA as unknown as Record<string, unknown>,
    signal: input.signal
  });
  const structured = response.structured ?? parseStructuredResponseText(response.text);
  return {
    ...parseProductAnalysisOutput(structured, localMeasurementsFromAsset(input.asset)),
    rawResponse: response.raw,
    model: response.model,
    segmentErrors: [] as string[]
  };
}

async function runDeepProductAnalysisRequests(input: {
  adapter: ProviderAdapter;
  profile: ProviderProfile;
  secret: string;
  asset: AssetRecord;
  baseResult?: ProductAnalysisResult;
  signal?: AbortSignal;
}) {
  const requests = [
    {
      key: "form" as const,
      prompt: `${buildProductAnalysisPrompt("deep")}\n本段只返回内容分类、主体摘要、完整形态结构和证据边界。`,
      schema: DEEP_ANALYSIS_JSON_SCHEMAS.form,
      parser: deepFormOutputSchema
    },
    {
      key: "cmf" as const,
      prompt: `${buildProductAnalysisPrompt("deep")}\n本段只返回主体的颜色、材料、表面处理分区，以及画面中可见文字。`,
      schema: DEEP_ANALYSIS_JSON_SCHEMAS.cmf,
      parser: deepCmfOutputSchema
    },
    {
      key: "presentation" as const,
      prompt: `${buildProductAnalysisPrompt("deep")}\n本段只返回构图、镜头、光线、风格、双语提示词、三种变体和五轴建议。`,
      schema: DEEP_ANALYSIS_JSON_SCHEMAS.presentation,
      parser: deepPresentationOutputSchema
    }
  ];
  const settled = await Promise.allSettled(requests.map(async (request) => {
    const response = await input.adapter.analyze(input.profile, input.secret, {
      prompt: request.prompt,
      imageDataUrl: input.asset.dataUrl,
      schema: request.schema as unknown as Record<string, unknown>,
      signal: input.signal
    });
    const structured = response.structured ?? parseStructuredResponseText(response.text);
    return {
      key: request.key,
      data: request.parser.parse(structured),
      raw: response.raw,
      model: response.model
    };
  }));

  if (input.signal?.aborted) {
    throw input.signal.reason instanceof Error
      ? input.signal.reason
      : new DOMException("分析已中断", "AbortError");
  }

  const base = input.baseResult ? modelOutputFromResult(input.baseResult) : salvageModelOutput({});
  const rawResponse: Record<string, unknown> = {};
  const segmentErrors: string[] = [];
  let completedSegments = 0;
  let model = input.profile.analysisModel;

  settled.forEach((outcome, index) => {
    const request = requests[index]!;
    if (outcome.status === "rejected") {
      segmentErrors.push(`${request.key}: ${outcome.reason instanceof Error ? outcome.reason.message : "请求失败"}`);
      return;
    }
    completedSegments += 1;
    model = outcome.value.model || model;
    rawResponse[outcome.value.key] = outcome.value.raw;
    Object.assign(base, outcome.value.data);
  });

  if (!completedSegments) {
    throw new Error(`深入分析三个分段均失败：${segmentErrors.join("；")}`);
  }

  const parsed = parseProductAnalysisOutput(base, localMeasurementsFromAsset(input.asset));
  return {
    ...parsed,
    partial: parsed.partial || segmentErrors.length > 0,
    rawResponse,
    model,
    segmentErrors
  };
}

function modelOutputFromResult(result: ProductAnalysisResult): ProductAnalysisModelOutput {
  const { schemaVersion: _schemaVersion, measurements: _measurements, createdAt: _createdAt, ...modelOutput } = result;
  return modelOutput;
}

function parseStructuredResponseText(text: string): unknown {
  const cleaned = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  try { return JSON.parse(cleaned); }
  catch { return {}; }
}

function salvageModelOutput(value: unknown): ProductAnalysisModelOutput {
  const object = value && typeof value === "object" ? value as Record<string, unknown> : {};
  const classification = object.classification && typeof object.classification === "object" ? object.classification as Record<string, unknown> : {};
  const kind = ["product", "person", "scene", "graphic", "other"].includes(String(classification.kind)) ? classification.kind as ProductAnalysisModelOutput["classification"]["kind"] : "other";
  const evidence = (input: unknown, fallback = "未返回可验证内容") => {
    if (typeof input === "string") return { value: input || fallback, source: "unknown" as const };
    if (input && typeof input === "object") {
      const row = input as Record<string, unknown>;
      const source = ["observed", "inferred", "unknown"].includes(String(row.source)) ? row.source as "observed" | "inferred" | "unknown" : "unknown";
      return { value: typeof row.value === "string" && row.value.trim() ? row.value.trim() : fallback, source };
    }
    return { value: fallback, source: "unknown" as const };
  };
  const evidenceList = (input: unknown) => Array.isArray(input) ? input.slice(0, 16).map((item) => evidence(item)) : [];
  const pair = (input: unknown, fallback: string) => {
    const row = input && typeof input === "object" ? input as Record<string, unknown> : {};
    const positive = row.positive && typeof row.positive === "object" ? row.positive as Record<string, unknown> : {};
    const negative = row.negative && typeof row.negative === "object" ? row.negative as Record<string, unknown> : {};
    return { positive: { zh: text(positive.zh, fallback), en: text(positive.en, fallback) }, negative: { zh: text(negative.zh, ""), en: text(negative.en, "") } };
  };
  const prompts = pair(object.prompts, "请根据可见画面进行忠实创作");
  const rawVariants = Array.isArray(object.variants) ? object.variants : [];
  const variants = (["faithful", "commercial", "exploratory"] as const).map((variantKind, index) => {
    const found = rawVariants.find((item) => item && typeof item === "object" && (item as Record<string, unknown>).kind === variantKind) as Record<string, unknown> | undefined;
    return { kind: variantKind, label: ["忠实复现", "商业呈现", "概念变化"][index]!, prompts: pair(found?.prompts, prompts.positive.zh) };
  });
  const cmf = object.cmf && typeof object.cmf === "object" ? object.cmf as Record<string, unknown> : {};
  const axis = object.axisSuggestions && typeof object.axisSuggestions === "object" ? object.axisSuggestions as Record<string, unknown> : {};
  return {
    classification: { kind, confidence: typeof classification.confidence === "number" ? Math.max(0, Math.min(1, classification.confidence)) : 0, reason: text(classification.reason, "模型未返回可靠分类依据") },
    summary: evidence(object.summary), subject: evidence(object.subject), formStructure: evidenceList(object.formStructure),
    cmf: { color: evidenceList(cmf.color), material: evidenceList(cmf.material), finish: evidenceList(cmf.finish) },
    composition: evidence(object.composition), camera: evidence(object.camera), lighting: evidence(object.lighting), style: evidence(object.style), visibleText: evidenceList(object.visibleText),
    evidenceBoundary: boundary(object.evidenceBoundary), prompts, variants,
    axisSuggestions: Object.fromEntries(AXIS_ORDER.map((name) => [name, stringList(axis[name])])) as ProductAnalysisModelOutput["axisSuggestions"]
  };
}

function text(value: unknown, fallback: string): string { return typeof value === "string" && value.trim() ? value.trim() : fallback; }
function stringList(value: unknown): string[] { return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string" && Boolean(item.trim())).map((item) => item.trim()).slice(0, 8) : []; }
function boundary(value: unknown) {
  const row = value && typeof value === "object" ? value as Record<string, unknown> : {};
  return { observed: stringList(row.observed), inferred: stringList(row.inferred), unknown: stringList(row.unknown) };
}
