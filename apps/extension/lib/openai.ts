import OpenAI, { toFile } from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import {
  type AppSettings,
  type ConnectionTestResult,
  type ImageEditResult,
  type ImageSource,
  type MeasuredImageData
} from "../shared/types";
import {
  classifyAvailableModels,
  normalizeApiBaseUrl
} from "../shared/api-models";
import {
  VisualAnalysisCmfSchema,
  VisualAnalysisCoreSchema,
  VisualAnalysisDesignSchema,
  VisualAnalysisSchema,
  type VisualAnalysis
} from "../shared/visual-analysis";
import { VisualOverviewSchema, type VisualOverview } from "../shared/visual-overview";
import type { AnalysisRunOptions } from "./operations";

export { classifyAvailableModels, normalizeApiBaseUrl } from "../shared/api-models";

const APPLICABILITY_INSTRUCTIONS = `先判断图片主类型与主要设计对象，再决定各分析域是否适用。图片主类型至少区分：实体产品或部件、数字界面、平面视觉、空间环境、时尚穿戴、人物或生活场景。
适用性规则：
- 只深入与主要设计对象和可见证据相关的分析域；不适用字段使用空字符串、空数组或 0，不得为填满结构而补写通用套话。
- “不适用”表示该分析域与图片类型无关；“未知”表示该分析域相关但单图证据不足。两者不得混淆。
- 无可辨文字时 typography.present=false，文字、字体和排版字段保持空值；无人物时 expression、wardrobeOrStyling 等人物字段保持空值。
- 实体产品或部件图可分析造型、结构和 CMF，但不可把不可见内部结构、人体工学、成本、安全、制造工艺或材料牌号写成事实。
- 数字界面图不得强行生成实体材料、五金、制造、耐久或正交三视图结论；只分析可见布局、层级、交互线索、图形与色彩。
- 平面视觉图不得强行推断隐藏结构、机械连接、真实材料或人体工学；空间、时尚和人物场景只分析与主要设计对象直接相关的内容。
- 单一部件不得扩写成无依据的完整产品系统；摄影、场景和背景只在其影响主体识别、复现或设计表达时分析。
- 每个结论必须回答“这对理解、迁移、比较或重建设计是否有用”；无具体证据或行动价值的内容留空。`;

