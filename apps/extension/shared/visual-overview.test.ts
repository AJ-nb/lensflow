import { describe, expect, it } from "vitest";
import { VisualOverviewSchema } from "./visual-overview";

const fixture = {
  title: "克制的圆柱容器",
  summary: "圆柱主体通过薄顶盖形成清晰层级。",
  domain: "工业设计",
  primarySubject: "金属容器",
  visualIntent: "表达精密和洁净",
  learningValue: "用最少体块建立清晰产品层级",
  formSnapshot: { silhouette: "竖向圆柱", primaryVolumes: ["圆柱主体"], structureCues: ["顶盖接缝"] },
  designLanguage: [{ term: "克制几何", evidence: ["低装饰轮廓"], effect: "稳定", confidence: 0.9 }],
  designTechniques: [{ technique: "比例分层", evidence: ["薄顶盖"], transferableRule: "用比例建立层级", confidence: 0.8 }],
  cmfSnapshot: { colorRoles: ["银灰主体"], materialCues: ["金属反射"], finishCues: ["细拉丝"] },
  designDna: [{ mechanism: "薄顶盖与高主体的比例反差", evidence: ["薄顶盖"], variableToExplore: "改变顶盖厚度", confidence: 0.83 }],
  recommendedDeepDives: ["造型 DNA", "CMF 与耐久"],
  biggestUnknown: "顶盖的真实开启方式",
  confidence: { overall: 0.82, observed: ["圆柱轮廓"], inferred: ["金属"], unknown: ["真实材种"] }
};

describe("VisualOverviewSchema", () => {
  it("accepts the compact preview contract", () => {
    expect(VisualOverviewSchema.parse(fixture).designTechniques).toHaveLength(1);
  });

  it("rejects confidence outside the evidence range", () => {
    expect(() => VisualOverviewSchema.parse({ ...fixture, confidence: { ...fixture.confidence, overall: 2 } })).toThrow();
  });
});
