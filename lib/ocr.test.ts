import { describe, expect, it } from "vitest";
import { extractOcrLines, normalizeOcrLine } from "./ocr";

describe("OCR coordinate normalization", () => {
  it("normalizes text lines into image-relative coordinates", () => {
    expect(normalizeOcrLine("  视觉   透镜  ", 86, { x0: 20, y0: 10, x1: 120, y1: 40 }, 200, 100)).toEqual({
      text: "视觉 透镜",
      confidence: 0.86,
      rect: { x: 0.1, y: 0.1, width: 0.5, height: 0.3 }
    });
  });

  it("drops empty lines", () => {
    expect(normalizeOcrLine("   ", 50, { x0: 0, y0: 0, x1: 1, y1: 1 }, 10, 10)).toBeNull();
  });

  it("uses the image dimensions instead of stretching to the last text edge", () => {
    const blocks = [{
      paragraphs: [{ lines: [{ text: "左侧文字", confidence: 90, bbox: { x0: 10, y0: 10, x1: 60, y1: 30 } }] }]
    }] as never;
    expect(extractOcrLines(blocks, "", 200, 100)[0]?.rect).toEqual({
      x: 0.05,
      y: 0.1,
      width: 0.25,
      height: 0.2
    });
  });
});
