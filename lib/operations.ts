import { prepareImage } from "./image";
import {
  analyzeWithOpenAI,
  analyzeOverviewWithOpenAI,
  editWithOpenAI,
  generateThreeViewWithOpenAI
} from "./openai";
import type {
  AnalysisResult,
  AnalysisOverviewResult,
  AppSettings,
  ImageEditResult,
  ImageSource,
  MeasuredImageData
} from "../shared/types";
import type { VisualAnalysis } from "../shared/visual-analysis";
import type { VisualOverview } from "../shared/visual-overview";

export type AnalysisProgressStage = "prepare" | "overview" | "design" | "structure" | "cmf";
export type AnalysisProgressStatus = "active" | "complete";

export interface AnalysisRunOptions {
  signal?: AbortSignal;
  onProgress?: (stage: AnalysisProgressStage, status: AnalysisProgressStatus) => void;
  overview?: VisualOverview;
}

export async function runImageAnalysis(
  settings: AppSettings,
  source: ImageSource,
  reconstructionDirective = "",
  preparedOverview?: AnalysisOverviewResult,
  options: AnalysisRunOptions = {}
): Promise<AnalysisResult> {
  options.signal?.throwIfAborted();
  options.onProgress?.("prepare", "active");
  const prepared = preparedOverview && settings.analysisMode === "fast" ? {
    dataUrl: preparedOverview.previewDataUrl,
    measured: preparedOverview.measured
  } : await prepareImage(source, {
    maxEdge: settings.analysisMode === "fast" ? 1280 : 2048,
    signal: options.signal
  });
  options.onProgress?.("prepare", "complete");
  const directive = reconstructionDirective.trim();
  const analysis = await analyzeWithOpenAI(
    settings,
    prepared.dataUrl,
    source,
    prepared.measured,
    directive,
    preparedOverview ? { ...options, overview: preparedOverview.overview } : options
  );

  return {
    schemaVersion: "1.2",
    stage: "complete",
    generatedAt: new Date().toISOString(),
    model: settings.analysisModel,
    source: omitImageData(source),
    measured: prepared.measured,
    reconstructionDirective: directive,
    analysis,
    previewDataUrl: prepared.dataUrl
  };
}

export async function runImageOverview(
  settings: AppSettings,
  source: ImageSource,
  options: AnalysisRunOptions = {}
): Promise<AnalysisOverviewResult> {
  options.signal?.throwIfAborted();
  options.onProgress?.("prepare", "active");
  const prepared = await prepareImage(source, { maxEdge: 1024, signal: options.signal });
  options.onProgress?.("prepare", "complete");
  options.onProgress?.("overview", "active");
  const overview = await analyzeOverviewWithOpenAI(settings, prepared.dataUrl, source, prepared.measured, options);
  options.onProgress?.("overview", "complete");
  return {
    schemaVersion: "1.0",
    stage: "overview",
    generatedAt: new Date().toISOString(),
    model: settings.analysisModel,
    source: omitImageData(source),
    measured: prepared.measured,
    overview,
    previewDataUrl: prepared.dataUrl
  };
}

export async function runImageEdit(
  settings: AppSettings,
  source: ImageSource,
  prompt: string
): Promise<ImageEditResult> {
  const request = prompt.trim();
  if (!request) throw new Error("请输入图片编辑要求。");
  const prepared = await prepareImage(source);
  return editWithOpenAI(settings, prepared.blob, request);
}

export async function runThreeViewGeneration(
  settings: AppSettings,
  source: ImageSource,
  analysis: VisualAnalysis,
  measured: MeasuredImageData
): Promise<ImageEditResult> {
  const prepared = await prepareImage(source);
  return generateThreeViewWithOpenAI(settings, prepared.blob, analysis, measured);
}

function omitImageData(source: ImageSource): Omit<ImageSource, "dataUrl"> {
  const { dataUrl: _dataUrl, ...safeSource } = source;
  return safeSource;
}
