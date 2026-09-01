import { strToU8, zipSync } from "fflate";
import type { AnalysisResult, ImageSource, ReferenceImage } from "./types";

export type ReconstructionReadinessLevel = "ready" | "conditional" | "needs-input";

export interface ReconstructionReadiness {
  level: ReconstructionReadinessLevel;
  score: number;
  label: string;
  summary: string;
  evidence: string[];
  risks: string[];
  missingViews: string[];
  nextActions: string[];
}

export interface ReconstructionPackageInput {
  result: AnalysisResult;
  source: ImageSource;
  sourceDataUrl: string;
  references?: ReferenceImage[];
  editedDataUrl?: string;
}

export function assessReconstructionReadiness(
  result: AnalysisResult,
  references: ReferenceImage[] = result.references ?? []
): ReconstructionReadiness {
  const { analysis, measured } = result;
  const views = analysis.orthographicPlan.viewConfidence;
  const viewAverage = (views.front + views.left + views.top) / 3;
  const structuralEvidence = Math.min(1, (
    analysis.formStructure.primaryVolumes.length
    + analysis.formStructure.secondaryVolumes.length
    + analysis.orthographicPlan.crossViewLandmarks.length
  ) / 10);
  const observedScore = Math.min(1, analysis.confidence.observedFacts.length / 6);
  const resolutionScore = Math.min(1, Math.min(measured.width, measured.height) / 1024);
  const realViewKinds = new Set(references.filter((item) => item.provenance !== "generated").map((item) => item.viewKind));
  const realViewScore = Math.min(1, realViewKinds.size / 3);
  const uncertaintyPenalty = Math.min(0.24, analysis.confidence.uncertainDetails.length * 0.035);
  const score = clamp(
    analysis.formStructure.confidence * 0.23
    + viewAverage * 0.25
    + structuralEvidence * 0.17
    + observedScore * 0.1
    + resolutionScore * 0.1
    + realViewScore * 0.15
    - uncertaintyPenalty
  );
  const missingViews = [
    !realViewKinds.has("front") ? "正面" : "",
    !realViewKinds.has("left") && !realViewKinds.has("right") ? "侧面" : "",
    !realViewKinds.has("top") ? "俯视" : "",
    !realViewKinds.has("back") ? "背面" : ""
  ].filter(Boolean);
  const risks = [
    ...analysis.formStructure.hiddenGeometryAssumptions,
    ...analysis.confidence.uncertainDetails
  ].filter(Boolean).slice(0, 8);
  const evidence = [
    `${measured.width} x ${measured.height} 像素，${measured.aspectRatio}`,
    `${analysis.formStructure.primaryVolumes.length} 个主体体块，${analysis.formStructure.secondaryVolumes.length} 个次级体块`,
    `${analysis.orthographicPlan.crossViewLandmarks.length} 个跨视图地标`,
    `${realViewKinds.size} 类真实补充视图，${references.filter((item) => item.provenance === "generated").length} 张 AI 生成参考`
  ];

  if (score >= 0.74 && missingViews.length <= 1 && risks.length <= 3) {
    return {
      level: "ready", score, label: "可进入程序化体块重建",
      summary: "现有证据足以建立第一版 Three.js 体块，但仍需多角度轮廓校核。",
      evidence, risks, missingViews,
      nextActions: ["导出交接包", "运行 img2threejs intake 与 spec 校验", "用多角度渲染检查轮廓和连接"]
    };
  }
  if (score >= 0.48 && views.front >= 0.5) {
    return {
      level: "conditional", score, label: "可做低精度体块，需补证据",
      summary: "可以先建立受约束的低精度体块；不可见面和 AI 三视图不能作为准确结构。",
      evidence, risks, missingViews,
      nextActions: [missingViews.length ? `优先补拍：${missingViews.slice(0, 3).join("、")}` : "补充尺寸基准", "逐项核对跨视图地标", "接受推断边界后再进入细化"]
    };
  }
  return {
    level: "needs-input", score, label: "暂不建议开始 3D 重建",
    summary: "现有图片不足以稳定约束三维结构，直接生成会把猜测固化为模型。",
    evidence, risks, missingViews,
    nextActions: ["提供完整主体、少遮挡的清晰图片", "补充正面、侧面和俯视真实参考", "增加一个可验证的尺寸基准"]
  };
}