const SYSTEM_INSTRUCTIONS = `你是一名跨工业设计、产品、视觉、空间、时尚和数字界面的设计研究员，同时具备摄影分析与图像逆向工程能力。
你的任务是把任意设计图片拆成可供理解、检索、迁移、对比和重建使用的结构化数据。不得假定特定产品品类或图库主题。

${APPLICABILITY_INSTRUCTIONS}

规则：
1. 只把像素中可以直接确认的内容写入 observedFacts。
2. 焦段、光圈、设备、年代、品牌等无法从像素确定时，只能作为推断，并降低对应 confidence。
3. 不得为了填满字段而编造内容；未知字段使用空字符串、空数组或 0。
4. 不识别或猜测真实人物身份，不使用受保护角色名；以可观察外观描述替代。
5. formStructure 必须重点拆解整体轮廓、主次体块、比例关系、轴线与对称、边缘转折、开孔、连接和曲面连续性，并分别提取主视、左视、俯视线索。
6. orthographicPlan 必须定义正面与三轴，给出可用于跨视图校准的比例、结构地标、对齐约束及正/侧/俯各自可信度。
7. 图片不可见的结构只能写入 hiddenGeometryAssumptions 和 inferredSurfaceTreatment，不得伪装成观察事实。
8. 重建提示词必须具体覆盖主体、造型、姿态、构图、空间层次、配色、光线、镜头观感、材质和后期。
9. 输出语言由用户指定，但 positivePrompt 和 negativePrompt 使用适合图片生成模型的英文。
10. 默认把主要可见主体作为分析对象；背景只用于记录空间、光线、色偏和对主体辨识的影响，不得把背景的颜色、材质或纹理混入主体 CMF。
11. cmfAnalysis 必须逐区覆盖 Color、Material、Finish：颜色角色和画面占比、材料分区与可见线索、光泽/粗糙度/纹理尺度/边缘处理、材料转接和五金关系、磨损与老化风险。
12. measuredHexCandidates 只能引用像素算法提供的 HEX；estimatedImageProportion 是画面像素占比估计，不代表实物面积或配方比例。
13. RGB 和 CMYK 以插件提供的实测色值为准。Pantone 只能填写视觉近似候选，必须说明 C/U 等体系并降低可信度，不得声称为仪器测色或实体色卡匹配。
14. relatedReferences 只生成可用于检索相似产品和零件的具体搜索词；searchUrl 和 sourcePageUrl 留空，由插件根据真实来源和检索词写入，禁止编造商品详情 URL。
15. 真实材种、牌号、涂层或镀层配方、色牢度、耐刮、耐候和量产工艺不能由单图确认；分别写入 inferred 或 unknown，不得写成事实。
16. designIntelligence 必须分析设计手法、设计语言、形态谱系假设、相似设计策略、可迁移原则、推荐探索方向、参考候选与学习任务；依据应落到轮廓、比例、节奏、层级、界面、连接、图形、色彩、材料或交互等可见机制，禁止只堆砌风格形容词。
17. “造型可能来源”只能是 formLineageHypotheses：每项必须给出视觉依据、至少一个替代解释、可执行检索词和低于或等于可见证据所支持的可信度。不得断言真实作者、抄袭、品牌归属、专利来源或因果影响。
18. analogousStrategies 比较的是可迁移的设计机制，不等同于产品同款或来源一致；必须同时写共同机制与关键差异。
19. transferablePrinciples 应帮助生成原创方案：明确保留的机制、可变化变量、不得照搬的识别性细节及验证方法。
20. recommendedDirections 必须提出当前产品尚未明确使用、但值得探索的设计手法或设计语言，并解释适配理由、可迁移机制、必须改变的变量、误用风险和检索词；不能把建议写成当前事实。
21. referenceCandidates 可给出相关产品、作品、设计师、工作室或设计运动的名称，但只能作为“视觉类比”或“知识候选”。每项必须附可核验检索词、共同机制和避免照搬项；不确定名称时留空数组，禁止编造作品、作者、品牌归属或详情 URL。
22. 波普、解构、未来主义、极简主义等术语只有在可见机制支持时才可写入当前 designLanguage；弱关联应放入 recommendedDirections，而非当前标签。
23. 严格遵守给定结构，不输出结构外内容。`;

const OVERVIEW_INSTRUCTIONS = `你是一名跨品类设计研究员。先给用户一份快速、可判断是否值得深入的设计概览。
只分析主要可见主体；不得假定特定图库、产品类别或行业。
${APPLICABILITY_INSTRUCTIONS}
只输出最关键的轮廓、主次体块、结构线索、设计语言、设计手法和 CMF 视觉线索。
设计语言必须有可见依据；设计手法必须给出可迁移规则。
learningValue 用一句话说明为什么值得继续学习；designDna 只提炼最多 3 个可见机制和一个可探索变量。
recommendedDeepDives 只能从“造型 DNA、功能与人因、结构与制造、CMF 与耐久、竞品与谱系、摄影与复现”中选择最多 3 项。
biggestUnknown 写出当前最影响判断、但单图无法确认的一项信息缺口。
材料和表面只写视觉线索，不确认真实材种、工艺或性能。
observed、inferred、unknown 必须分开。禁止判断真实来源、品牌影响、抄袭或作者身份。
每个数组最多 3 项，每项使用短句，严格遵守结构。`;

export async function analyzeOverviewWithOpenAI(
  settings: AppSettings,
  imageDataUrl: string,
  source: ImageSource,
  measured: MeasuredImageData,
  options: AnalysisRunOptions = {}
): Promise<VisualOverview> {
  const client = createClient(settings);
  const response = await runOpenAIRequest(
    settings,
    "设计概览",
    () => client.responses.parse({
      model: settings.analysisModel,
      reasoning: { effort: "minimal" },
      instructions: OVERVIEW_INSTRUCTIONS,
      input: [{
        role: "user",
        content: [
          { type: "input_text", text: `${buildAnalysisContext(settings, source, measured)}\n当前阶段：只生成快速设计概览，不生成完整 JSON。` },
          { type: "input_image", image_url: imageDataUrl, detail: "low" }
        ]
      }],
      max_output_tokens: 1_800,
      text: { format: zodTextFormat(VisualOverviewSchema, "visual_overview"), verbosity: "low" }
    }, { signal: options.signal })
  );
  if (!response.output_parsed) {
    const refusal = response.output.flatMap((item) => item.type === "message" ? item.content : []).find((item) => item.type === "refusal");
    throw new Error(refusal?.refusal || "模型没有返回设计概览。");
  }
  return response.output_parsed;
}

