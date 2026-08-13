import { describe, expect, it } from "vitest";
import { countSvgLayers, createLayeredSvg } from "./svg";

describe("layered SVG export", () => {
  it("escapes editable labels and separates design evidence into groups", () => {
    const svg = createLayeredSvg({
      imageDataUrl: "data:image/png;base64,AA==",
      width: 100,
      height: 50,
      title: "A&B <测试>",
      materialRegions: [{
        id: "region",
        name: "皮革 & 金属",
        materialFamily: "复合<材料>",
        finish: "哑光",
        colorHex: "#E4572E",
        note: "",
        rect: { x: 0.1, y: 0.2, width: 0.4, height: 0.5 },
        createdAt: "2026-01-01"
      }]
    });
    expect(svg).toContain("A&amp;B &lt;测试&gt;");
    expect(svg).toContain('id="source-image"');
    expect(svg).toContain('id="material-regions"');
    expect(svg).toContain('data-material="复合&lt;材料&gt;"');
    expect(countSvgLayers(svg)).toBeGreaterThanOrEqual(5);
  });
});
