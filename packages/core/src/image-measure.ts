import type { EvidenceValue } from "@lensflow/contracts";

export interface MeasuredPaletteColor {
  hex: string;
  proportion: number;
}

export interface LocalImageMeasurement {
  width: EvidenceValue<number>;
  height: EvidenceValue<number>;
  aspectRatio: EvidenceValue<string>;
  sha256: EvidenceValue<string>;
  palette: EvidenceValue<MeasuredPaletteColor[]>;
}

export async function measureImageDataUrl(dataUrl: string): Promise<LocalImageMeasurement> {
  const blob = dataUrlToBlob(dataUrl);
  const [sha256, image] = await Promise.all([sha256Blob(blob), loadImage(dataUrl, blob)]);
  const palette = measurePalette(image.source, image.width, image.height);
  return {
    width: { value: image.width, source: "measured" },
    height: { value: image.height, source: "measured" },
    aspectRatio: { value: ratioLabel(image.width, image.height), source: "measured" },
    sha256: { value: sha256, source: "measured" },
    palette: { value: palette, source: "measured" }
  };
}

export function dataUrlToBlob(dataUrl: string): Blob {
  const match = /^data:([^;,]+)?(;base64)?,(.*)$/s.exec(dataUrl);
  if (!match) throw new Error("图片数据不是有效的 Data URL。");
  const mimeType = match[1] || "application/octet-stream";
  const payload = match[3] ?? "";
  const bytes = match[2]
    ? Uint8Array.from(atob(payload), (character) => character.charCodeAt(0))
    : new TextEncoder().encode(decodeURIComponent(payload));
  return new Blob([bytes], { type: mimeType });
}

async function sha256Blob(blob: Blob): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", await blob.arrayBuffer());
  return [...new Uint8Array(digest)].map((value) => value.toString(16).padStart(2, "0")).join("");
}

function loadImage(dataUrl: string, blob: Blob): Promise<{ source: CanvasImageSource; width: number; height: number }> {
  if (typeof Image === "undefined" && typeof createImageBitmap === "function") {
    return createImageBitmap(blob).then((bitmap) => ({ source: bitmap, width: bitmap.width, height: bitmap.height }));
  }
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => {
      if (image.naturalWidth < 1 || image.naturalHeight < 1) reject(new Error("图片尺寸无效。"));
      else resolve({ source: image, width: image.naturalWidth, height: image.naturalHeight });
    };
    image.onerror = () => reject(new Error("无法读取图片像素。"));
    image.src = dataUrl;
  });
}

function measurePalette(image: CanvasImageSource, sourceWidth: number, sourceHeight: number): MeasuredPaletteColor[] {
  const longest = Math.max(sourceWidth, sourceHeight);
  const scale = Math.min(1, 72 / longest);
  const width = Math.max(1, Math.round(sourceWidth * scale));
  const height = Math.max(1, Math.round(sourceHeight * scale));
  const canvas = typeof document !== "undefined" ? document.createElement("canvas") : new OffscreenCanvas(width, height);
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d", { willReadFrequently: true }) as CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null;
  if (!context) throw new Error("浏览器无法创建本地测色画布。");
  context.drawImage(image, 0, 0, width, height);
  const pixels = context.getImageData(0, 0, width, height).data;
  const counts = new Map<string, number>();
  let total = 0;
  for (let index = 0; index < pixels.length; index += 4) {
    if ((pixels[index + 3] ?? 0) < 180) continue;
    const hex = rgbToHex(quantize(pixels[index] ?? 0), quantize(pixels[index + 1] ?? 0), quantize(pixels[index + 2] ?? 0));
    counts.set(hex, (counts.get(hex) ?? 0) + 1);
    total += 1;
  }
  if (!total) return [];
  return [...counts.entries()]
    .sort((left, right) => right[1] - left[1])
    .slice(0, 6)
    .map(([hex, count]) => ({ hex, proportion: Number((count / total).toFixed(4)) }));
}

function quantize(value: number) {
  return Math.min(255, Math.round(value / 32) * 32);
}

function rgbToHex(red: number, green: number, blue: number) {
  return `#${[red, green, blue].map((value) => value.toString(16).padStart(2, "0")).join("")}`;
}

function ratioLabel(width: number, height: number) {
  const divisor = gcd(width, height);
  return `${width / divisor}:${height / divisor}`;
}

function gcd(left: number, right: number): number {
  let a = Math.abs(left);
  let b = Math.abs(right);
  while (b) [a, b] = [b, a % b];
  return a || 1;
}