export async function analyzeWithOpenAI(
  settings: AppSettings,
  imageDataUrl: string,
  source: ImageSource,
  measured: MeasuredImageData,
  reconstructionDirective = "",
  options: AnalysisRunOptions = {}
): Promise<VisualAnalysis> {
  const client = createClient(settings);
  const context = buildAnalysisContext(settings, source, measured, reconstructionDirective);
  const performance = getAnalysisPerformance(settings.analysisMode);
  const overviewPriority = options.overview
    ? `\n已有概览优先级提示：图片领域“${options.overview.domain}”；建议深入“${options.overview.recommendedDeepDives.join("、") || "无"}”；最大未知“${options.overview.biggestUnknown || "无"}”。这些内容只用于安排分析重点，不是事实，不得据此补写缺少证据的字段。`
    : "";

  const commonInput = (scope: string) => ([
    {
      role: "user" as const,
      content: [
        {
          type: "input_text" as const,
          text: `${context}${overviewPriority}\n当前子任务：${scope}\n每个数组最多 ${performance.arrayLimit} 项；每项使用短句，禁止重复。`
        },
        { type: "input_image" as const, image_url: imageDataUrl, detail: performance.imageDetail }
      ]
    }
  ]);

  const internalController = new AbortController();
  const abortFromCaller = () => internalController.abort(options.signal?.reason);
  if (options.signal?.aborted) abortFromCaller();
  else options.signal?.addEventListener("abort", abortFromCaller, { once: true });
  const signal = internalController.signal;
  options.onProgress?.("design", "active");
  options.onProgress?.("structure", "active");
  options.onProgress?.("cmf", "active");
  try {
    const [designResponse, coreResponse, cmfResponse] = await Promise.all([
    runOpenAIRequest(
      settings,
      "通用设计智能",
      () => client.responses.parse({
        model: settings.analysisModel,
        reasoning: { effort: performance.reasoningEffort },
        instructions: `${SYSTEM_INSTRUCTIONS}\n只完成设计手法、设计语言、造型谱系假设、相似设计策略、原创迁移原则、推荐探索方向、可核验参考候选、设计决策权衡、原创练习及对应证据边界。学习练习必须改变至少两个变量，不得要求复刻同款。功能、人因、制造、成本和安全只允许作为待验证假设。`,
        input: commonInput("分析跨品类设计语言、手法、可能谱系、相似机制、推荐方向、产品或设计师参考候选、设计 DNA、权衡和可执行原创练习"),
        max_output_tokens: Math.min(performance.maxOutputTokens, 4_000),
        text: {
          format: zodTextFormat(VisualAnalysisDesignSchema, "visual_analysis_design"),
          verbosity: performance.verbosity
        }
      }, { signal })
    ).then((response) => {
      options.onProgress?.("design", "complete");
      return response;
    }),
    runOpenAIRequest(
      settings,
      "主体与结构分析",
      () => client.responses.parse({
        model: settings.analysisModel,
        reasoning: { effort: performance.reasoningEffort },
        instructions: `${SYSTEM_INSTRUCTIONS}\n只完成主体、场景、造型、正交视图、构图、灯光、相机、风格、文字和重建提示词字段。`,
        input: commonInput("提取主体造型结构、构图、摄影信息和重建参数"),
        max_output_tokens: performance.maxOutputTokens,
        text: {
          format: zodTextFormat(VisualAnalysisCoreSchema, "visual_analysis_core"),
          verbosity: performance.verbosity
        }
      }, { signal })
    ).then((response) => {
      options.onProgress?.("structure", "complete");
      return response;
    }),
    runOpenAIRequest(
      settings,
      "完整 CMF 分析",
      () => client.responses.parse({
        model: settings.analysisModel,
        reasoning: { effort: performance.reasoningEffort },
        instructions: `${SYSTEM_INSTRUCTIONS}\n只完成色彩、完整 CMF、材料分区、表面处理、接口五金、耐久老化、证据边界和相关检索字段。`,
        input: commonInput("提取完整 Color、Material、Finish 分析及相关产品和零件检索词"),
        max_output_tokens: performance.maxOutputTokens,
        text: {
          format: zodTextFormat(VisualAnalysisCmfSchema, "visual_analysis_cmf"),
          verbosity: performance.verbosity
        }
      }, { signal })
    ).then((response) => {
      options.onProgress?.("cmf", "complete");
      return response;
    })
    ]);

  if (!designResponse.output_parsed) {
    const refusal = designResponse.output
      .flatMap((item) => (item.type === "message" ? item.content : []))
      .find((item) => item.type === "refusal");
    throw new Error(refusal?.refusal || "模型没有返回通用设计智能结果。");
  }

  if (!coreResponse.output_parsed) {
    const refusal = coreResponse.output
      .flatMap((item) => (item.type === "message" ? item.content : []))
      .find((item) => item.type === "refusal");
    throw new Error(refusal?.refusal || "模型没有返回主体与结构分析结果。");
  }
  if (!cmfResponse.output_parsed) {
    const refusal = cmfResponse.output
      .flatMap((item) => (item.type === "message" ? item.content : []))
      .find((item) => item.type === "refusal");
    throw new Error(refusal?.refusal || "模型没有返回完整 CMF 分析结果。");
  }

    const analysis = VisualAnalysisSchema.parse({
    ...designResponse.output_parsed,
    ...coreResponse.output_parsed,
    ...cmfResponse.output_parsed
  });
    return attachReferenceLinks(analysis, source);
  } catch (error) {
    internalController.abort(error);
    throw error;
  } finally {
    options.signal?.removeEventListener("abort", abortFromCaller);
  }
}

