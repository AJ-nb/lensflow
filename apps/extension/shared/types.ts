import type { VisualAnalysis } from "./visual-analysis";
import type { VisualOverview } from "./visual-overview";
import { isThemeId, type ThemeId, type ThemeMode } from "./themes";
import type {
  BatchCreateInput,
  AnalysisMode as ProductAnalysisMode,
  BatchSelection,
  GenerationBatch,
  ProviderProfile,
  ProviderConnectionResult,
  SavePromptInput,
  StudioSnapshot
} from "@lensflow/contracts";

export type AnalysisMode = "fast" | "balanced" | "deep";
export type AnalysisFlow = "overview-first" | "full-direct";
export type ImageQuality = "low" | "medium" | "high";

export const CURRENT_SETTINGS_VERSION = 4;
const LEGACY_DEFAULT_API_BASE_URL = "https://api.biyuan.ai/v1";

export interface AppSettings {
  settingsVersion: number;
  apiKey: string;
  rememberApiKey: boolean;
  apiBaseUrl: string;
  analysisModel: string;
  imageModel: string;
  analysisFlow: AnalysisFlow;
  analysisMode: AnalysisMode;
  imageQuality: ImageQuality;
  autoAnalyze: boolean;
  outputLanguage: "zh-CN" | "en";
  themeMode: ThemeMode;
  themeId: ThemeId;
}

export const DEFAULT_SETTINGS: AppSettings = {
  settingsVersion: CURRENT_SETTINGS_VERSION,
  apiKey: "",
  rememberApiKey: false,
  apiBaseUrl: "",
  analysisModel: "gpt-5.6-sol",
  imageModel: "gpt-image-2",
  analysisFlow: "overview-first",
  analysisMode: "fast",
  imageQuality: "medium",
  autoAnalyze: false,
  outputLanguage: "zh-CN",
  themeMode: "daily",
  themeId: "cinnabar-celadon"
};

export function normalizeSettings(value: Partial<AppSettings> = {}): AppSettings {
  const isCurrentSettings = value.settingsVersion === CURRENT_SETTINGS_VERSION;
  const isLegacySettings = typeof value.settingsVersion === "number" && value.settingsVersion < CURRENT_SETTINGS_VERSION;
  return {
    settingsVersion: CURRENT_SETTINGS_VERSION,
    apiKey: typeof value.apiKey === "string" ? value.apiKey : DEFAULT_SETTINGS.apiKey,
    rememberApiKey: typeof value.rememberApiKey === "boolean"
      ? value.rememberApiKey
      : isLegacySettings && Boolean(value.apiKey),
    apiBaseUrl: isLegacySettings && value.apiBaseUrl === LEGACY_DEFAULT_API_BASE_URL
      ? ""
      : typeof value.apiBaseUrl === "string" ? value.apiBaseUrl : DEFAULT_SETTINGS.apiBaseUrl,
    analysisModel: typeof value.analysisModel === "string" ? value.analysisModel : DEFAULT_SETTINGS.analysisModel,
    imageModel: typeof value.imageModel === "string" ? value.imageModel : DEFAULT_SETTINGS.imageModel,
    analysisFlow: ["overview-first", "full-direct"].includes(value.analysisFlow ?? "")
      ? value.analysisFlow as AnalysisFlow
      : DEFAULT_SETTINGS.analysisFlow,
    analysisMode: ["fast", "balanced", "deep"].includes(value.analysisMode ?? "")
      ? value.analysisMode as AnalysisMode
      : DEFAULT_SETTINGS.analysisMode,
    imageQuality: ["low", "medium", "high"].includes(value.imageQuality ?? "")
      ? value.imageQuality as ImageQuality
      : DEFAULT_SETTINGS.imageQuality,
    autoAnalyze: (isCurrentSettings || value.settingsVersion === 3) && typeof value.autoAnalyze === "boolean"
      ? value.autoAnalyze
      : DEFAULT_SETTINGS.autoAnalyze,
    outputLanguage: value.outputLanguage === "en" ? "en" : DEFAULT_SETTINGS.outputLanguage,
    themeMode: value.themeMode === "manual" ? "manual" : DEFAULT_SETTINGS.themeMode,
    themeId: isThemeId(value.themeId) ? value.themeId : DEFAULT_SETTINGS.themeId
  };
}

export interface ImageCrop {
  x: number;
  y: number;
  width: number;
  height: number;
  devicePixelRatio: number;
  fullyVisible?: boolean;
  contentMayBeCropped?: boolean;
}

export interface NormalizedRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export type EvidenceAnchorKind = "material-region" | "ocr-line" | "subject-mask";
export type EvidenceAnchorProvenance = "user-annotation" | "local-extraction" | "model-estimate";

