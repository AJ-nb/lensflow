import { describe, expect, it } from "vitest";
import { createArchiveEagleMappings, createEagleAnnotation, getEagleWebsite, selectedEagleTags } from "./eagle-mapping";
import type { AnalysisArchiveRecord } from "./types";

function fixture(): AnalysisArchiveRecord {
  return {
    id: "record",
    generatedAt: "2026-08-12T00:00:00.000Z",
    updatedAt: "2026-08-12T00:00:00.000Z",
    title: "项圈结构参考",
    sha256: "a".repeat(64),
    model: "test-model",
    sourceLabel: "参考页",
    favorite: false,
    tags: [],
    result: {
      source: { id: "source", kind: "web", pageUrl: "https://example.com", fileName: "collar.png" },
      measured: {
        mimeType: "image/png",
        palette: [
          { hex: "#112233", proportion: 0.6, rgb: { r: 17, g: 34, b: 51 }, cmyk: { c: 67, m: 33, y: 0, k: 80 } },
          { hex: "#112233", proportion: 0.2, rgb: { r: 17, g: 34, b: 51 }, cmyk: { c: 67, m: 33, y: 0, k: 80 } }
        ]
      },
      analysis: {
        formStructure: { category: "项圈" },
        designIntelligence: {
          designLanguage: [{ term: "解构主义", visualEvidence: ["外露连接"] }],
          designTechniques: [{ technique: "结构外显", implementation: "将连接件作为视觉节点", transferableRule: "让连接承担视觉节奏" }],
          recommendedDirections: [{ directionType: "设计语言", name: "波普", rationale: "可强化图形层", transferableMechanisms: ["高纯度色块"], misuseRisk: "易盖过结构" }],
          referenceCandidates: [{ referenceType: "设计师", name: "示例设计师", evidenceType: "知识候选", relevance: "核验结构外显", verificationQueries: ["example designer exposed structure"] }]
        },
        cmfAnalysis: {
          colorSystem: { roles: [{ pantoneCandidates: [{ name: "PANTONE 2965", coatedOrUncoated: "C" }] }] },
          materialZones: [{ likelyMaterialFamilies: ["皮革", "皮革"] }],
          finishZones: [{ glossLevel: "半哑光" }]
        },
        confidence: { overall: 0.82, observedFacts: ["外露连接件"], inferredDetails: ["可能强调结构逻辑"], uncertainDetails: ["真实材料"] }
      }
    }
  } as unknown as AnalysisArchiveRecord;
}

describe("Eagle archive mapping", () => {
  it("defaults only measured and deterministic tags", () => {
    const mappings = createArchiveEagleMappings(fixture());
    expect(mappings.find((item) => item.target === "产品/项圈")?.selectedByDefault).toBe(false);
    expect(mappings.find((item) => item.target === "CMF/材料/皮革")?.selectedByDefault).toBe(false);
    expect(mappings.find((item) => item.target === "设计语言/解构主义")?.selectedByDefault).toBe(false);
    expect(mappings.find((item) => item.target === "设计手法/结构外显")?.evidence).toBe("分析候选");
    expect(mappings.find((item) => item.target === "设计建议/设计语言/波普")?.evidence).toBe("知识候选");
    expect(mappings.find((item) => item.target === "CMF/颜色/#112233")?.selectedByDefault).toBe(true);
    expect(mappings.filter((item) => item.target === "CMF/颜色/#112233")).toHaveLength(1);
  });

  it("creates a design-learning annotation and resolves a real source website", () => {
    const record = fixture();
    const annotation = createEagleAnnotation(record);
    expect(getEagleWebsite(record)).toBe("https://example.com");
    expect(annotation).toContain("设计摘要\n产品：项圈结构参考 / 项圈");
    expect(annotation).toContain("核心设计语言：解构主义");
    expect(annotation).toContain("关键设计手法：结构外显");
    expect(annotation).toContain("颜色：#112233 / RGB 17,34,51 / CMYK 67,33,0,80");
    expect(annotation).toContain("潘通候选：PANTONE 2965 C（需实体色样验证）");
    expect(annotation).toContain("建议探索\n1. 设计语言「波普」");
    expect(annotation).toContain("参考候选\n1. 设计师「示例设计师」");
    expect(annotation).toContain("证据边界\n观察：外露连接件");
    expect(annotation).toContain("来源：https://example.com");
    expect(annotation).toContain("砚台置信度：82%");
    expect(annotation).not.toContain("SHA-256");
    expect(annotation).not.toContain("检索：");
  });

  it("returns unique tags for checked mappings", () => {
    const mappings = createArchiveEagleMappings(fixture());
    const selected = mappings.filter((item) => item.selectedByDefault).map((item) => item.id);
    expect(selectedEagleTags(mappings, selected)).toEqual(expect.arrayContaining([
      "同步/砚台",
      "文件/PNG",
      "来源/网页"
    ]));
    expect(selectedEagleTags(mappings, selected)).not.toContain("产品/项圈");
  });

  it("keeps legacy records importable when newer evidence fields are missing", () => {
    const record = fixture();
    delete (record.result.analysis.designIntelligence as Partial<typeof record.result.analysis.designIntelligence>).evidenceBoundary;
    delete (record.result.analysis as Partial<typeof record.result.analysis>).cmfAnalysis;
    record.result.analysis.confidence = { observedFacts: [], uncertainDetails: [] } as unknown as typeof record.result.analysis.confidence;
    expect(() => createArchiveEagleMappings(record)).not.toThrow();
    expect(createEagleAnnotation(record)).toContain("砚台置信度：未记录");
  });
});
