import { describe, expect, it } from "vitest";
import {
  clampNormalizedRect,
  createCroppedImageSource,
  normalizedRectFromPoints,
  normalizedRectStyle,
  normalizedRectToPixels,
  restoreOriginalImageSource
} from "./workbench";
import type { ImageSource, SubjectCrop } from "../shared/types";

describe("design workbench geometry", () => {
  it("normalizes a reverse drag into a top-left rectangle", () => {
    expect(normalizedRectFromPoints({ x: 0.8, y: 0.7 }, { x: 0.2, y: 0.1 })).toEqual({
      x: 0.2,
      y: 0.1,
      width: 0.6000000000000001,
      height: 0.6
    });
  });

  it("clamps regions to image bounds", () => {
    expect(clampNormalizedRect({ x: -0.2, y: 0.9, width: 1.4, height: 0.5 })).toEqual({
      x: 0,
      y: 0.9,
      width: 1,
      height: 0.09999999999999998
    });
  });

  it("maps normalized rectangles to stable pixel crops and percentage styles", () => {
    const rect = { x: 0.1, y: 0.2, width: 0.5, height: 0.25 };
    expect(normalizedRectToPixels(rect, 1000, 800)).toEqual({ x: 100, y: 160, width: 500, height: 200 });
    expect(normalizedRectStyle(rect)).toEqual({ left: "10%", top: "20%", width: "50%", height: "25%" });
  });

  it("preserves the first original across repeated crops and restores it", () => {
    const original: ImageSource = {
      id: "original",
      kind: "web",
      url: "https://example.com/image.jpg",
      pageUrl: "https://example.com/product",
      pageTitle: "产品页",
      fileName: "product.jpg"
    };
    const crop: SubjectCrop = {
      id: "crop-1",
      rect: { x: 0.1, y: 0.1, width: 0.8, height: 0.8 },
      sourceWidth: 1000,
      sourceHeight: 800,
      outputWidth: 800,
      outputHeight: 640,
      createdAt: "2026-08-12T00:00:00.000Z"
    };
    const first = createCroppedImageSource(original, "data:image/jpeg;base64,ORIGINAL", "data:image/png;base64,FIRST", crop);
    const second = createCroppedImageSource(first, first.dataUrl!, "data:image/png;base64,SECOND", { ...crop, id: "crop-2" });

    expect(second.originalSource?.dataUrl).toBe("data:image/jpeg;base64,ORIGINAL");
    expect(second.originalSource?.pageUrl).toBe("https://example.com/product");
    expect(second.fileName).toBe("crop-product.jpg");

    const restored = restoreOriginalImageSource(second);
    expect(restored).toMatchObject({
      kind: "web",
      url: "https://example.com/image.jpg",
      dataUrl: "data:image/jpeg;base64,ORIGINAL",
      pageUrl: "https://example.com/product",
      fileName: "product.jpg"
    });
    expect(restored?.subjectCrop).toBeUndefined();
    expect(restored?.originalSource).toBeUndefined();
  });

  it("does not offer restoration for an uncropped source", () => {
    expect(restoreOriginalImageSource({ id: "plain", kind: "upload", dataUrl: "data:image/png;base64,AA==" })).toBeNull();
  });
});