export function buildReconstructionManifest(input: ReconstructionPackageInput) {
  const references = input.references ?? input.result.references ?? [];
  const readiness = assessReconstructionReadiness(input.result, references);
  const { analysis, measured } = input.result;
  return {
    schemaVersion: "1.2",
    generator: { name: "Lensflow", version: "0.3.1" },
    generatedAt: new Date().toISOString(),
    target: {
      name: analysis.title,
      primarySubject: analysis.subject.primary,
      intendedWorkflow: "img2threejs procedural Three.js reconstruction",
      outputBoundary: "early procedural blockout, not manufacturing CAD"
    },
    readiness,
    references: [
      { id: "primary", path: `reference/source-image${extensionForDataUrl(input.sourceDataUrl)}`, viewKind: "primary", provenance: "original", confidence: 1 },
      ...references.map((item, index) => ({
        id: item.id,
        path: `reference/additional/${String(index + 1).padStart(2, "0")}-${safeName(item.viewKind)}${extensionForDataUrl(item.source.dataUrl || "")}`,
        viewKind: item.viewKind,
        provenance: item.provenance,
        confidence: item.confidence
      }))
    ],
    geometryEvidence: {
      category: analysis.formStructure.category,
      silhouette: analysis.formStructure.overallSilhouette,
      primaryVolumes: analysis.formStructure.primaryVolumes,
      secondaryVolumes: analysis.formStructure.secondaryVolumes,
      proportions: analysis.formStructure.proportionRelationships,
      axesAndSymmetry: analysis.formStructure.axesAndSymmetry,
      edgesAndTransitions: analysis.formStructure.edgesAndTransitions,
      openingsAndCutouts: analysis.formStructure.openingsAndCutouts,
      jointsAndConnections: analysis.formStructure.jointsAndConnections,
      hiddenGeometryAssumptions: analysis.formStructure.hiddenGeometryAssumptions
    },
    orthographicEvidence: analysis.orthographicPlan,
    appearanceEvidence: {
      measured,
      colorAnalysis: analysis.colorAnalysis,
      cmfAnalysis: analysis.cmfAnalysis,
      materials: analysis.materials
    },
    designIntelligence: analysis.designIntelligence,
    evidence: {
      anchors: input.result.evidenceAnchors ?? [],
      claimLinks: input.result.evidenceLinks ?? [],
      boundary: analysis.confidence
    },
    qualityRules: [
      "Observed facts are evidence; inferred details are hypotheses.",
      "Generated orthographic sheets are hypotheses, not ground truth.",
      "Do not claim exact hidden geometry, scale, wall thickness, tolerances, or manufacturability from images.",
      "Run multi-angle silhouette review before adding local detail."
    ]
  };
}

