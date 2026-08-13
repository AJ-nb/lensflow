import type { MaterialRegion, OcrResult, SubjectSegmentation } from "../shared/types";

export interface SvgExportInput {
  imageDataUrl: string;
  width: number;
  height: number;
  title: string;
  materialRegions: MaterialRegion[];
  ocrResult?: OcrResult;
  subjectSegmentation?: SubjectSegmentation;
}

export function createLayeredSvg(input: SvgExportInput): string {
  const width = positive(input.width, 1);
  const height = positive(input.height, 1);
  const materials = input.materialRegions.map((region, index) => {
    const x = region.rect.x * width;
    const y = region.rect.y * height;
    const regionWidth = region.rect.width * width;
    const regionHeight = region.rect.height * height;
    return `<g id="material-${index + 1}" data-material="${escapeXml(region.materialFamily)}" data-finish="${escapeXml(region.finish)}">
      <rect x="${round(x)}" y="${round(y)}" width="${round(regionWidth)}" height="${round(regionHeight)}" fill="${escapeXml(region.colorHex)}" fill-opacity="0.14" stroke="${escapeXml(region.colorHex)}" stroke-width="2"/>
      <text x="${round(x + 6)}" y="${round(y + 16)}" font-family="Arial, sans-serif" font-size="12" font-weight="700" fill="#17212a">${index + 1}. ${escapeXml(region.name)}</text>
    </g>`;
  }).join("\n");
  const ocr = input.ocrResult?.lines.map((line, index) => {
    const x = line.rect.x * width;
    const y = line.rect.y * height;
    return `<g id="ocr-line-${index + 1}" data-confidence="${round(line.confidence)}">
      <rect x="${round(x)}" y="${round(y)}" width="${round(line.rect.width * width)}" height="${round(line.rect.height * height)}" fill="none" stroke="#2563eb" stroke-width="1" stroke-dasharray="4 3"/>
      <text x="${round(x)}" y="${round(y + Math.max(12, line.rect.height * height - 2))}" font-family="Arial, sans-serif" font-size="12" fill="#174a8b">${escapeXml(line.text)}</text>
    </g>`;
  }).join("\n") ?? "";
  const segmentation = input.subjectSegmentation
    ? `<g id="subject-segmentation" data-evidence="model-estimate" data-threshold="${round(input.subjectSegmentation.threshold)}">
      <image href="${escapeXml(input.subjectSegmentation.maskDataUrl)}" x="0" y="0" width="${width}" height="${height}" opacity="0.85" preserveAspectRatio="none"/>
      <circle cx="${round(input.subjectSegmentation.point.x * width)}" cy="${round(input.subjectSegmentation.point.y * height)}" r="5" fill="#ffffff" stroke="#0f766e" stroke-width="2"/>
    </g>`
    : "";
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <title>${escapeXml(input.title)}</title>
  <desc>砚台导出：原图、材料区域、OCR 文本与模型估计主体遮罩均为独立图层。</desc>
  <g id="source-image"><image href="${escapeXml(input.imageDataUrl)}" x="0" y="0" width="${width}" height="${height}" preserveAspectRatio="none"/></g>
  <g id="subject-layer">${segmentation}</g>
  <g id="material-regions">${materials}</g>
  <g id="ocr-text">${ocr}</g>
</svg>`;
}

export function countSvgLayers(svg: string): number {
  return (svg.match(/<g\s+id=/g) ?? []).length;
}

function escapeXml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&apos;"
  })[character]!);
}

function positive(value: number, fallback: number): number {
  return Number.isFinite(value) && value > 0 ? Math.round(value) : fallback;
}

function round(value: number): string {
  return Number(value.toFixed(4)).toString();
}
