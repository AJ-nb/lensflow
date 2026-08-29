import { describe, expect, it } from "vitest";
import { assertCompleteScreenshotCrop, dataUrlToBlob, formatImageReadError, rgbToCmyk, sha256Blob } from "./image";

describe("sha256Blob", () => {
  it("hashes the original bytes deterministically", async () => {
    const digest = await sha256Blob(new Blob(["visual-lens"], { type: "text/plain" }));
    expect(digest).toBe("32fed70c48f5760d429e27c0b181819fc03895268095b104193e49dd9cf91e17");
  });

  it("decodes data URLs without a network fetch", async () => {
    const blob = await dataUrlToBlob("data:text/plain;base64,dmlzdWFsLWxlbnM=");
    expect(await blob.text()).toBe("visual-lens");
  });

  it("turns opaque source failures into an actionable Chinese error", () => {
    const message = formatImageReadError(new TypeError("Failed to fetch"));
    expect(message).toContain("IMAGE_SOURCE_UNREADABLE");
    expect(message).toContain("上传本地图片");
    expect(message).not.toBe("Failed to fetch");
  });

  it("refuses a screenshot fallback when the web image is only partly visible", () => {
    expect(() => assertCompleteScreenshotCrop({
      x: 0, y: -20, width: 600, height: 900, devicePixelRatio: 1, fullyVisible: false
    })).toThrow("WEB_IMAGE_PARTIALLY_VISIBLE");
  });

  it("refuses a screenshot fallback when CSS cover has cropped the image", () => {
    expect(() => assertCompleteScreenshotCrop({
      x: 0, y: 0, width: 600, height: 300, devicePixelRatio: 1, fullyVisible: true, contentMayBeCropped: true
    })).toThrow("WEB_IMAGE_CSS_CROPPED");
  });

  it("converts measured RGB values to deterministic CMYK percentages", () => {
    expect(rgbToCmyk({ r: 255, g: 0, b: 0 })).toEqual({ c: 0, m: 100, y: 100, k: 0 });
    expect(rgbToCmyk({ r: 0, g: 0, b: 0 })).toEqual({ c: 0, m: 0, y: 0, k: 100 });
  });
});
