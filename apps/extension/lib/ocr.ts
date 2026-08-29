import { createWorker, OEM, PSM, type Block } from "tesseract.js";
import type { OcrResult, OcrTextLine } from "../shared/types";

export type OcrProgress = { status: string; progress: number };

export async function recognizeLocalText(
  image: string,
  onProgress?: (progress: OcrProgress) => void
): Promise<OcrResult> {
  const asset = extensionAssetUrl;
  const dimensions = await readImageDimensions(image);
  const worker = await createWorker(["chi_sim", "eng"], OEM.LSTM_ONLY, {
    workerPath: asset("vendor/ocr/worker-quiet.js"),
    corePath: asset("vendor/ocr/core/tesseract-core-simd-lstm.wasm.js"),
    langPath: asset("vendor/ocr/lang"),
    workerBlobURL: false,
    gzip: true,
    logger: (message) => onProgress?.({
      status: localizeOcrStatus(message.status),
      progress: Number.isFinite(message.progress) ? message.progress : 0
    })
  });
  try {
    await worker.setParameters({ preserve_interword_spaces: "1", tessedit_pageseg_mode: PSM.AUTO });
    const output = await worker.recognize(image, {}, { blocks: true });
    const lines = extractOcrLines(output.data.blocks, output.data.text, dimensions.width, dimensions.height);
    return {
      text: output.data.text.trim(),
      confidence: output.data.confidence / 100,
      languages: ["简体中文", "英文"],
      lines,
      processedAt: new Date().toISOString()
    };
  } finally {
    await worker.terminate();
  }
}

export function normalizeOcrLine(
  text: string,
  confidence: number,
  bbox: { x0: number; y0: number; x1: number; y1: number },
  pageWidth: number,
  pageHeight: number
): OcrTextLine | null {
  const normalizedText = text.replace(/\s+/g, " ").trim();
  if (!normalizedText || pageWidth <= 0 || pageHeight <= 0) return null;
  return {
    text: normalizedText,
    confidence: Math.max(0, Math.min(1, confidence / 100)),
    rect: {
      x: Math.max(0, bbox.x0 / pageWidth),
      y: Math.max(0, bbox.y0 / pageHeight),
      width: Math.max(0, Math.min(1 - bbox.x0 / pageWidth, (bbox.x1 - bbox.x0) / pageWidth)),
      height: Math.max(0, Math.min(1 - bbox.y0 / pageHeight, (bbox.y1 - bbox.y0) / pageHeight))
    }
  };
}

export function extractOcrLines(
  blocks: Block[] | null,
  fallback: string,
  pageWidth: number,
  pageHeight: number
): OcrTextLine[] {
  const allLines = blocks?.flatMap((block) => block.paragraphs.flatMap((paragraph) => paragraph.lines)) ?? [];
  const normalized = allLines
    .map((line) => normalizeOcrLine(line.text, line.confidence, line.bbox, pageWidth, pageHeight))
    .filter((line): line is OcrTextLine => Boolean(line));
  if (normalized.length || !fallback.trim()) return normalized;
  return [{ text: fallback.trim(), confidence: 0, rect: { x: 0, y: 0, width: 1, height: 1 } }];
}

async function readImageDimensions(source: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve({ width: image.naturalWidth, height: image.naturalHeight });
    image.onerror = () => reject(new Error("无法读取 OCR 图片尺寸。"));
    image.src = source;
  });
}

function extensionAssetUrl(path: string): string {
  if (typeof browser !== "undefined" && browser.runtime?.getURL) return browser.runtime.getURL(path as never);
  return new URL(`/${path}`, window.location.origin).toString();
}

function localizeOcrStatus(value: string): string {
  const labels: Record<string, string> = {
    "loading tesseract core": "加载本地识别引擎",
    "initializing tesseract": "初始化文字识别",
    "loading language traineddata": "加载中英文语言包",
    "initializing api": "准备 OCR 模型",
    "recognizing text": "识别图片文字"
  };
  return labels[value] ?? "本地 OCR 处理中";
}