export interface EvidenceAnchor {
  id: string;
  kind: EvidenceAnchorKind;
  label: string;
  rect?: NormalizedRect;
  provenance: EvidenceAnchorProvenance;
  confidence: number;
}

export interface EvidenceClaimLink {
  id: string;
  section: "overview" | "design-language" | "design-technique" | "cmf";
  claimLabel: string;
  evidenceText: string[];
  evidenceAnchorIds: string[];
}

export interface SubjectCrop {
  id: string;
  rect: NormalizedRect;
  sourceWidth: number;
  sourceHeight: number;
  outputWidth: number;
  outputHeight: number;
  createdAt: string;
}

export interface MaterialRegion {
  id: string;
  name: string;
  materialFamily: string;
  finish: string;
  colorHex: string;
  note: string;
  rect: NormalizedRect;
  createdAt: string;
}

export interface OcrTextLine {
  text: string;
  confidence: number;
  rect: NormalizedRect;
}

export interface OcrResult {
  text: string;
  confidence: number;
  languages: string[];
  lines: OcrTextLine[];
  processedAt: string;
}

export interface SubjectSegmentation {
  maskDataUrl: string;
  point: { x: number; y: number };
  threshold: number;
  coverage: number;
  maskWidth: number;
  maskHeight: number;
  processedAt: string;
  evidenceBoundary: "model-estimate";
}

export interface ImageSource {
  id: string;
  kind: "web" | "upload" | "url";
  url?: string;
  dataUrl?: string;
  pageUrl?: string;
  pageTitle?: string;
  alt?: string;
  fileName?: string;
  tabId?: number;
  windowId?: number;
  crop?: ImageCrop;
  declaredWidth?: number;
  declaredHeight?: number;
  subjectCrop?: SubjectCrop;
  originalSource?: OriginalImageSourceSnapshot;
}

export type ReferenceViewKind =
  | "primary"
  | "front"
  | "left"
  | "right"
  | "top"
  | "back"
  | "detail"
  | "orthographic-sheet"
  | "unknown";

export interface ReferenceImage {
  id: string;
  source: ImageSource;
  viewKind: ReferenceViewKind;
  provenance: "original" | "generated" | "cropped";
  confidence: number;
  createdAt: string;
}

export interface OriginalImageSourceSnapshot {
  id: string;
  kind: "web" | "upload" | "url";
  url?: string;
  dataUrl?: string;
  pageUrl?: string;
  pageTitle?: string;
  alt?: string;
  fileName?: string;
  tabId?: number;
  windowId?: number;
  crop?: ImageCrop;
  declaredWidth?: number;
  declaredHeight?: number;
}

export interface PaletteColor {
  hex: string;
  rgb: { r: number; g: number; b: number };
  cmyk: { c: number; m: number; y: number; k: number };
  oklch: { l: number; c: number; h: number };
  proportion: number;
  population: number;
  isDark: boolean;
  textColor: "#000000" | "#ffffff";
  deltaEFromPrimary?: number;
  correction?: {
    originalHex: string;
    correctedAt: string;
    deltaE2000: number;
  };
}

export interface EmbeddedImageMetadata {
  cameraMake?: string;
  cameraModel?: string;
  lensModel?: string;
  capturedAt?: string;
  exposureTime?: string;
  aperture?: number;
  iso?: number;
  focalLengthMm?: number;
  declaredColorSpace?: string;
  software?: string;
  originalWidth?: number;
  originalHeight?: number;
  orientationTag?: string;
  locationDataExcluded: true;
}

export interface MeasuredImageData {
  width: number;
  height: number;
  aspectRatio: string;
  sha256: string;
  orientation: "landscape" | "portrait" | "square";
  mimeType: string;
  palette: PaletteColor[];
  embeddedMetadata?: EmbeddedImageMetadata;
}

export interface AnalysisResult {
  schemaVersion: "1.1" | "1.2";
  stage?: "complete";
  generatedAt: string;
  model: string;
  source: Omit<ImageSource, "dataUrl">;
  measured: MeasuredImageData;
  reconstructionDirective: string;
  analysis: VisualAnalysis;
  previewDataUrl: string;
  materialRegions?: MaterialRegion[];
  ocrResult?: OcrResult;
  subjectSegmentation?: SubjectSegmentation;
  references?: ReferenceImage[];
  evidenceAnchors?: EvidenceAnchor[];
  evidenceLinks?: EvidenceClaimLink[];
}

export interface AnalysisOverviewResult {
  schemaVersion: "1.0";
  stage: "overview";
  generatedAt: string;
  model: string;
  source: Omit<ImageSource, "dataUrl">;
  measured: MeasuredImageData;
  overview: VisualOverview;
  previewDataUrl: string;
}

