import { describe, expect, it } from "vitest";
import { buildEvidenceAnchors, buildEvidenceLinks } from "./evidence";
import type { AnalysisResult } from "./types";

describe("evidence anchors", () => {
  it("preserves only real local coordinates and provenance", () => {
    const anchors = buildEvidenceAnchors({
      materialRegions: [{
        id: "metal", name: "金属扣件", materialFamily: "金属", finish: "拉丝", colorHex: "#999999",
        note: "", rect: { x: 0.1, y: 0.2, width: 0.3, height: 0.4 }, createdAt: "2026-08-13"
      }],
      subjectSegmentation: {
        maskDataUrl: "data:image/png;base64,AA==", point: { x: 0.5, y: 0.5 }, threshold: 0.5,
        coverage: 0.72, maskWidth: 10, maskHeight: 10, processedAt: "2026-08-13", evidenceBoundary: "model-estimate"
      }
    });
    expect(anchors[0]).toMatchObject({ id: "material:metal", provenance: "user-annotation", rect: { x: 0.1 } });
    expect(anchors[1]).toMatchObject({ id: "subject:mask", provenance: "model-estimate" });
    expect(anchors[1]).not.toHaveProperty("rect");
  });

  it("links claims only when their text explicitly names an anchor", () => {
    const result = {
      analysis: {
        designIntelligence: {
          designLanguage: [{ term: "工业语言", visualEvidence: ["金属扣件形成硬质节点"] }],
          designTechniques: [{ technique: "层级对比", evidence: ["主体轮廓清晰"] }]
        },
        cmfAnalysis: { materialZones: [] }
      }
    } as unknown as AnalysisResult;
    const anchors = buildEvidenceAnchors({
      materialRegions: [{
        id: "metal", name: "金属扣件", materialFamily: "金属", finish: "拉丝", colorHex: "#999999",
        note: "", rect: { x: 0.1, y: 0.2, width: 0.3, height: 0.4 }, createdAt: "2026-08-13"
      }]
    });
    const links = buildEvidenceLinks(result, anchors);
    expect(links[0]?.evidenceAnchorIds).toEqual(["material:metal"]);
    expect(links[1]?.evidenceAnchorIds).toEqual([]);
  });
});
