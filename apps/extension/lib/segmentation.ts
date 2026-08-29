import type { InteractiveSegmenterLegacy } from "@mediapipe/tasks-vision";
import type { SubjectSegmentation } from "../shared/types";

let segmenterPromise: Promise<InteractiveSegmenterLegacy> | null = null;

export async function segmentSelectedSubject(
  image: HTMLImageElement,
  point: { x: number; y: number },
  threshold = 0.5
): Promise<SubjectSegmentation> {
  const segmenter = await getSegmenter();
  const result = segmenter.segment(image, { keypoint: point });
  const mask = result.confidenceMasks?.[0];
  if (!mask) throw new Error("本地主体分区模型没有返回遮罩。");
  const maskWidth = mask.width;
  const maskHeight = mask.height;
  const values = mask.getAsFloat32Array();
  const rendered = renderConfidenceMask(values, maskWidth, maskHeight, threshold);
  mask.close();
  result.categoryMask?.close();
  result.confidenceMasks?.slice(1).forEach((item) => item.close());
  return {
    maskDataUrl: rendered.dataUrl,
    point,
    threshold,
    coverage: rendered.coverage,
    maskWidth,
    maskHeight,
    processedAt: new Date().toISOString(),
    evidenceBoundary: "model-estimate"
  };
}

export function createBinaryMask(values: ArrayLike<number>, threshold: number): { alpha: Uint8ClampedArray; coverage: number } {
  const safeThreshold = Math.max(0, Math.min(1, threshold));
  const alpha = new Uint8ClampedArray(values.length);
  let selected = 0;
  for (let index = 0; index < values.length; index += 1) {
    const active = (values[index] ?? 0) >= safeThreshold;
    alpha[index] = active ? 255 : 0;
    if (active) selected += 1;
  }
  return { alpha, coverage: values.length ? selected / values.length : 0 };
}

function renderConfidenceMask(values: Float32Array, width: number, height: number, threshold: number) {
  const { alpha, coverage } = createBinaryMask(values, threshold);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("无法创建主体分区遮罩画布。");
  const imageData = context.createImageData(width, height);
  for (let index = 0; index < alpha.length; index += 1) {
    const offset = index * 4;
    imageData.data[offset] = 15;
    imageData.data[offset + 1] = 118;
    imageData.data[offset + 2] = 110;
    imageData.data[offset + 3] = alpha[index] ? 150 : 0;
  }
  context.putImageData(imageData, 0, 0);
  return { dataUrl: canvas.toDataURL("image/png"), coverage };
}

async function getSegmenter(): Promise<InteractiveSegmenterLegacy> {
  if (!segmenterPromise) {
    segmenterPromise = (async () => {
      const root = extensionAssetUrl("vendor/vision/wasm");
      const originalConsoleError = console.error;
      console.error = (...values: unknown[]) => {
        const message = values.map(String).join(" ");
        if (message.includes("Created TensorFlow Lite XNNPACK delegate for CPU")) return;
        originalConsoleError(...values);
      };
      const fileset = {
        wasmLoaderPath: `${root}/vision_wasm_internal.js`,
        wasmBinaryPath: `${root}/vision_wasm_internal.wasm`
      };
      try {
        const { InteractiveSegmenterLegacy } = await import("@mediapipe/tasks-vision");
        return await InteractiveSegmenterLegacy.createFromOptions(fileset, {
          baseOptions: { modelAssetPath: extensionAssetUrl("vendor/vision/models/magic_touch.tflite") },
          outputConfidenceMasks: true,
          outputCategoryMask: false
        });
      } finally {
        console.error = originalConsoleError;
      }
    })();
  }
  return segmenterPromise;
}

function extensionAssetUrl(path: string): string {
  if (typeof browser !== "undefined" && browser.runtime?.getURL) return browser.runtime.getURL(path as never);
  return new URL(`/${path}`, window.location.origin).toString();
}