export interface AnalysisArchiveRecord {
  id: string;
  generatedAt: string;
  updatedAt: string;
  title: string;
  sha256: string;
  model: string;
  sourceLabel: string;
  favorite: boolean;
  tags: string[];
  result: AnalysisResult;
  perceptualHash?: string;
  eagleSync?: {
    itemId: string;
    folderId?: string;
    tags: string[];
    syncedAt: string;
    verified: true;
  };
}

export interface SimilarArchiveMatch {
  record: AnalysisArchiveRecord;
  similarity: number;
  distance: number;
}

export interface PromptVersionRecord {
  id: string;
  sha256: string;
  createdAt: string;
  label: string;
  positivePrompt: string;
  negativePrompt: string;
  reconstructionDirective: string;
}

export interface ImageEditResult {
  dataUrl: string;
  revisedPrompt?: string;
}

export interface ConnectionTestResult {
  reachable: true;
  endpoint: string;
  latencyMs: number;
  modelCount: number;
  availableModels: string[];
  analysisModels: string[];
  imageModels: string[];
  warnings: string[];
  analysisModelAvailable: boolean;
  imageModelAvailable: boolean;
}

export type CaptureIntent = "analyze" | "analyze-generate";

export type RuntimeRequest =
  | { type: "GET_SETTINGS" }
  | { type: "SAVE_SETTINGS"; settings: Partial<AppSettings> }
  | { type: "TEST_CONNECTION"; settings: Partial<AppSettings> }
  | { type: "SET_SELECTION"; source: ImageSource; intent?: CaptureIntent }
  | { type: "GET_SELECTION" }
  | { type: "PREPARE_IMAGE"; source: ImageSource }
  | { type: "ANALYZE_IMAGE"; source: ImageSource; reconstructionDirective?: string }
  | { type: "EDIT_IMAGE"; source: ImageSource; prompt: string }
  | { type: "GENERATE_THREE_VIEW"; source: ImageSource; analysis: VisualAnalysis; measured: MeasuredImageData }
  | { type: "LENSFLOW_SNAPSHOT" }
  | { type: "LENSFLOW_SAVE_PROVIDER"; profile: ProviderProfile; secret?: string }
  | { type: "LENSFLOW_LIST_MODELS"; providerId: string; refresh?: boolean }
  | { type: "LENSFLOW_TEST_PROVIDER"; providerId: string }
  | { type: "LENSFLOW_PROBE_PROVIDER"; providerId: string }
  | { type: "LENSFLOW_CREATE_KEYWORD"; axis: "style" | "subject" | "composition" | "color" | "motion"; text: string }
  | { type: "LENSFLOW_DELETE_KEYWORD"; id: string }
  | { type: "LENSFLOW_ADD_REFERENCE"; assetId: string; kind: "palette" | "pose" | "face" | "image" }
  | { type: "LENSFLOW_SET_REFERENCE"; id: string; enabled: boolean }
  | { type: "LENSFLOW_DELETE_REFERENCE"; id: string }
  | { type: "LENSFLOW_CREATE_BATCH"; input: BatchCreateInput }
  | { type: "LENSFLOW_RETRY_FAILED"; batchId: string }
  | { type: "LENSFLOW_CANCEL_BATCH"; batchId: string }
  | { type: "LENSFLOW_SAVE_WORK"; batchId: string; childId: string }
  | { type: "LENSFLOW_DOWNLOAD"; batchId: string; childId?: string }
  | { type: "LENSFLOW_EXPORT_EAGLE"; batchId: string; childId: string }
  | { type: "LENSFLOW_OPEN_WORKSPACE"; hash?: string }
  | { type: "LENSFLOW_OPEN_ANALYSIS"; assetId: string }
  | { type: "LENSFLOW_ANALYZE_ASSET"; assetId: string; mode: ProductAnalysisMode }
  | { type: "LENSFLOW_GET_ANALYSIS"; analysisId: string }
  | { type: "LENSFLOW_CANCEL_ANALYSIS"; analysisId: string }
  | { type: "LENSFLOW_SAVE_PROMPT"; input: SavePromptInput }
  | { type: "LENSFLOW_DOWNLOAD_MANY"; selection: BatchSelection }
  | { type: "LENSFLOW_EXPORT_EAGLE_MANY"; selection: BatchSelection }
  | { type: "LENSFLOW_BRIDGE_RPC"; request: unknown };

export type LensflowRuntimeData = StudioSnapshot | GenerationBatch | ProviderProfile | ProviderConnectionResult | unknown;

export type RuntimeResponse<T = unknown> =
  | { ok: true; data: T }
  | { ok: false; error: string; code?: string };