function attachReferenceLinks(analysis: VisualAnalysis, source: ImageSource): VisualAnalysis {
  const references = analysis.cmfAnalysis.relatedReferences;
  const withSearchUrls = (items: typeof references.productSearches, shopping: boolean) => items.map((item) => ({
    ...item,
    searchUrl: buildGoogleSearchUrl(item.query, shopping)
  }));
  return {
    ...analysis,
    cmfAnalysis: {
      ...analysis.cmfAnalysis,
      relatedReferences: {
        sourcePageUrl: isHttpUrl(source.pageUrl) ? source.pageUrl! : "",
        productSearches: withSearchUrls(references.productSearches, true),
        componentSearches: withSearchUrls(references.componentSearches, false)
      }
    }
  };
}

function buildGoogleSearchUrl(query: string, shopping: boolean): string {
  const params = new URLSearchParams({ q: query.trim() });
  if (shopping) params.set("tbm", "shop");
  return `https://www.google.com/search?${params.toString()}`;
}

function isHttpUrl(value: string | undefined): boolean {
  if (!value) return false;
  try {
    return ["http:", "https:"].includes(new URL(value).protocol);
  } catch {
    return false;
  }
}

export function buildAnalysisContext(
  settings: AppSettings,
  source: ImageSource,
  measured: MeasuredImageData,
  reconstructionDirective = ""
): string {
  const palette = measured.palette
    .map((color) => `${color.hex} ${(color.proportion * 100).toFixed(1)}%${color.correction
      ? `（人工校正；原始 ${color.correction.originalHex}；ΔE00 ${color.correction.deltaE2000.toFixed(2)}）`
      : ""}`)
    .join(", ");
  return [
    `输出语言：${settings.outputLanguage === "zh-CN" ? "简体中文" : "English"}`,
    `分析模式：${settings.analysisMode}。${settings.analysisMode === "fast" ? "保持全部字段；普通数组最多 3 条，单条使用短句，只写最关键且互不重复的内容。材料和表面分区按可见部件完整列出，不得为压缩而合并不同部件。" : "按可见证据充分填写字段。"}`,
    `实测尺寸：${measured.width} x ${measured.height}`,
    `实测比例：${measured.aspectRatio}`,
    `原始图片 SHA-256：${measured.sha256}`,
    `像素算法提取配色（HEX 与画面占比）：${palette || "未获得"}`,
    `网页 alt：${source.alt || "无"}`,
    `来源页面：${source.pageTitle || source.pageUrl || "本地图片"}`,
    "分析目标是主要可见主体。先锁定主体轮廓、遮挡和部件边界，再分析造型结构、对象层次、主体 CMF 与可复刻参数；背景只保留为构图、光线和色偏上下文。",
    "这是一项跨品类通用设计分析。提取设计手法、设计语言、造型可能谱系、相似设计机制与可迁移原则；不得假定当前图库主题，也不得把视觉相似写成真实来源或抄袭结论。",
    APPLICABILITY_INSTRUCTIONS,
    "完整填写 cmfAnalysis：主体色彩角色与画面占比、材料分区和可见证据、表面处理、材料转接、五金关系、磨损老化风险，以及 observed / inferred / unknown 证据边界。",
    "同时建立正交三视图规划：定义正面与三轴、估算长宽高关系、列出跨视图结构地标与投影对齐约束。",
    reconstructionDirective.trim()
      ? `用户补充复现指令：${reconstructionDirective.trim()}\n该指令只允许影响 reconstruction 字段，不得修改实测数据、可见事实、推断项或不确定项。`
      : ""
  ].filter(Boolean).join("\n");
}

