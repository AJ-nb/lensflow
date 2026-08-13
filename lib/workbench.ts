import type { ImageSource, NormalizedRect, OriginalImageSourceSnapshot, SubjectCrop } from "../shared/types";
import { dataUrlToBlob } from "./data-url";

export interface PixelCrop {
  x: number;
  y: number;
  width: number;
  height: number;
}

export function clampNormalizedRect(rect: NormalizedRect): NormalizedRect {
  const x = clamp(rect.x, 0, 1);
  const y = clamp(rect.y, 0, 1);
  return {
    x,
    y,
    width: clamp(rect.width, 0, 1 - x),
    height: clamp(rect.height, 0, 1 - y)
  };
}

export function normalizedRectFromPoints(
  start: { x: number; y: number },
  end: { x: number; y: number }
): NormalizedRect {
  return clampNormalizedRect({
    x: Math.min(start.x, end.x),
    y: Math.min(start.y, end.y),
    width: Math.abs(end.x - start.x),
    height: Math.abs(end.y - start.y)
  });
}

export function normalizedRectToPixels(rect: NormalizedRect, width: number, height: number): PixelCrop {
  const safe = clampNormalizedRect(rect);
  const x = Math.max(0, Math.floor(safe.x * width));
  const y = Math.max(0, Math.floor(safe.y * height));
  return {
    x,
    y,
    width: Math.max(1, Math.min(width - x, Math.round(safe.width * width))),
    height: Math.max(1, Math.min(height - y, Math.round(safe.height * height)))
  };
}

export function normalizedRectStyle(rect: NormalizedRect): Record<"left" | "top" | "width" | "height", string> {
  const safe = clampNormalizedRect(rect);
  return {
    left: `${safe.x * 100}%`,
    top: `${safe.y * 100}%`,
    width: `${safe.width * 100}%`,
    height: `${safe.height * 100}%`
  };
}

export function createCroppedImageSource(
  source: ImageSource,
  originalDataUrl: string,
  croppedDataUrl: string,
  subjectCrop: SubjectCrop
): ImageSource {
  const originalSource = source.originalSource ?? snapshotOriginalSource(source, originalDataUrl);
  return {
    ...source,
    id: crypto.randomUUID(),
    kind: "upload",
    url: undefined,
    dataUrl: croppedDataUrl,
    fileName: source.fileName?.startsWith("crop-")
      ? source.fileName
      : source.fileName ? `crop-${source.fileName}` : "subject-crop.png",
    subjectCrop,
    originalSource
  };
}

export function restoreOriginalImageSource(source: ImageSource): ImageSource | null {
  if (!source.originalSource) return null;
  return {
    ...source.originalSource,
    id: crypto.randomUUID()
  };
}

function snapshotOriginalSource(source: ImageSource, dataUrl: string): OriginalImageSourceSnapshot {
  const {
    id, kind, url, pageUrl, pageTitle, alt, fileName, tabId, windowId,
    crop, declaredWidth, declaredHeight
  } = source;
  return {
    id,
    kind,
    url,
    dataUrl,
    pageUrl,
    pageTitle,
    alt,
    fileName,
    tabId,
    windowId,
    crop,
    declaredWidth,
    declaredHeight
  };
}

export async function cropImageDataUrl(
  dataUrl: string,
  rect: NormalizedRect,
  aspect?: number
): Promise<{ dataUrl: string; rect: NormalizedRect; sourceWidth: number; sourceHeight: number; outputWidth: number; outputHeight: number }> {
  const bitmap = await createImageBitmap(await dataUrlToBlob(dataUrl));
  const crop = fitPixelCropToAspect(normalizedRectToPixels(rect, bitmap.width, bitmap.height), aspect);
  const canvas = document.createElement("canvas");
  canvas.width = crop.width;
  canvas.height = crop.height;
  const context = canvas.getContext("2d");
  if (!context) {
    bitmap.close();
    throw new Error("无法创建主体裁切画布。");
  }
  context.drawImage(bitmap, crop.x, crop.y, crop.width, crop.height, 0, 0, crop.width, crop.height);
  const sourceWidth = bitmap.width;
  const sourceHeight = bitmap.height;
  bitmap.close();
  return {
    dataUrl: canvas.toDataURL("image/png"),
    rect: {
      x: crop.x / sourceWidth,
      y: crop.y / sourceHeight,
      width: crop.width / sourceWidth,
      height: crop.height / sourceHeight
    },
    sourceWidth,
    sourceHeight,
    outputWidth: crop.width,
    outputHeight: crop.height
  };
}

function fitPixelCropToAspect(crop: PixelCrop, aspect?: number): PixelCrop {
  if (!aspect || !Number.isFinite(aspect) || aspect <= 0) return crop;
  const currentAspect = crop.width / crop.height;
  if (Math.abs(currentAspect - aspect) < 0.0001) return crop;
  if (currentAspect > aspect) {
    const width = Math.max(1, Math.round(crop.height * aspect));
    return { ...crop, x: crop.x + Math.floor((crop.width - width) / 2), width };
  }
  const height = Math.max(1, Math.round(crop.width / aspect));
  return { ...crop, y: crop.y + Math.floor((crop.height - height) / 2), height };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Number.isFinite(value) ? value : min));
}
