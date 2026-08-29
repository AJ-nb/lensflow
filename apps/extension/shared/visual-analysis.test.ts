import { describe, expect, it } from "vitest";
import {
  VisualAnalysisCmfSchema,
  VisualAnalysisCoreSchema,
  VisualAnalysisDesignSchema,
  VisualAnalysisSchema
} from "./visual-analysis";

const validAnalysis = {
  title: "工作室产品摄影",
  description: "单一产品位于画面中心，背景克制，侧上方柔光强调表面纹理。",
  visualIntent: "清晰展示产品结构与材质",
  designIntelligence: {
    domain: "工业设计 / 包装容器",
    designLanguage: [{
      term: "克制几何",
      visualEvidence: ["单一圆柱体", "低装饰表面"],
      effect: "建立稳定、精密的产品感",
      confidence: 0.9
    }],
    designTechniques: [{
      technique: "主次体块压缩",
      implementation: "主体圆柱占主导，顶盖仅以薄圆盘形成层级",
      evidence: ["顶盖厚度明显小于主体高度"],
      transferableRule: "用小比例次体块建立功能层级",
      misuseRisk: "次体块过薄可能削弱可操作性",
      confidence: 0.84
    }],
    formLineageHypotheses: [{
      hypothesis: "可能借鉴实验室器皿或精密仪器的圆柱原型",
      visualBasis: ["轴对称圆柱", "低装饰金属表面"],
      alternativeExplanation: "也可能只是由旋压或挤压工艺形成的最简几何",
      verificationQueries: ["minimal cylindrical instrument housing design", "laboratory vessel industrial design"],
      confidence: 0.42
    }],
    analogousStrategies: [{
      strategy: "以单一连续曲面表达洁净感",
      sharedMechanism: ["隐藏大部分连接", "控制高光连续性"],
      meaningfulDifference: ["功能开口与握持需求可能不同"],
      applicableDomains: ["小家电", "包装", "桌面设备"],
      searchQueries: ["continuous surface minimal product design"],
      confidence: 0.72
    }],
    transferablePrinciples: [{
      principle: "用比例而非装饰区分部件层级",
      preserve: ["主次体块的比例差"],
      adapt: ["截面形状", "接缝位置", "色彩"],
      avoidCopying: ["具体尺寸比例", "独特接缝细节"],
      validationMethod: ["轮廓缩略图对比", "握持与开启测试"]
    }],
    recommendedDirections: [{
      directionType: "设计语言",
      name: "温和解构",
      rationale: "可在不破坏主体完整感的前提下强化部件关系",
      transferableMechanisms: ["偏移接缝", "局部暴露连接"],
      variablesToChange: ["接缝位置", "开合方向"],
      misuseRisk: "过度错位会破坏握持与密封",
      searchQueries: ["soft deconstruction product design exposed joint"],
      confidence: 0.58
    }],
    referenceCandidates: [{
      referenceType: "设计师",
      name: "Dieter Rams",
      relevance: "可用于核验克制几何和功能层级的处理方式",
      sharedMechanisms: ["低装饰", "比例建立层级"],
      avoidCopying: ["具体轮廓", "识别性细节"],
      verificationQueries: ["Dieter Rams cylindrical product proportion design"],
      evidenceType: "知识候选",
      confidence: 0.54
    }],
    learningBrief: {
      learningValue: "学习如何用比例而不是装饰建立功能层级",
      signatureMechanisms: [{
        mechanism: "薄顶盖与高主体的比例反差",
        evidence: ["顶盖厚度明显小于主体高度"],
        preserve: ["主次体块的明显层级"],
        vary: ["截面形状", "开合界面"],
        avoidCopying: ["原图具体长宽比例"],
        confidence: 0.84
      }],
      decisionTradeoffs: [{
        decision: "压低顶盖视觉体量",
        apparentBenefit: "主体显得完整而精密",
        likelyCost: "可能压缩握持和开启空间",
        evidence: ["薄顶盖"],
        verification: ["制作不同厚度泡沫模型并测试开启"],
        confidence: 0.58
      }],
      studyExercise: {
        brief: "为不同使用场景设计一款原创容器",
        constraintsToKeep: ["主次体块层级清楚"],
        variablesToChange: ["截面", "接缝", "材料"],
        successCriteria: ["缩略图仍能辨识主次", "开启区域可触达"],
        evidenceToCollect: ["轮廓对比", "握持测试照片"]
      },
      recommendedDeepDives: ["结构与制造", "功能与人因"]
    },
    evidenceBoundary: {
      observed: ["单一圆柱主体与薄顶盖"],
      inferred: ["克制几何设计语言"],
      unknown: ["真实设计来源", "设计者意图"],
      overallConfidence: 0.75
    }
  },
  subject: {
    primary: "圆柱形金属容器",
    count: 1,
    attributes: ["银灰色", "哑光表面"],
    poseOrState: "直立",
    expression: "",
    wardrobeOrStyling: [],
    secondaryObjects: [],
    confidence: 0.96
  },
  sceneStructure: {
    sceneType: "工作室静物",
    foreground: [],
    midground: ["产品"],
    background: ["无缝浅灰背景"],
    spatialRelationships: ["主体与背景有明确分离"],
    occlusions: [],
    focalPoints: ["容器正面"],
    negativeSpace: "主体四周保留均匀留白",
    geometricStructure: ["中心轴对称"],
    confidence: 0.93
  },
  formStructure: {
    category: "容器",
    overallSilhouette: "竖向圆柱体",
    primaryVolumes: ["单一圆柱主体"],
    secondaryVolumes: ["顶部薄圆盘盖"],
    proportionRelationships: ["高度约为直径的两倍"],
    axesAndSymmetry: "围绕垂直中心轴旋转对称",
    edgesAndTransitions: ["侧壁与顶盖之间为清晰直角转折"],
    openingsAndCutouts: [],
    jointsAndConnections: ["顶盖与主体通过水平接缝连接"],
    surfaceContinuity: ["侧壁连续"],
    frontViewCues: ["矩形主体轮廓与顶部椭圆边缘"],
    sideViewCues: ["与正面近似一致"],
    topViewCues: ["同心圆轮廓"],
    hiddenGeometryAssumptions: ["背面可能与正面保持旋转对称"],
    manufacturabilityNotes: ["未提供尺寸，不能判断壁厚"],
    confidence: 0.84
  },
  orthographicPlan: {
    canonicalOrientation: "产品主展示面定义为正面，垂直中心轴向上",
    frontDefinition: "沿深度轴朝产品主展示面观察",
    leftDefinition: "从产品左侧沿宽度轴向右观察",
    topDefinition: "从上方向下沿高度轴观察",
    coordinateAxes: {
      widthAxis: "正面水平方向",
      heightAxis: "产品垂直中心轴",
      depthAxis: "从正面指向背面"
    },
    sharedScaleBasis: "以主体总高度作为正面与左视图共同缩放基准",
    estimatedDimensionRatios: ["宽:高约为 1:2", "深度预计接近宽度"],
    crossViewLandmarks: ["顶盖上沿", "主体底沿", "顶盖与主体接缝"],
    alignmentConstraints: ["正面与俯视图宽度一致", "正面与左视图高度一致", "左视与俯视图深度一致"],
    inferredSurfaceTreatment: "不可见背面按最简单旋转对称结构延续，不增加装饰",
    viewConfidence: {
      front: 0.9,
      left: 0.65,
      top: 0.62
    }
  },
  composition: {
    layout: "中心构图",
    subjectPlacement: "画面中心",
    crop: "完整主体",
    balance: "稳定",
    symmetry: "近似轴对称",
    leadingLines: "容器垂直边缘",
    perspective: "平视",
    depth: "浅层空间",
    confidence: 0.9
  },
  colorAnalysis: {
    harmony: "中性色",
    temperature: "中性偏冷",
    saturation: "低饱和",
    contrast: "中等",
    distribution: "浅灰背景占大部分，银灰主体形成明度差",
    backgroundColorRole: "衬托主体",
    accentColorRole: "无明显强调色",
    skinToneHandling: "",
    grading: "轻微冷调",
    confidence: 0.92
  },
  cmfAnalysis: {
    summary: "主体采用低饱和冷灰金属 CMF，细拉丝与受控哑光降低镜面干扰。",
    colorSystem: {
      roles: [{
        role: "主体色",
        description: "中性偏冷银灰",
        measuredHexCandidates: ["#A8ADB2"],
        pantoneCandidates: [{
          name: "Cool Gray 6",
          coatedOrUncoated: "C",
          rationale: "仅按屏幕色与明度进行视觉近似",
          confidence: 0.46
        }],
        estimatedImageProportion: 0.34,
        locations: ["容器侧壁", "顶盖"],
        confidence: 0.86
      }],
      hierarchy: "银灰主体为第一视觉层级",
      harmony: "中性色阶",
      temperature: "中性偏冷",
      saturation: "低饱和",
      contrast: "主体与背景形成中等明度对比",
      distribution: "银灰集中于画面中央",
      interaction: "柔和高光强化圆柱曲率",
      backgroundInfluence: "浅灰背景可能抬高主体暗部的感知明度",
      reproductionRisks: ["不同屏幕白点会改变冷暖感知"],
      confidence: 0.84
    },
    materialZones: [{
      element: "容器侧壁",
      locations: ["主体中部"],
      visibleCues: ["连续金属高光", "细密方向纹理"],
      likelyMaterialFamilies: ["铝合金", "不锈钢"],
      texture: "细拉丝",
      apparentHardness: "硬质",
      translucency: "不透明",
      reflectance: "中低强度定向反射",
      constructionClues: ["侧壁连续成形"],
      unknowns: ["真实合金牌号", "壁厚"],
      confidence: 0.72
    }],
    finishZones: [{
      element: "容器侧壁",
      glossLevel: "哑光至半哑光",
      apparentRoughness: "细微粗糙",
      textureScale: "细尺度",
      coatingOrPlatingClues: ["无可确认涂层边界"],
      edgeTreatment: "边缘转折清晰",
      patternDirection: "竖向拉丝",
      visibleWearState: "未见明确划痕或指纹",
      unknowns: ["表面涂层体系"],
      confidence: 0.76
    }],
    interfaces: [{
      fromElement: "顶盖",
      toElement: "主体侧壁",
      boundaryType: "水平接缝",
      transitionDescription: "窄缝分隔两段金属表面",
      hardwareRelationship: "未见独立五金",
      confidence: 0.8
    }],
    durabilityAndAging: [{
      category: "划痕与指纹",
      affectedElements: ["容器侧壁"],
      visibleEvidence: ["大面积均匀哑光表面"],
      risk: "实际耐刮与抗指纹能力无法由图片确认",
      unknowns: ["耐磨等级", "抗指纹涂层"],
      confidence: 0.35
    }],
    relatedReferences: {
      sourcePageUrl: "",
      productSearches: [{
        label: "哑光银灰圆柱容器",
        query: "matte silver cylindrical container brushed metal",
        searchUrl: "",
        matchedCmfFeatures: ["银灰", "细拉丝", "圆柱体"],
        relevance: "用于查找相近 CMF 产品",
        confidence: 0.68
      }],
      componentSearches: [{
        label: "金属圆形顶盖",
        query: "brushed metal round container lid component",
        searchUrl: "",
        matchedCmfFeatures: ["薄圆盘", "水平接缝"],
        relevance: "用于查找相近顶盖结构",
        confidence: 0.61
      }]
    },
    evidenceBoundary: {
      observed: ["主体为银灰色", "侧壁具有方向性细纹"],
      inferred: ["材料可能为铝合金或不锈钢"],
      unknown: ["Pantone 实体色号", "材料牌号", "涂层配方"],
      overallConfidence: 0.74
    }
  },
  lighting: {
    sourceCount: 1,
    direction: "左上方",
    quality: "柔光",
    colorTemperature: "中性",
    exposure: "正常",
    shadows: "柔和短阴影",
    highlights: "受控高光",
    atmosphere: "清洁",
    timeOfDay: "",
    confidence: 0.82
  },
  camera: {
    shotType: "产品中景",
    angle: "平视",
    estimatedFocalLength: "",
    estimatedAperture: "",
    depthOfField: "主体整体清晰",
    focus: "产品正面",
    distortion: "不明显",
    motion: "静止",
    confidence: 0.68
  },
  style: {
    medium: "摄影",
    genre: "电商产品图",
    era: "当代",
    mood: "克制",
    references: [],
    postProcessing: ["背景净化", "受控锐化"],
    confidence: 0.9
  },
  materials: [{
    element: "容器",
    material: "金属",
    surface: "哑光",
    microTexture: "细微拉丝",
    opticalProperties: ["低强度镜面反射"],
    confidence: 0.88
  }],
  typography: {
    present: false,
    text: [],
    typeStyle: "",
    placement: "",
    confidence: 1
  },
  reconstruction: {
    positivePrompt: "Centered studio product photo of a matte silver cylindrical container on a seamless light gray background, soft key light from upper left, controlled highlights, clean neutral styling",
    negativePrompt: "text, logo, clutter, harsh shadow, distorted geometry",
    aspectRatio: "1:1",
    mustPreserve: ["圆柱比例", "银灰哑光材质"],
    flexibleElements: ["背景灰度"],
    unknowns: ["真实焦段", "真实光圈"],
    fidelityNotes: ["保持主体边缘笔直"]
  },
  confidence: {
    overall: 0.87,
    observedFacts: ["主体为银灰色圆柱容器"],
    inferredDetails: ["可能使用左上方柔光箱"],
    uncertainDetails: ["无法从单张图片确认真实焦段"]
  }
};