function getAnalysisPerformance(mode: AppSettings["analysisMode"]): {
  reasoningEffort: "minimal" | "low" | "medium";
  imageDetail: "low" | "high";
  verbosity: "low" | "medium";
  maxOutputTokens: number;
  arrayLimit: number;
} {
  if (mode === "deep") {
    return { reasoningEffort: "medium", imageDetail: "high", verbosity: "medium", maxOutputTokens: 9_000, arrayLimit: 7 };
  }
  if (mode === "balanced") {
    return { reasoningEffort: "low", imageDetail: "high", verbosity: "medium", maxOutputTokens: 7_000, arrayLimit: 5 };
  }
  return { reasoningEffort: "minimal", imageDetail: "low", verbosity: "low", maxOutputTokens: 5_000, arrayLimit: 3 };
}

export async function editWithOpenAI(
  settings: AppSettings,
  image: Blob,
  prompt: string
): Promise<ImageEditResult> {
  const client = createClient(settings);
  const upload = await toFile(image, "lensflow-source.png", { type: image.type || "image/png" });
  const response = await runOpenAIRequest(
    settings,
    "图片编辑",
    () => client.images.edit({
      model: settings.imageModel,
      image: upload,
      prompt: [
        "Edit the supplied image with high fidelity.",
        "Preserve the subject identity, silhouette, proportions, materials, textures, camera perspective and lighting unless the request explicitly changes them.",
        prompt
      ].join("\n"),
      quality: settings.imageQuality,
      input_fidelity: "high",
      size: "auto"
    })
  );
  const imageResult = response.data?.[0];
  if (!imageResult?.b64_json) throw new Error("图片模型没有返回结果。");
  return {
    dataUrl: `data:image/png;base64,${imageResult.b64_json}`,
    revisedPrompt: imageResult.revised_prompt
  };
}