export function buildObjectSculptSpecSeed(input: ReconstructionPackageInput) {
  const manifest = buildReconstructionManifest(input);
  const { analysis, measured } = input.result;
  const primary = measured.palette[0];
  return {
    targetName: analysis.title,
    targetId: safeName(analysis.title),
    schemaVersion: "2.1",
    sourceManifest: "manifest.json",
    preSpecAssessment: {
      objectClass: {
        primaryType: analysis.formStructure.category || "unassessed",
        primaryDomain: analysis.designIntelligence.domain || "object",
        formLanguage: analysis.designIntelligence.designLanguage.map((item) => item.term),
        structureKind: [analysis.formStructure.axesAndSymmetry, ...analysis.formStructure.edgesAndTransitions].filter(Boolean),
        materialFamilies: analysis.cmfAnalysis.materialZones.flatMap((item) => item.likelyMaterialFamilies),
        notes: "Seeded from Lensflow schema 1.2. Confirm every inferred value before implementation."
      },
      unknownsToResolveBeforeImplementation: [
        ...analysis.formStructure.hiddenGeometryAssumptions,
        ...analysis.confidence.uncertainDetails,
        ...manifest.readiness.missingViews.map((view) => `${view}真实参考缺失`)
      ]
    },
    componentTree: analysis.formStructure.primaryVolumes.map((name, index) => ({
      id: `macro-${index + 1}`,
      name,
      level: "macro",
      role: index === 0 ? "body" : "secondary-volume",
      parent: index === 0 ? null : "macro-1",
      primitive: "box",
      confidence: analysis.formStructure.confidence,
      topologyClass: "unassessed",
      evidenceRefs: ["manifest.json#/geometryEvidence/primaryVolumes"],
      dimensions: { units: "relative", width: 1, height: 1, depth: 1, confidence: 0 },
      transform: { position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
      notes: "Placeholder only. Derive dimensions and topology from admitted multi-view evidence."
    })),
    materials: analysis.cmfAnalysis.materialZones.map((zone, index) => ({
      id: `material-${index + 1}`,
      name: zone.element,
      type: "physical",
      color: primary?.hex ?? "#808080",
      roughness: 0.5,
      metalness: 0,
      confidence: zone.confidence,
      visibleCues: zone.visibleCues,
      likelyMaterialFamilies: zone.likelyMaterialFamilies,
      implementationStatus: "unassessed"
    })),
    qualityContract: {
      qualityBar: manifest.readiness.level === "ready" ? "blockout" : "evidence-intake",
      definitionOfDone: ["Match admitted silhouette, primary proportions, visible hierarchy and material boundaries without inventing hidden geometry."],
      mustNotDo: manifest.qualityRules
    }
  };
}

export function createReconstructionPackage(input: ReconstructionPackageInput): Uint8Array {
  const manifest = buildReconstructionManifest(input);
  const references = input.references ?? input.result.references ?? [];
  const files: Record<string, Uint8Array> = {
    "manifest.json": jsonBytes(manifest),
    "assessment/lensflow-seed.json": jsonBytes(buildObjectSculptSpecSeed(input)),
    "analysis/lensflow-analysis.json": jsonBytes({ ...input.result, previewDataUrl: undefined }),
    "analysis/palette.json": jsonBytes(input.result.measured.palette),
    "analysis/evidence.json": jsonBytes({ anchors: input.result.evidenceAnchors ?? [], links: input.result.evidenceLinks ?? [] }),
    [`reference/source-image${extensionForDataUrl(input.sourceDataUrl)}`]: dataUrlBytes(input.sourceDataUrl),
    "run-windows.cmd": strToU8(buildWindowsLauncher(
      input.result.analysis.title,
      `reference\\source-image${extensionForDataUrl(input.sourceDataUrl)}`
    ), true),
    "README.md": strToU8(buildReadme(manifest.readiness), true)
  };
  references.forEach((item, index) => {
    const dataUrl = item.source.dataUrl;
    if (!dataUrl) return;
    files[`reference/additional/${String(index + 1).padStart(2, "0")}-${safeName(item.viewKind)}${extensionForDataUrl(dataUrl)}`] = dataUrlBytes(dataUrl);
  });
  if (input.editedDataUrl) files["reference/edited-reference.png"] = dataUrlBytes(input.editedDataUrl);
  return zipSync(files, { level: 6 });
}

function buildReadme(readiness: ReconstructionReadiness): string {
  return `# Lensflow -> img2threejs 交接包

就绪度：${readiness.label}（${Math.round(readiness.score * 100)}%）

1. 先阅读 \`manifest.json\` 的证据边界和缺失视图。
2. \`assessment/lensflow-seed.json\` 是确定性种子，不是已验证的最终 ObjectSculptSpec。
3. Windows 运行前设置 \`PYTHONUTF8=1\`，避免中文 JSON 被系统默认编码误读。
4. AI 三视图是生成假设，不能替代真实视角、尺寸、不可见结构或制造数据。
5. 输出只适用于程序化 Three.js 早期体块和设计校核，不是可制造 CAD。
`;
}

function buildWindowsLauncher(targetName: string, sourcePath: string): string {
  const safeTarget = targetName.replace(/["\r\n]/g, " ");
  return [
    "@echo off",
    "setlocal",
    "set PYTHONUTF8=1",
    "if \"%IMG2THREEJS_ROOT%\"==\"\" set IMG2THREEJS_ROOT=vendor\\img2threejs",
    "if not exist \"%IMG2THREEJS_ROOT%\\forge\\stage1_intake\\probe_image.py\" (",
    "  echo Set IMG2THREEJS_ROOT to the vendored img2threejs directory.",
    "  exit /b 1",
    ")",
    `python "%IMG2THREEJS_ROOT%\\forge\\stage1_intake\\probe_image.py" ${sourcePath} > assessment\\source-probe.json`,
    `python "%IMG2THREEJS_ROOT%\\forge\\stage2_spec\\new_sculpt_spec.py" "${safeTarget}" --image ${sourcePath} --out assessment\\object-sculpt-spec.draft.json --force`,
    "echo Draft created. Review manifest.json and assessment\\lensflow-seed.json, then complete and validate the upstream ObjectSculptSpec.",
    "endlocal",
    ""
  ].join("\r\n");
}

function jsonBytes(value: unknown): Uint8Array {
  return strToU8(JSON.stringify(value, null, 2), true);
}

function dataUrlBytes(dataUrl: string): Uint8Array {
  const comma = dataUrl.indexOf(",");
  if (comma < 0) throw new Error("图片数据格式无效。");
  const metadata = dataUrl.slice(0, comma);
  const payload = dataUrl.slice(comma + 1);
  if (metadata.includes(";base64")) {
    const binary = atob(payload);
    return Uint8Array.from(binary, (character) => character.charCodeAt(0));
  }
  return strToU8(decodeURIComponent(payload), true);
}

function extensionForDataUrl(dataUrl: string): string {
  const mime = /^data:([^;,]+)/.exec(dataUrl)?.[1];
  if (mime === "image/jpeg") return ".jpg";
  if (mime === "image/webp") return ".webp";
  return ".png";
}

function safeName(value: string): string {
  return value.trim().toLocaleLowerCase().replace(/[^a-z0-9\u4e00-\u9fff]+/g, "-").replace(/^-|-$/g, "") || "object";
}

function clamp(value: number): number {
  return Math.min(1, Math.max(0, value));
}