describe("VisualAnalysisSchema", () => {
  it("accepts a complete structured analysis", () => {
    expect(VisualAnalysisSchema.parse(validAnalysis).title).toBe("工作室产品摄影");
  });

  it("rejects out-of-range confidence values", () => {
    expect(() => VisualAnalysisSchema.parse({
      ...validAnalysis,
      confidence: { ...validAnalysis.confidence, overall: 1.2 }
    })).toThrow();
  });

  it("rejects out-of-range orthographic view confidence", () => {
    expect(() => VisualAnalysisSchema.parse({
      ...validAnalysis,
      orthographicPlan: {
        ...validAnalysis.orthographicPlan,
        viewConfidence: { ...validAnalysis.orthographicPlan.viewConfidence, top: -0.1 }
      }
    })).toThrow();
  });

  it("rejects fields outside the contract", () => {
    expect(() => VisualAnalysisSchema.parse({ ...validAnalysis, inventedCameraBrand: "Example" })).toThrow();
  });

  it("requires alternative explanations for form lineage hypotheses", () => {
    const hypothesis = validAnalysis.designIntelligence.formLineageHypotheses[0];
    expect(() => VisualAnalysisSchema.parse({
      ...validAnalysis,
      designIntelligence: {
        ...validAnalysis.designIntelligence,
        formLineageHypotheses: [{ ...hypothesis, alternativeExplanation: undefined }]
      }
    })).toThrow();
  });

  it("partitions every top-level field between the parallel analysis schemas", () => {
    const completeKeys = Object.keys(VisualAnalysisSchema.shape).sort();
    const coreKeys = Object.keys(VisualAnalysisCoreSchema.shape);
    const designKeys = Object.keys(VisualAnalysisDesignSchema.shape);
    const cmfKeys = Object.keys(VisualAnalysisCmfSchema.shape);

    expect(coreKeys.filter((key) => cmfKeys.includes(key))).toEqual([]);
    expect(coreKeys.filter((key) => designKeys.includes(key))).toEqual([]);
    expect(designKeys.filter((key) => cmfKeys.includes(key))).toEqual([]);
    expect([...coreKeys, ...designKeys, ...cmfKeys].sort()).toEqual(completeKeys);
  });
});