export async function generateThreeViewWithOpenAI(
  settings: AppSettings,
  image: Blob,
  analysis: VisualAnalysis,
  measured: MeasuredImageData
): Promise<ImageEditResult> {
  const client = createClient(settings);
  const upload = await toFile(image, "lensflow-reference.png", { type: image.type || "image/png" });
  const structure = analysis.formStructure;
  const plan = analysis.orthographicPlan;
  const palette = measured.palette
    .map((color) => `${color.hex} (${(color.proportion * 100).toFixed(1)}%)`)
    .join(", ");
  const materials = analysis.cmfAnalysis.materialZones
    .map((item) => `${item.element}: ${item.visibleCues.join(", ")}; likely families ${item.likelyMaterialFamilies.join(", ")}; texture ${item.texture}; reflectance ${item.reflectance}`)
    .join("; ");
  const finishes = analysis.cmfAnalysis.finishZones
    .map((item) => `${item.element}: gloss ${item.glossLevel}; roughness ${item.apparentRoughness}; texture scale ${item.textureScale}; edge ${item.edgeTreatment}`)
    .join("; ");
  const prompt = `Create a high-fidelity orthographic three-view reconstruction sheet from the supplied reference image. Treat the reference image and the observed evidence below as the source of truth.

Required views and layout:
- FRONT VIEW on the left
- LEFT SIDE VIEW in the center
- TOP VIEW on the right
- All views at exactly the same scale, aligned to shared projection guides
- FRONT width must equal TOP width
- FRONT height must equal LEFT SIDE height
- LEFT SIDE depth must equal TOP depth
- Project every named cross-view landmark onto the same guide line where applicable
- True orthographic projection, zero perspective distortion, neutral white background
- Clean dark-gray technical linework with restrained flat material colors sampled from the reference
- No three-quarter view, perspective convergence, cast shadow, decorative border, dimensions, invented logo, or extra object

Observed form information:
- Subject: ${analysis.subject.primary}
- Overall silhouette: ${structure.overallSilhouette}
- Primary volumes: ${structure.primaryVolumes.join("; ")}
- Secondary volumes: ${structure.secondaryVolumes.join("; ")}
- Proportions: ${structure.proportionRelationships.join("; ")}
- Axes and symmetry: ${structure.axesAndSymmetry}
- Edges and transitions: ${structure.edgesAndTransitions.join("; ")}
- Openings and cutouts: ${structure.openingsAndCutouts.join("; ")}
- Joints and connections: ${structure.jointsAndConnections.join("; ")}
- Surface continuity: ${structure.surfaceContinuity.join("; ")}
- Front-view evidence: ${structure.frontViewCues.join("; ")}
- Side-view evidence: ${structure.sideViewCues.join("; ")}
- Top-view evidence: ${structure.topViewCues.join("; ")}

Orthographic reconstruction plan:
- Canonical orientation: ${plan.canonicalOrientation}
- Front definition: ${plan.frontDefinition}
- Left definition: ${plan.leftDefinition}
- Top definition: ${plan.topDefinition}
- Width axis: ${plan.coordinateAxes.widthAxis}
- Height axis: ${plan.coordinateAxes.heightAxis}
- Depth axis: ${plan.coordinateAxes.depthAxis}
- Shared scale basis: ${plan.sharedScaleBasis}
- Estimated dimension ratios: ${plan.estimatedDimensionRatios.join("; ")}
- Cross-view landmarks: ${plan.crossViewLandmarks.join("; ")}
- Alignment constraints: ${plan.alignmentConstraints.join("; ")}
- View confidence: front ${plan.viewConfidence.front.toFixed(2)}, left ${plan.viewConfidence.left.toFixed(2)}, top ${plan.viewConfidence.top.toFixed(2)}

Measured appearance:
- Dominant palette: ${palette || "not available"}
- Materials: ${materials || "not established"}
- Finishes: ${finishes || "not established"}

Preserve exactly where visible: ${analysis.reconstruction.mustPreserve.join("; ")}.
Unseen geometry is uncertain: ${structure.hiddenGeometryAssumptions.join("; ") || "not established"}.
For unseen surfaces: ${plan.inferredSurfaceTreatment || "use the simplest geometrically consistent continuation of observed edges and symmetry"}.
Do not add styling or construction details unsupported by the reference. Maintain silhouette, proportions, material breaks and feature positions across all three views. This is a visual reconstruction sheet, not a dimensioned manufacturing drawing.`;

  const response = await runOpenAIRequest(
    settings,
    "三视图生成",
    () => client.images.edit({
      model: settings.imageModel,
      image: upload,
      prompt,
      quality: settings.imageQuality,
      input_fidelity: "high",
      size: settings.imageModel.startsWith("gpt-image-2") ? "2304x1024" : "1536x1024"
    })
  );
  const imageResult = response.data?.[0];
  if (!imageResult?.b64_json) throw new Error("图片模型没有返回三视图。");
  return {
    dataUrl: `data:image/png;base64,${imageResult.b64_json}`,
    revisedPrompt: imageResult.revised_prompt
  };
}

