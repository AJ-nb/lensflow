import { getPalette } from "colorthief";
import { rgbToCmyk, withPaletteComparisons } from "../shared/color";
import type { ImageCrop, ImageSource, MeasuredImageData, PaletteColor } from "../shared/types";
import { readEmbeddedImageMetadata } from "./metadata";
import { dataUrlToBlob } from "./data-url";

export { rgbToCmyk } from "../shared/color";
export { dataUrlToBlob } from "./data-url";

const MAX_ANALYSIS_EDGE = 2048;

export interface PreparedImage {
  blob: Blob;
  dataUrl: string;
  measured: MeasuredImageData;
}

export async function prepareImage(
  source: ImageSource,
  options: { maxEdge?: number; signal?: AbortSignal } = {}
): Promise<PreparedImage> {
  options.signal?.throwIfAborted();
  const original = await resolveImageBlob(source, options.signal);
  options.signal?.throwIfAborted();
  const [bitmap, sha256, embeddedMetadata] = await Promise.all([
    createImageBitmap(original),
    sha256Blob(original),
    readEmbeddedImageMetadata(original)
  ]);
  options.signal?.throwIfAborted();
  const maxEdge = options.maxEdge ?? MAX_ANALYSIS_EDGE;
  const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = new OffscreenCanvas(width, height);
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) throw new Error("无法创建图片处理画布。");

  context.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();

  const outputType = original.type === "image/png" ? "image/png" : "image/jpeg";
  const blob = await canvas.convertToBlob({ type: outputType, quality: 0.9 });
  const palette = await extractPalette(canvas);
  options.signal?.throwIfAborted();

  return {
    blob,
    dataUrl: await blobToDataUrl(blob),
    measured: {
      width,
      height,
      aspectRatio: formatAspectRatio(width, height),
      sha256,
      orientation: getOrientation(width, height),
      mimeType: blob.type || outputType,
      palette,
      embeddedMetadata
    }
  };
}

async function resolveImageBlob(source: ImageSource, signal?: AbortSignal): Promise<Blob> {
  if (source.dataUrl) {
    return dataUrlToBlob(source.dataUrl);
  }

  if (source.url) {
    try {
      return await fetchImageUrl(source.url, signal);
    } catch (error) {
      if (source.windowId !== undefined && source.crop) {
        try {
          return await captureAndCrop(source.windowId, source.crop);
        } catch (captureError) {
          throw new Error(`${formatImageReadError(error)} 截图回退也失败：${errorMessage(captureError)}`);
        }
      }
      throw new Error(formatImageReadError(error));
    }
  }

  throw new Error("没有可处理的图片来源。");
}

async function fetchImageUrl(url: string, signal?: AbortSignal): Promise<Blob> {
  const attempts: RequestInit[] = [
    { credentials: "omit", cache: "no-store", referrerPolicy: "no-referrer" },
    { credentials: "include", cache: "no-store" }
  ];
  let lastError: unknown;

  for (const init of attempts) {
    try {
      const response = await fetch(url, { ...init, signal });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const blob = await response.blob();
      if (blob.type && !blob.type.startsWith("image/") && blob.type !== "application/octet-stream") {
        throw new Error(`返回类型 ${blob.type} 不是图片`);
      }
      return blob;
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError instanceof Error ? lastError : new Error("未知网络错误");
}

export function formatImageReadError(error: unknown): string {
  const message = errorMessage(error);
  const normalized = message.toLowerCase();
  if (normalized.includes("failed to fetch") || normalized.includes("networkerror")) {
    return "IMAGE_SOURCE_UNREADABLE：图片可以预览，但源站拒绝扩展读取原始像素。请直接上传本地图片，或在原网页使用悬浮按钮选择图片以启用截图回退。";
  }
  return `IMAGE_SOURCE_UNREADABLE：无法读取图片（${message}）。请检查图片地址，或改为上传本地文件。`;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error || "未知错误");
}

async function captureAndCrop(windowId: number, crop: ImageCrop): Promise<Blob> {
  assertCompleteScreenshotCrop(crop);
  const screenshot = await browser.tabs.captureVisibleTab(windowId, { format: "png" });
  const bitmap = await createImageBitmap(await dataUrlToBlob(screenshot));
  const scale = crop.devicePixelRatio || 1;
  const sx = Math.max(0, Math.floor(crop.x * scale));
  const sy = Math.max(0, Math.floor(crop.y * scale));
  const width = Math.max(1, Math.min(bitmap.width - sx, Math.floor(crop.width * scale)));
  const height = Math.max(1, Math.min(bitmap.height - sy, Math.floor(crop.height * scale)));
  const canvas = new OffscreenCanvas(width, height);
  const context = canvas.getContext("2d");
  if (!context) throw new Error("无法裁剪当前页面截图。");
  context.drawImage(bitmap, sx, sy, width, height, 0, 0, width, height);
  bitmap.close();
  return canvas.convertToBlob({ type: "image/png" });
}

export function assertCompleteScreenshotCrop(crop: ImageCrop): void {
  if (crop.fullyVisible === false) {
    throw new Error("WEB_IMAGE_PARTIALLY_VISIBLE：当前网页只显示了图片的一部分。请滚动到图片完整可见后重新选择，或上传原图。");
  }
  if (crop.contentMayBeCropped) {
    throw new Error("WEB_IMAGE_CSS_CROPPED：网页使用了裁切式展示，无法把屏幕截图当作完整原图。请打开图片原地址或上传原图。");
  }
}

async function extractPalette(source: OffscreenCanvas): Promise<PaletteColor[]> {
  try {
    const colors = await getPalette(source, {
      colorCount: 8,
      quality: 1,
      colorSpace: "oklch",
      ignoreWhite: false
    });

    const palette = (colors ?? []).map((color) => {
      const rgb = color.rgb();
      const oklch = color.oklch();
      return {
        hex: color.hex().toUpperCase(),
        rgb: { r: rgb.r, g: rgb.g, b: rgb.b },
        cmyk: rgbToCmyk(rgb),
        oklch: { l: oklch.l, c: oklch.c, h: oklch.h },
        proportion: color.proportion,
        population: color.population,
        isDark: color.isDark,
        textColor: color.textColor === "#ffffff" ? "#ffffff" : "#000000"
      } satisfies PaletteColor;
    });
    return withPaletteComparisons(palette);
  } catch (error) {
    console.warn("[砚台] 配色提取失败", error);
    return [];
  }
}

export function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error ?? new Error("图片编码失败。"));
    reader.readAsDataURL(blob);
  });
}

export async function sha256Blob(blob: Blob): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", await blob.arrayBuffer());
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function getOrientation(width: number, height: number): MeasuredImageData["orientation"] {
  const ratio = width / height;
  if (ratio > 1.04) return "landscape";
  if (ratio < 0.96) return "portrait";
  return "square";
}

function formatAspectRatio(width: number, height: number): string {
  const divisor = greatestCommonDivisor(width, height);
  const left = width / divisor;
  const right = height / divisor;
  if (left <= 32 && right <= 32) return `${left}:${right}`;
  return `${(width / height).toFixed(3)}:1`;
}

function greatestCommonDivisor(left: number, right: number): number {
  let a = Math.abs(left);
  let b = Math.abs(right);
  while (b) [a, b] = [b, a % b];
  return a || 1;
}
