import exifr from "exifr/dist/lite.esm.mjs";
import type { EmbeddedImageMetadata } from "../shared/types";

export async function readEmbeddedImageMetadata(blob: Blob): Promise<EmbeddedImageMetadata> {
  try {
    const raw = await exifr.parse(blob, {
      tiff: true,
      exif: true,
      xmp: true,
      gps: false,
      iptc: false,
      jfif: false,
      icc: false,
      ihdr: true,
      mergeOutput: true,
      translateValues: true,
      sanitize: true
    }) as Record<string, unknown> | undefined;

    return compactMetadata({
      cameraMake: text(raw?.Make),
      cameraModel: text(raw?.Model),
      lensModel: text(raw?.LensModel ?? raw?.Lens),
      capturedAt: dateText(raw?.DateTimeOriginal ?? raw?.CreateDate),
      exposureTime: exposureText(raw?.ExposureTime),
      aperture: number(raw?.FNumber),
      iso: number(raw?.ISO ?? raw?.ISOSpeedRatings),
      focalLengthMm: number(raw?.FocalLength),
      declaredColorSpace: text(raw?.ColorSpace),
      software: text(raw?.Software ?? raw?.CreatorTool),
      originalWidth: number(raw?.ExifImageWidth ?? raw?.ImageWidth),
      originalHeight: number(raw?.ExifImageHeight ?? raw?.ImageHeight),
      orientationTag: text(raw?.Orientation),
      locationDataExcluded: true
    });
  } catch {
    return { locationDataExcluded: true };
  }
}

function compactMetadata(metadata: EmbeddedImageMetadata): EmbeddedImageMetadata {
  return Object.fromEntries(
    Object.entries(metadata).filter(([, value]) => value !== undefined && value !== "")
  ) as unknown as EmbeddedImageMetadata;
}

function text(value: unknown): string | undefined {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return undefined;
}

function number(value: unknown): number | undefined {
  const parsed = typeof value === "number" ? value : typeof value === "string" ? Number.parseFloat(value) : NaN;
  return Number.isFinite(parsed) ? parsed : undefined;
}

function dateText(value: unknown): string | undefined {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString();
  return text(value);
}

function exposureText(value: unknown): string | undefined {
  const parsed = number(value);
  if (parsed === undefined || parsed <= 0) return text(value);
  if (parsed < 1) return `1/${Math.round(1 / parsed)} s`;
  return `${round(parsed, 3)} s`;
}

function round(value: number, digits: number): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}