export async function testOpenAIConnection(settings: AppSettings): Promise<ConnectionTestResult> {
  const client = createClient(settings);
  const startedAt = performance.now();
  const models = await runOpenAIRequest(settings, "连接测试", () => client.models.list());
  const catalog = classifyAvailableModels(models.data.map((model) => model.id));
  return {
    reachable: true,
    endpoint: normalizeApiBaseUrl(settings.apiBaseUrl),
    latencyMs: Math.max(0, Math.round(performance.now() - startedAt)),
    modelCount: catalog.availableModels.length,
    ...catalog,
    analysisModelAvailable: catalog.analysisModels.includes(settings.analysisModel),
    imageModelAvailable: catalog.imageModels.includes(settings.imageModel)
  };
}

async function runOpenAIRequest<T>(
  settings: AppSettings,
  operation: string,
  request: () => Promise<T>
): Promise<T> {
  try {
    return await request();
  } catch (error) {
    if (isAbortError(error)) throw error;
    throw new Error(formatOpenAIError(error, settings, operation));
  }
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError"
    || Boolean(error && typeof error === "object" && "name" in error && error.name === "AbortError");
}

export function formatOpenAIError(error: unknown, settings: AppSettings, operation: string): string {
  const details = getErrorDetails(error);
  const normalized = `${details.name} ${details.message}`.toLowerCase();
  const endpoint = safeEndpointLabel(settings.apiBaseUrl);

  if (normalized.includes("failed to fetch") || normalized.includes("connection error") || normalized.includes("apiconnectionerror")) {
    return `NETWORK_BLOCKED_OR_UNREACHABLE：${operation}无法访问 ${endpoint}。浏览器不会把底层网络代码暴露给扩展；若开发者工具显示 ERR_BLOCKED_BY_CLIENT，请放行该端点，或在设置中改用可访问的 API Base URL。否则检查 DNS、代理与防火墙。`;
  }
  if (details.status === 401 || normalized.includes("authentication")) {
    return `API Key 无效、已撤销，或 ${endpoint} 未接受该密钥，请在设置中检查。`;
  }
  if (details.status === 403 || normalized.includes("permission")) {
    return `${operation}被 ${endpoint} 拒绝：当前项目或 API Key 没有所需权限。`;
  }
  if (details.status === 404 || normalized.includes("model_not_found")) {
    return `${operation}所用模型不可用。请确认当前 API Key 可访问 ${settings.analysisModel} 和 ${settings.imageModel}。`;
  }
  if (details.status === 429 || normalized.includes("rate limit") || normalized.includes("quota")) {
    return `${operation}受到额度或速率限制，请检查 API 服务商的余额、配额和速率上限后重试。`;
  }
  if (details.status === 524 || normalized.includes("524 status code")) {
    return `UPSTREAM_TIMEOUT：${endpoint} 在等待${operation}结果时超过网关时限。插件连接正常；请使用快速模式或改用响应更快的通用视觉模型。`;
  }
  return `${operation}失败：${details.message || "API 端点返回未知错误。"}`;
}

function getErrorDetails(error: unknown): { name: string; message: string; status?: number } {
  if (error && typeof error === "object") {
    const value = error as { name?: unknown; message?: unknown; status?: unknown; cause?: unknown };
    const causeMessage = value.cause instanceof Error ? value.cause.message : "";
    return {
      name: typeof value.name === "string" ? value.name : "Error",
      message: [typeof value.message === "string" ? value.message : "", causeMessage].filter(Boolean).join("："),
      status: typeof value.status === "number" ? value.status : undefined
    };
  }
  return { name: "Error", message: String(error ?? "") };
}

function createClient(settings: AppSettings): OpenAI {
  if (!settings.apiKey.trim()) throw new Error("请先在设置中填写 API Key。");
  return new OpenAI({
    apiKey: settings.apiKey.trim(),
    baseURL: normalizeApiBaseUrl(settings.apiBaseUrl),
    dangerouslyAllowBrowser: true,
    maxRetries: 0,
    timeout: 300_000
  });
}

function safeEndpointLabel(value: string): string {
  try {
    return normalizeApiBaseUrl(value);
  } catch {
    return "配置的 API 端点";
  }
}
