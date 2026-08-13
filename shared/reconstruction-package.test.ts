import { unzipSync } from "fflate";
import { describe, expect, it } from "vitest";
import type { AnalysisResult, ImageSource } from "./types";
import { assessReconstructionReadiness, buildObjectSculptSpecSeed, createReconstructionPackage } from "./reconstruction-package";

const source: ImageSource = { id: "source-1", kind: "upload", fileName: "object.png" };
const imageDataUrl = "data:image/png;base64,iVBORw0KGgo=";

function makeResult(): AnalysisResult {
  return {
    schemaVersion: "1.2", stage: "complete", generatedAt: "2026-08-13T00:00:00.000Z", model: "gpt-5.6-sol", source,
    reconstructionDirective: "", previewDataUrl: imageDataUrl,
    measured: { width: 1600, height: 1200, aspectRatio: "4:3", sha256: "a".repeat(64), orientation: "landscape", mimeType: "image/png", palette: [{ hex: "#336699", rgb: { r: 51, g: 102, b: 153 }, cmyk: { c: 67, m: 33, y: 0, k: 40 }, oklch: { l: 0.5, c: 0.1, h: 250 }, proportion: 1, population: 100, isDark: true, textColor: "#ffffff" }] },
    analysis: {
      title: "测试物体", description: "验证交接", visualIntent: "结构复刻",
      designIntelligence: { domain: "工业产品", designLanguage: [{ term: "几何", visualEvidence: ["矩形主体"], effect: "稳定", confidence: 0.8 }], designTechniques: [], formLineageHypotheses: [], analogousStrategies: [], transferablePrinciples: [], recommendedDirections: [], referenceCandidates: [], learningBrief: { learningValue: "", signatureMechanisms: [], decisionTradeoffs: [], studyExercise: { brief: "", constraintsToKeep: [], variablesToChange: [], successCriteria: [], evidenceToCollect: [] }, recommendedDeepDives: [] }, evidenceBoundary: { observed: [], inferred: [], unknown: [], overallConfidence: 0.8 } },
      subject: { primary: "机械物体", count: 1, attributes: [], poseOrState: "静止", expression: "", wardrobeOrStyling: [], secondaryObjects: [], confidence: 0.9 },
      sceneStructure: { sceneType: "产品图", foreground: [], midground: [], background: [], spatialRelationships: [], occlusions: [], focalPoints: [], negativeSpace: "", geometricStructure: [], confidence: 0.9 },
      formStructure: { category: "机械产品", overallSilhouette: "楔形", primaryVolumes: ["主体", "握持部", "前端"], secondaryVolumes: ["按钮", "底座"], proportionRelationships: ["2:1"], axesAndSymmetry: "近似对称", edgesAndTransitions: ["圆角"], openingsAndCutouts: [], jointsAndConnections: ["主体连接底座"], surfaceContinuity: [], frontViewCues: [], sideViewCues: [], topViewCues: [], hiddenGeometryAssumptions: ["背面未知"], manufacturabilityNotes: [], confidence: 0.85 },
      orthographicPlan: { canonicalOrientation: "长轴水平", frontDefinition: "操作面", leftDefinition: "左侧", topDefinition: "顶部", coordinateAxes: { widthAxis: "X", heightAxis: "Y", depthAxis: "Z" }, sharedScaleBasis: "总长度", estimatedDimensionRatios: ["2:1:0.8"], crossViewLandmarks: ["前端", "后端", "顶部"], alignmentConstraints: ["宽度一致"], inferredSurfaceTreatment: "最简单延伸", viewConfidence: { front: 0.82, left: 0.7, top: 0.68 } },
      composition: { layout: "", subjectPlacement: "", crop: "", balance: "", symmetry: "", leadingLines: "", perspective: "", depth: "", confidence: 0.8 },
      colorAnalysis: { harmony: "单色", temperature: "冷", saturation: "中", contrast: "中", distribution: "主体", backgroundColorRole: "分离", accentColorRole: "", skinToneHandling: "", grading: "中性", confidence: 0.8 },
      cmfAnalysis: { summary: "", colorSystem: { roles: [], hierarchy: "", harmony: "", temperature: "", saturation: "", contrast: "", distribution: "", interaction: "", backgroundInfluence: "", reproductionRisks: [], confidence: 0.8 }, materialZones: [{ element: "主体", locations: [], visibleCues: ["哑光"], likelyMaterialFamilies: ["塑料"], texture: "细纹", apparentHardness: "硬", translucency: "不透明", reflectance: "低", constructionClues: [], unknowns: [], confidence: 0.7 }], finishZones: [], interfaces: [], durabilityAndAging: [], relatedReferences: { sourcePageUrl: "", productSearches: [], componentSearches: [] }, evidenceBoundary: { observed: [], inferred: [], unknown: [], overallConfidence: 0.7 } },
      lighting: { sourceCount: 1, direction: "", quality: "", colorTemperature: "", exposure: "", shadows: "", highlights: "", atmosphere: "", timeOfDay: "", confidence: 0.8 },
      camera: { shotType: "", angle: "", estimatedFocalLength: "", estimatedAperture: "", depthOfField: "", focus: "", distortion: "", motion: "", confidence: 0.8 },
      style: { medium: "摄影", genre: "产品", era: "当代", mood: "", references: [], postProcessing: [], confidence: 0.8 },
      materials: [], typography: { present: false, text: [], typeStyle: "", placement: "", confidence: 1 }, reconstruction: { positivePrompt: "object", negativePrompt: "distortion", aspectRatio: "4:3", mustPreserve: [], flexibleElements: [], unknowns: [], fidelityNotes: [] },
      confidence: { overall: 0.85, observedFacts: ["主体完整", "轮廓清楚", "接缝可见", "材质分区清楚", "背景分离", "按钮可见"], inferredDetails: [], uncertainDetails: ["背面未知"] }
    }
  };
}

describe("img2threejs handoff", () => {
  it("does not present single-image evidence as reconstruction ready", () => {
    expect(assessReconstructionReadiness(makeResult()).level).not.toBe("ready");
  });

  it("builds a current schema 1.2 manifest and deterministic spec seed", () => {
    const seed = buildObjectSculptSpecSeed({ result: makeResult(), source, sourceDataUrl: imageDataUrl });
    expect(seed.schemaVersion).toBe("2.1");
    expect(seed.componentTree).toHaveLength(3);
    expect(seed.preSpecAssessment.unknownsToResolveBeforeImplementation).toContain("背面未知");
  });

  it("packages analysis, evidence, source, seed, UTF-8 launcher and instructions", () => {
    const files = unzipSync(createReconstructionPackage({ result: makeResult(), source, sourceDataUrl: imageDataUrl }));
    expect(Object.keys(files).sort()).toEqual([
      "README.md",
      "analysis/evidence.json",
      "analysis/palette.json",
      "analysis/visual-lens-analysis.json",
      "assessment/visual-lens-seed.json",
      "manifest.json",
      "reference/source-image.png",
      "run-windows.cmd"
    ]);
    expect(new TextDecoder().decode(files["manifest.json"])).toContain("early procedural blockout, not manufacturing CAD");
    expect(new TextDecoder().decode(files["run-windows.cmd"])).toContain("PYTHONUTF8=1");
  });
});
