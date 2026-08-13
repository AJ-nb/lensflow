import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { HexColorPicker } from "react-colorful";
import {
  AlertTriangle,
  Archive,
  Check,
  ChevronDown,
  Copy,
  Database,
  Download,
  ExternalLink,
  Eye,
  EyeOff,
  FileJson,
  GitCompareArrows,
  Image as ImageIcon,
  Link,
  LoaderCircle,
  Maximize2,
  PackageCheck,
  Palette,
  Plus,
  RefreshCw,
  RotateCcw,
  Save,
  ScanSearch,
  Scan,
  Search,
  Settings,
  ShieldCheck,
  Shuffle,
  Star,
  Trash2,
  Upload,
  WandSparkles,
  Wrench,
  X
} from "lucide-react";
import { DesignToolbox, type WorkbenchTool } from "./DesignToolbox";
import { EagleBridge } from "./EagleBridge";
import { PromptVersionManager } from "./PromptVersionManager";
import {
  InteractionFeedback,
  type FeedbackHandler,
  type FeedbackNotice,
  type FeedbackTone
} from "./InteractionFeedback";
import { createCroppedImageSource, cropImageDataUrl, restoreOriginalImageSource } from "../../lib/workbench";
import {
  formatRuntimeMessageError,
  isRetryableRuntimeRequest,
  isTransientMessageChannelError
} from "../../shared/runtime-messaging";
import { STORAGE_KEYS } from "../../shared/storage";
import { hasUrlAccesses, requestUrlAccess, requestUrlAccesses } from "../../shared/permissions";
import { normalizeApiBaseUrl } from "../../shared/api-models";
import { buildEvidenceAnchors, buildEvidenceLinks, matchEvidenceAnchorIds } from "../../shared/evidence";
import { randomThemeId, resolveTheme, VISUAL_THEMES, type ThemeId, type ThemeMode } from "../../shared/themes";
import type { ReconstructionReadiness } from "../../shared/reconstruction-package";
import {
  DEFAULT_SETTINGS,
  normalizeSettings,
  type AnalysisArchiveRecord,
  type AnalysisOverviewResult,
  type AnalysisResult,
  type AppSettings,
  type ConnectionTestResult,
  type EvidenceAnchor,
  type ImageSource,
  type MaterialRegion,
  type MeasuredImageData,
  type OcrResult,
  type PaletteColor,
  type PromptVersionRecord,
  type ReferenceImage,
  type ReferenceViewKind,
  type RuntimeRequest,
  type RuntimeResponse,
  type SimilarArchiveMatch,
  type SubjectSegmentation
} from "../../shared/types";

type MainView = "analysis" | "workbench" | "archive" | "settings";
type AnalysisView = "overview" | "analysis" | "json";
type ManualAnalysisChoice = "overview" | "full" | null;
type BusyAction = "save" | "overview" | "analyze" | "edit" | "reconstruct" | "three-view" | "test" | "archive" | "backup" | null;
type BackupImportMode = "merge" | "replace";
type AnalysisTaskPhase = "prepare" | "overview" | "design" | "structure" | "cmf" | "archive";
type AnalysisTaskPhaseStatus = "pending" | "active" | "complete" | "failed" | "cancelled";

interface AnalysisTaskState {
  action: "overview" | "analyze";
  status: "running" | "complete" | "failed" | "cancelled";
  phases: Record<AnalysisTaskPhase, AnalysisTaskPhaseStatus>;
  startedAt: number;
  elapsedMs: number;
  error?: string;
}

interface SessionState {
  source: ImageSource | null;
  references: ReferenceImage[];
  overview: AnalysisOverviewResult | null;
  result: AnalysisResult | null;
}

const PREVIEW_SETTINGS_KEY = "visualLensPreviewSettings";
const APP_VERSION = getBrowserRuntime()?.getManifest().version ?? "0.6.2";
let previewSession: SessionState = { source: null, references: [], overview: null, result: null };
let previewApiKey = "";

function getBrowserRuntime(): typeof browser.runtime | undefined {
  return typeof browser === "undefined" ? undefined : browser.runtime;
}

export default function App() {
  const [view, setView] = useState<MainView>("analysis");
  const [analysisView, setAnalysisView] = useState<AnalysisView>("overview");
  const [analysisChoice, setAnalysisChoice] = useState<ManualAnalysisChoice>(null);
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [draftSettings, setDraftSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const settingsRef = useRef<AppSettings>(DEFAULT_SETTINGS);
  const [source, setSource] = useState<ImageSource | null>(null);
  const [overview, setOverview] = useState<AnalysisOverviewResult | null>(null);
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [busy, setBusy] = useState<BusyAction>(null);
  const [status, setStatus] = useState("就绪");
  const [error, setError] = useState("");
  const [urlInput, setUrlInput] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [reconstructionDirective, setReconstructionDirective] = useState("");
  const [connectionTestResult, setConnectionTestResult] = useState<ConnectionTestResult | null>(null);
  const [editPrompt, setEditPrompt] = useState("");
  const [preparedDataUrl, setPreparedDataUrl] = useState("");
  const [editedDataUrl, setEditedDataUrl] = useState("");
  const [threeViewDataUrl, setThreeViewDataUrl] = useState("");
  const [editPreview, setEditPreview] = useState<"source" | "edited" | "three-view">("source");
  const [archiveRecords, setArchiveRecords] = useState<AnalysisArchiveRecord[]>([]);
  const [archiveSearch, setArchiveSearch] = useState("");
  const [materialRegions, setMaterialRegions] = useState<MaterialRegion[]>([]);
  const [ocrResult, setOcrResult] = useState<OcrResult | undefined>();
  const [subjectSegmentation, setSubjectSegmentation] = useState<SubjectSegmentation | undefined>();
  const [references, setReferences] = useState<ReferenceImage[]>([]);
  const [referenceViewKind, setReferenceViewKind] = useState<ReferenceViewKind>("detail");
  const [activeEvidenceIds, setActiveEvidenceIds] = useState<string[]>([]);
  const [evidenceMessage, setEvidenceMessage] = useState("");
  const [analysisTask, setAnalysisTask] = useState<AnalysisTaskState | null>(null);
  const [feedback, setFeedback] = useState<FeedbackNotice | null>(null);
  const [workbenchTool, setWorkbenchTool] = useState<WorkbenchTool>("regions");
  const [sourcePreviewMode, setSourcePreviewMode] = useState<"fit" | "actual">("fit");
  const [themeMenuOpen, setThemeMenuOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const referenceFileInputRef = useRef<HTMLInputElement>(null);
  const activeSourceIdRef = useRef<string | null>(null);
  const analysisAbortRef = useRef<AbortController | null>(null);
  const feedbackTimerRef = useRef<number | null>(null);

  useEffect(() => {
    void initialize();
    const runtime = getBrowserRuntime();
    if (!runtime?.onMessage) return;
    const sidePanelPort = runtime.connect({ name: "yantai-sidepanel" });
    const listener = (message: { type?: string; source?: ImageSource }) => {
      if (message.type === "SELECTION_UPDATED" && message.source && message.source.id !== activeSourceIdRef.current) {
        void acceptSource(message.source);
      }
    };
    runtime.onMessage.addListener(listener);
    return () => {
      runtime.onMessage.removeListener(listener);
      sidePanelPort.disconnect();
    };
  }, []);

  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
  }, [view]);

  useEffect(() => {
    const onPaste = (event: ClipboardEvent) => {
      const file = Array.from(event.clipboardData?.files ?? []).find((item) => item.type.startsWith("image/"));
      if (file) void loadFile(file);
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, []);

  useEffect(() => {
    if (view === "archive") void loadArchives();
  }, [view]);

  useEffect(() => {
    if (analysisTask?.status !== "running") return;
    const timer = window.setInterval(() => {
      setAnalysisTask((current) => current?.status === "running"
        ? { ...current, elapsedMs: Date.now() - current.startedAt }
        : current);
    }, 1_000);
    return () => window.clearInterval(timer);
  }, [analysisTask?.status, analysisTask?.startedAt]);

  useEffect(() => () => {
    if (feedbackTimerRef.current !== null) window.clearTimeout(feedbackTimerRef.current);
  }, []);

  useEffect(() => {
    if (!themeMenuOpen) return;
    const closeOnOutsidePress = (event: PointerEvent) => {
      if (event.target instanceof Element && !event.target.closest(".theme-control")) setThemeMenuOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setThemeMenuOpen(false);
    };
    document.addEventListener("pointerdown", closeOnOutsidePress);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsidePress);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [themeMenuOpen]);

  useEffect(() => {
    settingsRef.current = settings;
  }, [settings]);

  const evidenceAnchors = useMemo(() => result?.evidenceAnchors ?? buildEvidenceAnchors({
    materialRegions,
    ocrResult,
    subjectSegmentation
  }), [result?.evidenceAnchors, materialRegions, ocrResult, subjectSegmentation]);

  const activeImage = useMemo(() => {
    if (editPreview === "edited" && editedDataUrl) return editedDataUrl;
    if (editPreview === "three-view" && threeViewDataUrl) return threeViewDataUrl;
    return preparedDataUrl || result?.previewDataUrl || overview?.previewDataUrl || source?.dataUrl || source?.url || "";
  }, [editPreview, editedDataUrl, threeViewDataUrl, preparedDataUrl, result, overview, source]);
  const activeImageRatio = result?.measured.width && result.measured.height
    ? result.measured.width / result.measured.height
    : overview?.measured.width && overview.measured.height
      ? overview.measured.width / overview.measured.height
      : source?.declaredWidth && source.declaredHeight ? source.declaredWidth / source.declaredHeight : 4 / 3;
  const activeTheme = useMemo(
    () => resolveTheme(settings.themeMode, settings.themeId),
    [settings.themeMode, settings.themeId]
  );

  async function initialize() {
    try {
      const [loadedSettings, session] = await Promise.all([
        sendRequest<AppSettings>({ type: "GET_SETTINGS" }),
        sendRequest<SessionState>({ type: "GET_SELECTION" })
      ]);
      settingsRef.current = loadedSettings;
      setSettings(loadedSettings);
      setDraftSettings(loadedSettings);
      if (session.source) {
        activeSourceIdRef.current = session.source.id;
        setSource(session.source);
        setReferences(session.references ?? session.result?.references ?? []);
        setOverview(session.overview);
        setResult(session.result);
        setAnalysisView(session.result ? "analysis" : "overview");
        if (session.result || session.overview) {
          setPreparedDataUrl(session.result?.previewDataUrl || session.overview?.previewDataUrl || "");
        }
        if (session.result) {
          setReconstructionDirective(session.result.reconstructionDirective || "");
          setMaterialRegions(session.result.materialRegions ?? []);
          setOcrResult(session.result.ocrResult);
          setSubjectSegmentation(session.result.subjectSegmentation);
        }
        if (!session.result && !session.overview && loadedSettings.autoAnalyze && loadedSettings.apiKey && loadedSettings.apiBaseUrl) {
          await runPreferredAnalysis(session.source, loadedSettings);
        }
      }
    } catch (caught) {
      showError(caught);
    }
  }

  async function acceptSource(nextSource: ImageSource, shouldAutoAnalyze = true) {
    const effectiveSettings = settingsRef.current;
    analysisAbortRef.current?.abort();
    activeSourceIdRef.current = nextSource.id;
    setBusy(null);
    setSource(nextSource);
    setOverview(null);
    setResult(null);
    setPreparedDataUrl("");
    setEditedDataUrl("");
    setThreeViewDataUrl("");
    setReconstructionDirective("");
    setMaterialRegions([]);
    setOcrResult(undefined);
    setSubjectSegmentation(undefined);
    setReferences([]);
    setActiveEvidenceIds([]);
    setEvidenceMessage("");
    setAnalysisTask(null);
    setAnalysisChoice(null);
    setAnalysisView("overview");
    setEditPreview("source");
    setSourcePreviewMode("fit");
    setView("analysis");
    setStatus("图片已选择");
    showFeedback("info", "图片已载入", effectiveSettings.autoAnalyze
      ? effectiveSettings.analysisFlow === "full-direct" ? "将按自动流程生成完整分析。" : "将按自动流程先生成概览。"
      : "不会自动分析，请在首页选择概览或完整分析。");
    setError("");
    if (shouldAutoAnalyze && effectiveSettings.autoAnalyze && effectiveSettings.apiKey && effectiveSettings.apiBaseUrl) {
      await runPreferredAnalysis(nextSource, effectiveSettings);
    }
  }

  async function runPreferredAnalysis(target: ImageSource, effectiveSettings: AppSettings) {
    if (!await hasRemoteAccess(effectiveSettings, target)) {
      setAnalysisChoice(effectiveSettings.analysisFlow === "full-direct" ? "full" : "overview");
      setStatus("等待授权后生成");
      showFeedback(
        "warning",
        "自动分析已暂停",
        "新域名必须由你主动授权。点击下方生成按钮后，砚台才会申请权限并发送图片。"
      );
      return null;
    }
    if (effectiveSettings.analysisFlow === "full-direct") return analyze(target, "", effectiveSettings);
    return analyzeOverview(target, effectiveSettings);
  }

  function showFeedback(tone: FeedbackTone, message: string, detail?: string) {
    if (feedbackTimerRef.current !== null) window.clearTimeout(feedbackTimerRef.current);
    setFeedback({ id: Date.now(), tone, message, detail });
    const duration = tone === "error" ? 6_500 : tone === "warning" ? 4_500 : tone === "info" ? 3_200 : 2_800;
    feedbackTimerRef.current = window.setTimeout(() => {
      setFeedback(null);
      feedbackTimerRef.current = null;
    }, duration);
  }

  async function copyText(value: string, label: string) {
    try {
      await navigator.clipboard.writeText(value);
      showFeedback("success", `${label}已复制`, "可直接粘贴到设计文档或提示词工具。");
    } catch (caught) {
      showError(caught instanceof Error ? caught : new Error("浏览器拒绝访问剪贴板。"));
    }
  }

  async function loadFile(file: File) {
    if (!file.type.startsWith("image/")) return;
    if (file.size > 20 * 1024 * 1024) {
      setError("图片不能超过 20 MB。");
      return;
    }
    const dataUrl = await fileToDataUrl(file);
    const nextSource: ImageSource = {
      id: crypto.randomUUID(),
      kind: "upload",
      dataUrl,
      fileName: file.name
    };
    activeSourceIdRef.current = nextSource.id;
    await sendRequest({ type: "SET_SELECTION", source: nextSource });
    await acceptSource(nextSource);
  }

  async function loadUrl() {
    const url = urlInput.trim();
    if (!/^https?:\/\//i.test(url)) {
      setError("请输入完整的 http 或 https 图片地址。");
      return;
    }
    try {
      await requestUrlAccess(url);
      const nextSource: ImageSource = {
        id: crypto.randomUUID(),
        kind: "url",
        url
      };
      activeSourceIdRef.current = nextSource.id;
      await sendRequest({ type: "SET_SELECTION", source: nextSource });
      setUrlInput("");
      await acceptSource(nextSource);
    } catch (caught) {
      showError(caught);
    }
  }

  async function changeTheme(themeMode: ThemeMode, themeId: ThemeId) {
    try {
      const saved = await sendRequest<AppSettings>({ type: "SAVE_SETTINGS", settings: { themeMode, themeId } });
      setSettings(saved);
      setDraftSettings((current) => ({ ...current, themeMode: saved.themeMode, themeId: saved.themeId }));
      settingsRef.current = saved;
      const theme = resolveTheme(saved.themeMode, saved.themeId);
      showFeedback("success", themeMode === "daily" ? "已启用每日灵感" : `已切换为${theme.label}`, theme.description);
    } catch (caught) {
      showError(caught);
    }
  }

  function beginAnalysisTask(action: "overview" | "analyze"): AbortController {
    analysisAbortRef.current?.abort();
    const controller = new AbortController();
    analysisAbortRef.current = controller;
    const phases = Object.fromEntries(
      (["prepare", "overview", "design", "structure", "cmf", "archive"] as AnalysisTaskPhase[])
        .map((phase) => [phase, "pending"])
    ) as Record<AnalysisTaskPhase, AnalysisTaskPhaseStatus>;
    setAnalysisTask({ action, status: "running", phases, startedAt: Date.now(), elapsedMs: 0 });
    return controller;
  }

  function updateAnalysisTaskPhase(phase: AnalysisTaskPhase, phaseStatus: "active" | "complete") {
    setAnalysisTask((current) => current?.status === "running"
      ? { ...current, phases: { ...current.phases, [phase]: phaseStatus }, elapsedMs: Date.now() - current.startedAt }
      : current);
  }

  function finishAnalysisTask(statusValue: "complete" | "failed" | "cancelled", taskError?: string) {
    setAnalysisTask((current) => {
      if (!current || current.status !== "running") return current;
      const phases = Object.fromEntries(Object.entries(current.phases).map(([phase, phaseStatus]) => [
        phase,
        phaseStatus === "active" ? (statusValue === "cancelled" ? "cancelled" : statusValue === "failed" ? "failed" : "complete") : phaseStatus
      ])) as Record<AnalysisTaskPhase, AnalysisTaskPhaseStatus>;
      return { ...current, status: statusValue, phases, elapsedMs: Date.now() - current.startedAt, error: taskError };
    });
  }

  function cancelAnalysisTask() {
    analysisAbortRef.current?.abort(new DOMException("用户取消了分析", "AbortError"));
    setStatus("分析已取消 · 图片与已完成结果已保留");
  }

  function retryAnalysisTask() {
    if (analysisTask?.action === "analyze") void analyze();
    else void analyzeOverview();
  }

  async function analyzeOverview(
    target = source,
    effectiveSettings = settings
  ): Promise<AnalysisOverviewResult | null> {
    if (!target) return null;
    const controller = beginAnalysisTask("overview");
    setBusy("overview");
    setError("");
    setStatus("正在生成设计概览");
    try {
      await ensureRemoteAccess(effectiveSettings, target);
      const { runImageOverview } = await import("../../lib/operations");
      const nextOverview = await runImageOverview(effectiveSettings, target, {
        signal: controller.signal,
        onProgress: (stage, stageStatus) => updateAnalysisTaskPhase(stage, stageStatus)
      });
      if (activeSourceIdRef.current !== target.id) return null;
      await persistAnalysisOverview(nextOverview);
      setOverview(nextOverview);
      setPreparedDataUrl(nextOverview.previewDataUrl);
      setSource((current) => current?.id === target.id ? { ...current, dataUrl: nextOverview.previewDataUrl } : current);
      setAnalysisView("overview");
      setStatus("设计概览已就绪 · 可按需生成完整 JSON");
      showFeedback("success", "设计概览已生成", "先判断学习价值，再决定是否生成完整 JSON。");
      finishAnalysisTask("complete");
      return nextOverview;
    } catch (caught) {
      if (isAbortError(caught)) {
        finishAnalysisTask("cancelled");
        setStatus("分析已取消 · 图片与已完成结果已保留");
      } else if (activeSourceIdRef.current === target.id) {
        const message = errorMessage(caught);
        finishAnalysisTask("failed", message);
        showError(caught);
      }
      return null;
    } finally {
      if (analysisAbortRef.current === controller) analysisAbortRef.current = null;
      if (activeSourceIdRef.current === target.id) setBusy(null);
    }
  }

  async function analyze(
    target = source,
    directive = reconstructionDirective,
    effectiveSettings = settings
  ): Promise<AnalysisResult | null> {
    if (!target) return null;
    const controller = beginAnalysisTask("analyze");
    setBusy("analyze");
    setError("");
    setStatus("正在生成完整结构、设计智能与 CMF JSON");
    try {
      await ensureRemoteAccess(effectiveSettings, target);
      const { runImageAnalysis } = await import("../../lib/operations");
      const reusableOverview = overview?.source.id === target.id ? overview : undefined;
      const analyzed = await runImageAnalysis(effectiveSettings, target, directive, reusableOverview, {
        signal: controller.signal,
        onProgress: (stage, stageStatus) => updateAnalysisTaskPhase(stage, stageStatus)
      });
      if (activeSourceIdRef.current !== target.id) return null;
      const anchors = buildEvidenceAnchors({ materialRegions, ocrResult, subjectSegmentation });
      const nextResultBase: AnalysisResult = {
        ...analyzed,
        materialRegions: target.id === source?.id ? materialRegions : [],
        ocrResult: target.id === source?.id ? ocrResult : undefined,
        subjectSegmentation: target.id === source?.id ? subjectSegmentation : undefined,
        references: target.id === source?.id ? references : [],
        evidenceAnchors: anchors
      };
      const nextResult: AnalysisResult = { ...nextResultBase, evidenceLinks: buildEvidenceLinks(nextResultBase, anchors) };
      await persistAnalysisResult(nextResult);
      setResult(nextResult);
      setAnalysisView("analysis");
      setPreparedDataUrl(nextResult.previewDataUrl);
      setSource((current) => current?.id === target.id ? { ...current, dataUrl: nextResult.previewDataUrl } : current);
      try {
        updateAnalysisTaskPhase("archive", "active");
        await archiveResult(nextResult);
        updateAnalysisTaskPhase("archive", "complete");
        setStatus("完整 JSON 已生成并归档");
        showFeedback("success", "完整分析已生成", "结构、设计智能与 CMF 已保存到本地档案。");
      } catch (archiveError) {
        setError(`完整 JSON 已生成，但本地归档失败：${archiveError instanceof Error ? archiveError.message : "未知错误"}`);
        setStatus("完整 JSON 已生成，归档失败");
        showFeedback("warning", "分析完成，但归档失败", "JSON 仍可查看或下载，请检查浏览器存储后重试归档。");
      }
      finishAnalysisTask("complete");
      return nextResult;
    } catch (caught) {
      if (isAbortError(caught)) {
        finishAnalysisTask("cancelled");
        setStatus("分析已取消 · 概览和图片已保留");
      } else if (activeSourceIdRef.current === target.id) {
        const message = errorMessage(caught);
        finishAnalysisTask("failed", message);
        showError(caught);
      }
      return null;
    } finally {
      if (analysisAbortRef.current === controller) analysisAbortRef.current = null;
      if (activeSourceIdRef.current === target.id) setBusy(null);
    }
  }

  async function editImage() {
    if (!source) return;
    if (!editPrompt.trim()) {
      setError("请输入图片编辑要求。");
      setStatus("等待编辑要求");
      return;
    }
    setBusy("edit");
    setError("");
    setStatus("gpt-image-2 正在编辑图片");
    try {
      await ensureRemoteAccess(settings, source);
      const { runImageEdit } = await import("../../lib/operations");
      const output = await runImageEdit(settings, source, editPrompt);
      setEditedDataUrl(output.dataUrl);
      setEditPreview("edited");
      setStatus("图片编辑完成");
      showFeedback("success", "图片编辑完成", "结果已切换到编辑图，可返回原图对照。");
    } catch (caught) {
      showError(caught);
    } finally {
      setBusy(null);
    }
  }

  async function reconstructImage() {
    if (!source || !result) return;
    const reconstruction = result.analysis.reconstruction;
    const prompt = [
      "Reconstruct the supplied reference image with high visual fidelity.",
      reconstruction.positivePrompt,
      `Measured palette: ${result.measured.palette.map((color) => `${color.hex}${color.correction ? " (user corrected)" : ""}`).join(", ") || "not available"}`,
      `Must preserve: ${reconstruction.mustPreserve.join("; ")}`,
      `Avoid: ${reconstruction.negativePrompt}`
    ].join("\n");
    setBusy("reconstruct");
    setError("");
    setStatus("正在生成复现预览");
    try {
      await ensureRemoteAccess(settings, source);
      const { runImageEdit } = await import("../../lib/operations");
      const output = await runImageEdit(settings, source, prompt);
      setEditedDataUrl(output.dataUrl);
      setEditPreview("edited");
      setWorkbenchTool("edit");
      setView("workbench");
      setStatus("复现预览已生成");
      showFeedback("success", "复现预览已生成", "已进入工作台，可与证据原图对照。");
    } catch (caught) {
      showError(caught);
    } finally {
      setBusy(null);
    }
  }

  function updateReconstructionPrompt(field: "positivePrompt" | "negativePrompt", value: string) {
    setResult((current) => current ? {
      ...current,
      analysis: {
        ...current.analysis,
        reconstruction: { ...current.analysis.reconstruction, [field]: value }
      }
    } : current);
  }

  async function commitResultChanges() {
    if (!result) return;
    try {
      await Promise.all([persistAnalysisResult(result), archiveResult(result)]);
      setStatus("提示词已更新并归档");
      showFeedback("success", "提示词已保存", "当前档案与复现提示词已同步更新。");
    } catch (caught) {
      showError(caught);
    }
  }

  async function restorePromptVersion(version: PromptVersionRecord) {
    setReconstructionDirective(version.reconstructionDirective);
    if (!result) return;
    const nextResult: AnalysisResult = {
      ...result,
      reconstructionDirective: version.reconstructionDirective,
      analysis: {
        ...result.analysis,
        reconstruction: {
          ...result.analysis.reconstruction,
          positivePrompt: version.positivePrompt,
          negativePrompt: version.negativePrompt
        }
      }
    };
    setResult(nextResult);
    try {
      await persistAnalysisResult(nextResult);
      setStatus(`已恢复提示词版本：${version.label}`);
      showFeedback("success", "提示词版本已恢复", version.label);
    } catch (caught) {
      showError(caught);
    }
  }

  async function applySubjectCrop(rect: { x: number; y: number; width: number; height: number }, aspect?: number) {
    if (!source) return;
    try {
      setBusy("archive");
      setStatus("正在生成主体裁切");
      let imageUrl = preparedDataUrl || result?.previewDataUrl || source.dataUrl;
      if (!imageUrl) {
        const { prepareImage } = await import("../../lib/image");
        imageUrl = (await prepareImage(source)).dataUrl;
      }
      const cropped = await cropImageDataUrl(imageUrl, rect, aspect);
      const nextSource = createCroppedImageSource(source, imageUrl, cropped.dataUrl, {
          id: crypto.randomUUID(),
          rect: cropped.rect,
          sourceWidth: cropped.sourceWidth,
          sourceHeight: cropped.sourceHeight,
          outputWidth: cropped.outputWidth,
          outputHeight: cropped.outputHeight,
          createdAt: new Date().toISOString()
      });
      activeSourceIdRef.current = nextSource.id;
      await sendRequest({ type: "SET_SELECTION", source: nextSource });
      await acceptSource(nextSource, false);
      setWorkbenchTool("regions");
      setView("workbench");
      setStatus(`主体裁切完成 · ${cropped.outputWidth} x ${cropped.outputHeight}`);
      showFeedback("success", "主体裁切已应用", `${cropped.outputWidth} x ${cropped.outputHeight}，可随时返回原图。`);
    } catch (caught) {
      showError(caught);
    } finally {
      setBusy(null);
    }
  }

  async function restoreOriginalAfterCrop() {
    if (!source) return;
    const restoredSource = restoreOriginalImageSource(source);
    if (!restoredSource) return;
    try {
      setBusy("archive");
      setStatus("正在恢复原图");
      activeSourceIdRef.current = restoredSource.id;
      await sendRequest({ type: "SET_SELECTION", source: restoredSource });
      await acceptSource(restoredSource, false);
      setWorkbenchTool("regions");
      setView("workbench");
      setStatus("已返回原图 · 裁切派生结果已清除");
      showFeedback("success", "已返回原图", "裁切派生结果已清除。");
    } catch (caught) {
      showError(caught);
    } finally {
      setBusy(null);
    }
  }

  async function saveMaterialRegions(regions: MaterialRegion[]) {
    setMaterialRegions(regions);
    if (!result) {
      setStatus(`已标注 ${regions.length} 个材料区域，完成分析后自动归档`);
      return;
    }
    const anchors = buildEvidenceAnchors({ materialRegions: regions, ocrResult, subjectSegmentation });
    const nextResultBase = { ...result, materialRegions: regions, evidenceAnchors: anchors };
    const nextResult = { ...nextResultBase, evidenceLinks: buildEvidenceLinks(nextResultBase, anchors) };
    setResult(nextResult);
    try {
      await Promise.all([persistAnalysisResult(nextResult), archiveResult(nextResult)]);
      setStatus(`已归档 ${regions.length} 个材料区域`);
      showFeedback("success", "材料区域已保存", `${regions.length} 个区域已写入当前档案。`);
    } catch (caught) {
      showError(caught);
    }
  }

  async function saveOcrResult(output: OcrResult) {
    setOcrResult(output);
    if (!result) {
      setStatus(`本地 OCR 完成 · ${output.lines.length} 行文字，完成分析后自动归档`);
      return;
    }
    const anchors = buildEvidenceAnchors({ materialRegions, ocrResult: output, subjectSegmentation });
    const nextResultBase = { ...result, ocrResult: output, evidenceAnchors: anchors };
    const nextResult = { ...nextResultBase, evidenceLinks: buildEvidenceLinks(nextResultBase, anchors) };
    setResult(nextResult);
    try {
      await Promise.all([persistAnalysisResult(nextResult), archiveResult(nextResult)]);
      setStatus(`本地 OCR 已归档 · ${output.lines.length} 行文字`);
      showFeedback("success", "OCR 结果已保存", `${output.lines.length} 行文字已写入当前档案。`);
    } catch (caught) {
      showError(caught);
    }
  }

  async function saveSubjectSegmentation(output: SubjectSegmentation) {
    setSubjectSegmentation(output);
    if (!result) {
      setStatus(`主体分区完成 · 估计覆盖 ${Math.round(output.coverage * 100)}%，完成分析后自动归档`);
      return;
    }
    const anchors = buildEvidenceAnchors({ materialRegions, ocrResult, subjectSegmentation: output });
    const nextResultBase = { ...result, subjectSegmentation: output, evidenceAnchors: anchors };
    const nextResult = { ...nextResultBase, evidenceLinks: buildEvidenceLinks(nextResultBase, anchors) };
    setResult(nextResult);
    try {
      await Promise.all([persistAnalysisResult(nextResult), archiveResult(nextResult)]);
      setStatus(`主体分区已归档 · 估计覆盖 ${Math.round(output.coverage * 100)}%`);
      showFeedback("success", "主体分区已保存", `估计覆盖 ${Math.round(output.coverage * 100)}%，边界仍需人工确认。`);
    } catch (caught) {
      showError(caught);
    }
  }

  async function resolveCurrentImage(): Promise<string> {
    const current = preparedDataUrl || result?.previewDataUrl || source?.dataUrl;
    if (current) return current;
    if (!source) throw new Error("请先选择一张图片。");
    const { prepareImage } = await import("../../lib/image");
    const prepared = await prepareImage(source);
    setPreparedDataUrl(prepared.dataUrl);
    return prepared.dataUrl;
  }

  async function updatePaletteColor(index: number, value: string) {
    if (!result) return;
    try {
      const { createCorrectedPaletteColor, withPaletteComparisons } = await import("../../shared/color");
      const palette = [...result.measured.palette];
      const current = palette[index];
      if (!current) return;
      const corrected = createCorrectedPaletteColor(current, value);
      palette[index] = corrected;
      const analysis = result.analysis.cmfAnalysis ? {
        ...result.analysis,
        cmfAnalysis: {
          ...result.analysis.cmfAnalysis,
          colorSystem: {
            ...result.analysis.cmfAnalysis.colorSystem,
            roles: result.analysis.cmfAnalysis.colorSystem.roles.map((role) => ({
              ...role,
              measuredHexCandidates: role.measuredHexCandidates.map((candidate) => (
                candidate.toUpperCase() === current.hex.toUpperCase() ? corrected.hex : candidate
              ))
            }))
          }
        }
      } : result.analysis;
      const nextResult: AnalysisResult = {
        ...result,
        measured: { ...result.measured, palette: withPaletteComparisons(palette) },
        analysis
      };
      setResult(nextResult);
      await Promise.all([persistAnalysisResult(nextResult), archiveResult(nextResult)]);
      setStatus(palette[index]?.correction ? "色板修正已归档" : "已恢复实测颜色");
      showFeedback("success", palette[index]?.correction ? "颜色修正已保存" : "已恢复实测颜色", corrected.hex.toUpperCase());
    } catch (caught) {
      showError(caught);
    }
  }

  async function loadArchives() {
    try {
      const { listAnalysisArchives } = await import("../../lib/archive");
      setArchiveRecords(await listAnalysisArchives());
    } catch (caught) {
      showError(caught);
    }
  }

  async function archiveResult(nextResult: AnalysisResult) {
    const { listAnalysisArchives, saveAnalysisArchive } = await import("../../lib/archive");
    await saveAnalysisArchive(nextResult);
    setArchiveRecords(await listAnalysisArchives());
  }

  async function restoreArchive(record: AnalysisArchiveRecord) {
    const restoredSource: ImageSource = {
      ...record.result.source,
      dataUrl: record.result.previewDataUrl
    };
    activeSourceIdRef.current = restoredSource.id;
    setSource(restoredSource);
    setOverview(null);
    setResult(record.result);
    setPreparedDataUrl(record.result.previewDataUrl);
    setReconstructionDirective(record.result.reconstructionDirective || "");
    setMaterialRegions(record.result.materialRegions ?? []);
    setOcrResult(record.result.ocrResult);
    setSubjectSegmentation(record.result.subjectSegmentation);
    setReferences(record.result.references ?? []);
    setActiveEvidenceIds([]);
    setEvidenceMessage("");
    setAnalysisTask(null);
    setEditedDataUrl("");
    setThreeViewDataUrl("");
    setEditPreview("source");
    setAnalysisView("analysis");
    setView("analysis");
    await persistSessionState(restoredSource, record.result);
    setStatus("已载入本地档案");
    showFeedback("info", "设计档案已打开", record.title);
  }

  async function toggleArchiveFavorite(record: AnalysisArchiveRecord) {
    try {
      const { setAnalysisArchiveFavorite } = await import("../../lib/archive");
      await setAnalysisArchiveFavorite(record.id, !record.favorite);
      await loadArchives();
      setStatus(record.favorite ? "已取消收藏" : "已收藏档案");
      showFeedback("success", record.favorite ? "已取消收藏" : "已收藏档案", record.title);
    } catch (caught) {
      showError(caught);
    }
  }

  async function removeArchive(record: AnalysisArchiveRecord) {
    if (!window.confirm(`删除“${record.title}”的本地档案？此操作无法撤销。`)) return;
    try {
      const { deleteAnalysisArchive } = await import("../../lib/archive");
      await deleteAnalysisArchive(record.id);
      await loadArchives();
      setStatus("本地档案已删除");
      showFeedback("success", "本地档案已删除", record.title);
    } catch (caught) {
      showError(caught);
    }
  }

  async function generateThreeView() {
    if (!source) return;
    if (!result) {
      setError("三视图需要完整结构 JSON。请先在概览页选择“生成完整 JSON”。");
      setStatus("等待完整 JSON");
      setView("analysis");
      return;
    }
    const analysisResult = result;
    setBusy("three-view");
    setError("");
    setStatus("正在生成正交三视图");
    try {
      await ensureRemoteAccess(settings, source);
      const { runThreeViewGeneration } = await import("../../lib/operations");
      const output = await runThreeViewGeneration(
        settings,
        { ...source, dataUrl: analysisResult.previewDataUrl },
        analysisResult.analysis,
        analysisResult.measured
      );
      setThreeViewDataUrl(output.dataUrl);
      const generatedReference: ReferenceImage = {
        id: `generated-three-view:${Date.now()}`,
        source: {
          id: `generated-three-view:${Date.now()}`,
          kind: "upload",
          dataUrl: output.dataUrl,
          fileName: "yantai-three-view.png"
        },
        viewKind: "orthographic-sheet",
        provenance: "generated",
        confidence: Math.min(
          analysisResult.analysis.orthographicPlan.viewConfidence.front,
          analysisResult.analysis.orthographicPlan.viewConfidence.left,
          analysisResult.analysis.orthographicPlan.viewConfidence.top
        ),
        createdAt: new Date().toISOString()
      };
      const nextReferences = [...references.filter((item) => item.viewKind !== "orthographic-sheet" || item.provenance !== "generated"), generatedReference];
      await saveReferences(nextReferences);
      setEditPreview("three-view");
      setStatus("三视图生成完成");
      showFeedback("success", "三视图已生成", "已加入补充视图，可继续导出 3D 交接包。");
    } catch (caught) {
      showError(caught);
    } finally {
      setBusy(null);
    }
  }

  async function addReferenceFile(file: File) {
    if (!file.type.startsWith("image/")) return;
    if (file.size > 20 * 1024 * 1024) {
      setError("补充视图不能超过 20 MB。");
      return;
    }
    const dataUrl = await fileToDataUrl(file);
    const id = crypto.randomUUID();
    const reference: ReferenceImage = {
      id,
      source: { id, kind: "upload", dataUrl, fileName: file.name },
      viewKind: referenceViewKind,
      provenance: "original",
      confidence: 1,
      createdAt: new Date().toISOString()
    };
    const nextReferences = [...references, reference];
    await saveReferences(nextReferences);
    setStatus(`已添加${referenceViewLabel(referenceViewKind)}参考图 · 当前不会自动改写既有分析`);
    showFeedback("success", "补充视图已添加", "既有分析不会自动改写，重新分析后才会使用新证据。");
  }

  async function removeReference(id: string) {
    const nextReferences = references.filter((item) => item.id !== id);
    await saveReferences(nextReferences);
    setStatus("补充视图已移除");
    showFeedback("success", "补充视图已移除");
  }

  async function saveReferences(nextReferences: ReferenceImage[]) {
    setReferences(nextReferences);
    await persistReferences(nextReferences);
    if (!result) return;
    const nextResult = { ...result, references: nextReferences };
    setResult(nextResult);
    await Promise.all([persistAnalysisResult(nextResult), archiveResult(nextResult)]);
  }

  function locateEvidence(claimLabel: string, evidenceText: string[], explicitIds?: string[]) {
    const ids = explicitIds?.length
      ? explicitIds
      : matchEvidenceAnchorIds(claimLabel, evidenceText, evidenceAnchors);
    setActiveEvidenceIds(ids);
    if (ids.length) {
      setEvidenceMessage(`已定位 ${ids.length} 个图像证据区域`);
      window.scrollTo({ top: 0, behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
    } else {
      setEvidenceMessage("该结论目前只有文字证据，尚未关联图像坐标。可在工作台标注材料区域后重新分析。");
    }
  }

  async function exportReconstructionPackage() {
    if (!source || !result) return;
    const sourceDataUrl = preparedDataUrl || result.previewDataUrl || source.dataUrl;
    if (!sourceDataUrl) {
      setError("无法导出交接包：缺少可嵌入的原图数据。");
      return;
    }
    try {
      const { createReconstructionPackage } = await import("../../shared/reconstruction-package");
      const archive = createReconstructionPackage({ result, source, sourceDataUrl, references, editedDataUrl });
      const buffer = archive.slice().buffer as ArrayBuffer;
      downloadBlob(new Blob([buffer], { type: "application/zip" }), "yantai-img2threejs-handoff.zip");
      setStatus("img2threejs 交接包已导出");
      showFeedback("success", "3D 交接包已下载", "包含证据清单、结构化分析与可用参考图。");
    } catch (caught) {
      showError(caught);
    }
  }

  async function saveSettings() {
    setBusy("save");
    setError("");
    try {
      const saved = await sendRequest<AppSettings>({ type: "SAVE_SETTINGS", settings: draftSettings });
      setSettings(saved);
      settingsRef.current = saved;
      setDraftSettings(saved);
      setStatus("设置已保存");
      showFeedback("success", "设置已保存", saved.autoAnalyze
        ? `自动分析：${saved.analysisFlow === "full-direct" ? "完整分析" : "先生成概览"}`
        : "自动分析已关闭，可在首页按次选择分析方式。");
    } catch (caught) {
      showError(caught);
    } finally {
      setBusy(null);
    }
  }

  async function testConnection() {
    setBusy("test");
    setError("");
    setStatus("正在测试 OpenAI 连接");
    try {
      await requestUrlAccess(draftSettings.apiBaseUrl);
      const { testOpenAIConnection } = await import("../../lib/openai");
      const test = await testOpenAIConnection(draftSettings);
      setConnectionTestResult(test);
      const reconciled = reconcileSettingsWithCatalog(draftSettings, test);
      setDraftSettings(reconciled);
      if (!test.analysisModels.length || !test.imageModels.length) {
        setStatus("已连接，模型分类需要确认");
        showFeedback("warning", "API 已连接", "部分模型未能自动分类，请手动确认模型名称后保存。");
      } else {
        const changed = reconciled.analysisModel !== draftSettings.analysisModel
          || reconciled.imageModel !== draftSettings.imageModel;
        setStatus(`${changed ? "已读取并匹配模型" : "模型目录已更新"} · ${test.latencyMs} ms`);
        showFeedback("success", "模型目录已读取", `${test.modelCount} 个模型 · ${test.latencyMs} ms`);
      }
    } catch (caught) {
      setConnectionTestResult(null);
      showError(caught);
    } finally {
      setBusy(null);
    }
  }

  function showError(caught: unknown) {
    const message = caught instanceof Error ? caught.message : "发生未知错误。";
    setError(message);
    setStatus("操作失败");
  }

  async function exportBackup(includeApiKey: boolean) {
    setBusy("backup");
    setError("");
    setStatus("正在整理本地数据");
    try {
      const [{ exportArchiveData }, { createVisualLensBackup }] = await Promise.all([
        import("../../lib/archive"),
        import("../../shared/backup")
      ]);
      const archive = await exportArchiveData();
      const backup = createVisualLensBackup({
        extensionVersion: APP_VERSION,
        settings,
        analyses: archive.analyses,
        promptVersions: archive.promptVersions,
        includeApiKey
      });
      const date = backup.exportedAt.slice(0, 10);
      downloadBlob(
        new Blob([JSON.stringify(backup, null, 2)], { type: "application/json;charset=utf-8" }),
        `yantai-backup-${date}.json`
      );
      setStatus("完整备份已导出");
      showFeedback(
        "success",
        "备份已下载",
        `${archive.analyses.length} 个档案 · ${archive.promptVersions.length} 个提示词版本${includeApiKey ? " · 含 API Key" : " · 不含 API Key"}`
      );
    } catch (caught) {
      showError(caught);
    } finally {
      setBusy(null);
    }
  }

  async function importBackup(file: File, mode: BackupImportMode) {
    if (mode === "replace" && !window.confirm("替换恢复会先清空当前档案和提示词版本，再写入备份。是否继续？")) return;
    if (file.size > 250 * 1024 * 1024) {
      showError(new Error("备份文件超过 250 MB，未读取或修改任何数据。"));
      return;
    }
    setBusy("backup");
    setError("");
    setStatus("正在校验备份");
    try {
      let raw: unknown;
      try {
        raw = JSON.parse(await file.text());
      } catch {
        throw new Error("备份文件不是有效的 JSON，未修改任何数据。");
      }
      const [{ importArchiveData }, { applyBackupSettings, parseVisualLensBackup }] = await Promise.all([
        import("../../lib/archive"),
        import("../../shared/backup")
      ]);
      const backup = parseVisualLensBackup(raw);
      const summary = await importArchiveData({
        analyses: backup.analyses,
        promptVersions: backup.promptVersions
      }, mode);
      const restoredSettings = applyBackupSettings(settingsRef.current, backup.settings);
      const saved = await sendRequest<AppSettings>({ type: "SAVE_SETTINGS", settings: restoredSettings });
      settingsRef.current = saved;
      setSettings(saved);
      setDraftSettings(saved);
      setConnectionTestResult(null);
      await loadArchives();
      const changedAnalyses = summary.analysesAdded + summary.analysesUpdated;
      setStatus("备份恢复完成");
      showFeedback(
        "success",
        mode === "replace" ? "数据已替换恢复" : "数据已合并恢复",
        `档案写入 ${changedAnalyses} 个 · 提示词写入 ${summary.promptVersionsAdded} 个 · 跳过 ${summary.analysesSkipped + summary.promptVersionsSkipped} 个`
      );
    } catch (caught) {
      showError(caught);
    } finally {
      setBusy(null);
    }
  }

  return (
    <main className="app-shell" data-theme={activeTheme.id} onDragOver={(event) => event.preventDefault()} onDrop={(event) => {
      event.preventDefault();
      const file = Array.from(event.dataTransfer.files).find((item) => item.type.startsWith("image/"));
      if (file) void loadFile(file);
    }}>
      <header className="app-header">
        <div className="brand-block">
          <img className="brand-mark" src="/brand/yantai-logo.png" alt="砚台 Logo" width={36} height={36} />
          <div><h1>砚台</h1><p>v{APP_VERSION}</p></div>
        </div>
        <div className="header-actions">
          <nav className="top-nav" aria-label="主要功能">
            <IconTab active={view === "analysis"} title="分析" label="分析" onClick={() => setView("analysis")}><ScanSearch size={17} /></IconTab>
            <IconTab active={view === "workbench"} title="设计工作台" label="工作台" onClick={() => setView("workbench")}><Wrench size={17} /></IconTab>
            <IconTab active={view === "archive"} title="设计档案" label="档案" onClick={() => setView("archive")}><Archive size={17} /></IconTab>
            <IconTab active={view === "settings"} title="设置" label="设置" onClick={() => setView("settings")}><Settings size={17} /></IconTab>
          </nav>
          <div className="theme-control">
            <button className="theme-trigger" title="切换界面主题" aria-label="切换界面主题" aria-expanded={themeMenuOpen} onClick={() => setThemeMenuOpen((open) => !open)}><Palette size={18} /></button>
            {themeMenuOpen && <ThemeMenu
              activeThemeId={activeTheme.id}
              mode={settings.themeMode}
              onSelect={(mode, id) => {
                setThemeMenuOpen(false);
                void changeTheme(mode, id);
              }}
              onRandom={() => {
                const next = randomThemeId(activeTheme.id);
                setThemeMenuOpen(false);
                void changeTheme("manual", next);
              }}
            />}
          </div>
        </div>
      </header>

      {error && <div className="error-banner" role="alert"><AlertTriangle size={16} /><span>{error}<small>{errorGuidance(error)}</small></span><button title="关闭" aria-label="关闭错误提示" onClick={() => setError("")}><X size={16} /></button></div>}
      <InteractionFeedback notice={feedback} onDismiss={() => setFeedback(null)} />
      <input ref={fileInputRef} name="source-image" type="file" accept="image/*" hidden onChange={(event) => {
        const file = event.target.files?.[0];
        if (file) void loadFile(file);
        event.target.value = "";
      }} />
      <input ref={referenceFileInputRef} name="reference-image" type="file" accept="image/*" hidden onChange={(event) => {
        const file = event.target.files?.[0];
        if (file) void addReferenceFile(file);
        event.target.value = "";
      }} />

      {view === "analysis" && (
        <section className="source-band">
          {activeImage ? (
            <div className="image-stage-wrap">
              <div className={`image-stage ${sourcePreviewMode === "actual" ? "actual-size" : "fit-size"}`}>
                <div className="image-evidence-frame" style={{ "--image-ratio": activeImageRatio } as React.CSSProperties}>
                  <img src={activeImage} alt="当前分析图片" width={1600} height={1200} />
                  {sourcePreviewMode === "fit" && editPreview === "source" && <div className="evidence-overlay" aria-label="图像证据区域">
                    {evidenceAnchors.filter((anchor) => anchor.rect).map((anchor) => <button
                      key={anchor.id}
                      className={`evidence-anchor ${activeEvidenceIds.includes(anchor.id) ? "active" : ""}`}
                      style={normalizedRectStyle(anchor.rect!)}
                      title={`${anchor.label} · ${evidenceProvenanceLabel(anchor.provenance)}`}
                      aria-label={`证据区域：${anchor.label}`}
                      onClick={() => {
                        setActiveEvidenceIds([anchor.id]);
                        setEvidenceMessage(`${anchor.label} · ${evidenceProvenanceLabel(anchor.provenance)}`);
                      }}
                    ><span>{anchor.label}</span></button>)}
                  </div>}
                </div>
              </div>
              <div className="image-view-control segmented" aria-label="图片查看方式">
                <button className={sourcePreviewMode === "fit" ? "active" : ""} title="完整显示" aria-label="完整显示图片" onClick={() => setSourcePreviewMode("fit")}><Maximize2 size={14} /><span>完整</span></button>
                <button className={sourcePreviewMode === "actual" ? "active" : ""} title="按原始像素显示" aria-label="按原始像素显示图片" onClick={() => setSourcePreviewMode("actual")}><Scan size={14} /><span>1:1</span></button>
              </div>
            </div>
          ) : (
            <button className="empty-stage" aria-label="选择需要分析的图片" onClick={() => fileInputRef.current?.click()}>
              <ImageIcon size={32} />
              <span>选择图片</span>
            </button>
          )}
          {(activeEvidenceIds.length > 0 || evidenceMessage) && <div className="evidence-feedback" role="status">
            <ScanSearch size={15} /><span>{evidenceMessage || `已选择 ${activeEvidenceIds.length} 个证据区域`}</span>
            <button title="清除证据定位" aria-label="清除证据定位" onClick={() => { setActiveEvidenceIds([]); setEvidenceMessage(""); }}><X size={15} /></button>
          </div>}
          <AnalysisActions
            hasSource={Boolean(source)}
            hasOverview={Boolean(overview)}
            hasResult={Boolean(result)}
            autoAnalyze={settings.autoAnalyze}
            busy={busy}
            selected={analysisChoice}
            onSelect={setAnalysisChoice}
            onGenerate={() => {
              if (analysisChoice === "overview") void analyzeOverview();
              if (analysisChoice === "full") void analyze();
            }}
          />
          <div className="source-actions">
            <button className="button secondary" onClick={() => fileInputRef.current?.click()}><Upload size={16} />上传</button>
            <div className="url-control">
              <Link size={15} />
              <input name="image-url" type="url" autoComplete="off" aria-label="图片 URL" value={urlInput} onChange={(event) => setUrlInput(event.target.value)} placeholder="图片 URL…" onKeyDown={(event) => {
                if (event.key === "Enter") void loadUrl();
              }} />
              <button title="载入地址" aria-label="载入图片地址" disabled={!urlInput.trim()} onClick={() => void loadUrl()}><Check size={16} /></button>
            </div>
          </div>
          <label className="directive-control">
            <span>补充提示词</span>
            <textarea name="reconstruction-directive" autoComplete="off" value={reconstructionDirective} onChange={(event) => setReconstructionDirective(event.target.value)} rows={2} placeholder="描述需要保留的造型、结构或配色…" />
          </label>
        </section>
      )}

      {view === "analysis" && (
        <section className="workspace">
          {analysisTask && <AnalysisTaskProgress
            task={analysisTask}
            onCancel={cancelAnalysisTask}
            onRetry={retryAnalysisTask}
            onDismiss={() => setAnalysisTask(null)}
          />}
          <div className="workspace-toolbar">
            <div className="segmented" aria-label="分析视图">
              <button className={analysisView === "overview" ? "active" : ""} disabled={!overview} title={overview ? "查看快速概览" : "请先生成概览"} onClick={() => setAnalysisView("overview")}><ScanSearch size={15} />快览</button>
              <button className={analysisView === "analysis" ? "active" : ""} disabled={!result} title={result ? "查看完整分析" : "请先生成完整分析"} onClick={() => setAnalysisView("analysis")}><Eye size={15} />完整</button>
              <button className={analysisView === "json" ? "active" : ""} disabled={!result} title={result ? "查看完整 JSON" : "先生成完整 JSON"} onClick={() => setAnalysisView("json")}><FileJson size={15} />JSON</button>
            </div>
          </div>
          <ReferenceTray
            references={references}
            selectedViewKind={referenceViewKind}
            onViewKindChange={setReferenceViewKind}
            onAdd={() => referenceFileInputRef.current?.click()}
            onRemove={(id) => void removeReference(id)}
          />
          {analysisView === "json" && result ? (
            <JsonView result={result} onCopy={copyText} onFeedback={showFeedback} />
          ) : analysisView === "overview" && overview ? (
            <OverviewPreview overview={overview} busy={busy} onGenerateJson={() => void analyze()} onLocateEvidence={locateEvidence} />
          ) : result ? (
            <Overview
              result={result}
              onPromptChange={updateReconstructionPrompt}
              onPromptCommit={() => void commitResultChanges()}
              reconstructionDirective={reconstructionDirective}
              onPromptRestore={(version) => void restorePromptVersion(version)}
              onPaletteChange={(index, value) => void updatePaletteColor(index, value)}
              onReconstruct={() => void reconstructImage()}
              reconstructing={busy === "reconstruct"}
              onLocateEvidence={locateEvidence}
              references={references}
              onExportReconstruction={() => void exportReconstructionPackage()}
              onCopy={copyText}
              onFeedback={showFeedback}
            />
          ) : (
            <div className="empty-result">
              <ScanSearch size={28} />
              <strong>{source ? "请选择分析方式" : "先选择一张图片"}</strong><span>{source ? "上方两种方式可随时切换或重新生成" : "上传本地图片，或载入图片 URL"}</span>
            </div>
          )}
        </section>
      )}

      {view === "workbench" && <section className="workspace toolbox-workspace">
        <DesignToolbox
          activeTool={workbenchTool}
          onToolChange={setWorkbenchTool}
          imageUrl={preparedDataUrl || result?.previewDataUrl || overview?.previewDataUrl || source?.dataUrl || source?.url || ""}
          result={result}
          regions={materialRegions}
          ocrResult={ocrResult}
          segmentation={subjectSegmentation}
          disabled={!source || busy !== null}
          canRestoreOriginal={Boolean(source?.originalSource)}
          busyAction={busy}
          editPrompt={editPrompt}
          editedDataUrl={editedDataUrl}
          threeViewDataUrl={threeViewDataUrl}
          editPreview={editPreview}
          imageModel={settings.imageModel}
          onChooseImage={() => fileInputRef.current?.click()}
          onResolveImage={resolveCurrentImage}
          onApplyCrop={(rect, aspect) => void applySubjectCrop(rect, aspect)}
          onRestoreOriginal={() => void restoreOriginalAfterCrop()}
          onSaveRegions={(regions) => void saveMaterialRegions(regions)}
          onSaveOcr={(output) => void saveOcrResult(output)}
          onSaveSegmentation={(output) => void saveSubjectSegmentation(output)}
          onEditPromptChange={setEditPrompt}
          onEditPreviewChange={setEditPreview}
          onRequestFullAnalysis={() => {
            setAnalysisView("overview");
            setView("analysis");
            setStatus(overview ? "请确认是否生成完整 JSON" : "请先生成设计概览");
          }}
          onGenerateThreeView={() => void generateThreeView()}
          onEditImage={() => void editImage()}
          onFeedback={showFeedback}
        />
      </section>}

      {view === "archive" && (
        <ArchiveView
          records={archiveRecords}
          search={archiveSearch}
          onSearchChange={setArchiveSearch}
          onOpen={(record) => void restoreArchive(record)}
          onFavorite={(record) => void toggleArchiveFavorite(record)}
          onDelete={(record) => void removeArchive(record)}
          queryImage={preparedDataUrl || result?.previewDataUrl || source?.dataUrl || ""}
          querySha256={result?.measured.sha256}
          onSynced={loadArchives}
          onFeedback={showFeedback}
        />
      )}

      {view === "settings" && (
        <SettingsView
          settings={draftSettings}
          showKey={showKey}
          setShowKey={setShowKey}
          onChange={(next) => {
            const connectionChanged = next.apiKey !== draftSettings.apiKey || next.apiBaseUrl !== draftSettings.apiBaseUrl;
            setDraftSettings(next);
            if (connectionChanged) setConnectionTestResult(null);
          }}
          onSave={() => void saveSettings()}
          onTest={() => void testConnection()}
          onExportBackup={(includeApiKey) => void exportBackup(includeApiKey)}
          onImportBackup={(file, mode) => void importBackup(file, mode)}
          testResult={connectionTestResult}
          busy={busy}
        />
      )}

      <footer className="status-bar" role="status" aria-live="polite"><span className={`status-dot ${error ? "error" : busy ? "busy" : ""}`} />{status}<span className="model-tag">{settings.analysisModel}</span></footer>
    </main>
  );
}

function IconTab({ active, title, label, onClick, children }: { active: boolean; title: string; label: string; onClick: () => void; children: ReactNode }) {
  return <button className={active ? "active" : ""} title={title} aria-label={title} aria-current={active ? "page" : undefined} onClick={onClick}>{children}<span>{label}</span></button>;
}

function ThemeMenu({ activeThemeId, mode, onSelect, onRandom }: {
  activeThemeId: ThemeId;
  mode: ThemeMode;
  onSelect: (mode: ThemeMode, id: ThemeId) => void;
  onRandom: () => void;
}) {
  return <section className="theme-menu" aria-label="界面主题">
    <header><span><strong>界面灵感</strong><small>纹理不会覆盖分析图片</small></span><button title="随机切换主题" aria-label="随机切换主题" onClick={onRandom}><Shuffle size={16} /></button></header>
    <button className={`daily-theme ${mode === "daily" ? "active" : ""}`} onClick={() => onSelect("daily", activeThemeId)}>
      <span className="daily-mark"><Palette size={16} /></span><span><strong>每日灵感</strong><small>每天稳定切换一套配色</small></span>{mode === "daily" && <Check size={15} />}
    </button>
    <div className="theme-grid">{VISUAL_THEMES.map((theme) => <button key={theme.id} className={mode === "manual" && activeThemeId === theme.id ? "active" : ""} title={theme.description} onClick={() => onSelect("manual", theme.id)}>
      <span className="theme-swatches" aria-hidden="true">{theme.colors.map((color) => <i key={color} style={{ backgroundColor: color }} />)}</span>
      <span><strong>{theme.label}</strong><small>{theme.description}</small></span>
      {mode === "manual" && activeThemeId === theme.id && <Check size={14} />}
    </button>)}</div>
  </section>;
}

function AnalysisTaskProgress({ task, onCancel, onRetry, onDismiss }: {
  task: AnalysisTaskState;
  onCancel: () => void;
  onRetry: () => void;
  onDismiss: () => void;
}) {
  const phaseLabels: Record<AnalysisTaskPhase, string> = {
    prepare: "准备图片",
    overview: "设计概览",
    design: "设计智能",
    structure: "造型结构",
    cmf: "CMF",
    archive: "保存档案"
  };
  const visiblePhases = task.action === "overview"
    ? (["prepare", "overview"] as AnalysisTaskPhase[])
    : (["prepare", "design", "structure", "cmf", "archive"] as AnalysisTaskPhase[]);
  const completed = visiblePhases.filter((phase) => task.phases[phase] === "complete").length;
  const progress = task.status === "complete" ? 100 : Math.round(completed / visiblePhases.length * 100);
  const title = task.status === "running"
    ? (task.action === "overview" ? "正在生成快速概览" : "正在生成完整分析")
    : task.status === "complete" ? "本次分析已完成"
      : task.status === "cancelled" ? "本次分析已取消" : "本次分析未完成";
  return <section className={`analysis-task ${task.status}`} aria-live="polite">
    <header>
      <div><span>{title}</span><strong>{formatElapsed(task.elapsedMs)}</strong></div>
      {task.status === "running"
        ? <button className="task-command" onClick={onCancel}><X size={14} />取消</button>
        : <button className="task-icon" title="收起任务状态" aria-label="收起任务状态" onClick={onDismiss}><X size={15} /></button>}
    </header>
    <div className="task-progress" role="progressbar" aria-label="分析进度" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress}><span style={{ width: `${progress}%` }} /></div>
    <ol>{visiblePhases.map((phase) => <li key={phase} className={task.phases[phase]}>
      <span>{task.phases[phase] === "complete" ? <Check size={12} /> : task.phases[phase] === "active" ? <LoaderCircle size={12} className="spin" /> : task.phases[phase] === "failed" ? <AlertTriangle size={12} /> : <span />}</span>
      {phaseLabels[phase]}
    </li>)}</ol>
    {task.error && <p>{task.error}</p>}
    {(task.status === "failed" || task.status === "cancelled") && <button className="button secondary retry-button" onClick={onRetry}><RefreshCw size={15} />从当前图片重试</button>}
  </section>;
}

function ReferenceTray({ references, selectedViewKind, onViewKindChange, onAdd, onRemove }: {
  references: ReferenceImage[];
  selectedViewKind: ReferenceViewKind;
  onViewKindChange: (value: ReferenceViewKind) => void;
  onAdd: () => void;
  onRemove: (id: string) => void;
}) {
  const options: ReferenceViewKind[] = ["front", "left", "right", "top", "back", "detail", "unknown"];
  return <details className="reference-tray" open={references.length > 0}>
    <summary><span>补充视图 <b>{references.length}</b></span><small>用于证据与 3D 交接</small></summary>
    <div className="reference-add">
      <select aria-label="补充视图类型" value={selectedViewKind} onChange={(event) => onViewKindChange(event.target.value as ReferenceViewKind)}>
        {options.map((option) => <option key={option} value={option}>{referenceViewLabel(option)}</option>)}
      </select>
      <button className="button secondary" onClick={onAdd}><Plus size={15} />添加视图</button>
    </div>
    {references.length > 0 && <div className="reference-grid">{references.map((reference) => <article key={reference.id}>
      <img src={reference.source.dataUrl || reference.source.url} alt={`${referenceViewLabel(reference.viewKind)}参考图`} width={160} height={120} />
      <div><strong>{referenceViewLabel(reference.viewKind)}</strong><small>{reference.provenance === "generated" ? "AI 生成 · 非事实参考" : reference.provenance === "cropped" ? "裁切派生" : "真实上传"}</small></div>
      <button title="移除补充视图" aria-label={`移除${referenceViewLabel(reference.viewKind)}参考图`} onClick={() => onRemove(reference.id)}><X size={14} /></button>
    </article>)}</div>}
    <p>补充视图不会自动改写既有结论；重新分析前会作为独立证据保留。AI 三视图只用于假设校核。</p>
  </details>;
}

function AnalysisActions({ hasSource, hasOverview, hasResult, autoAnalyze, busy, selected, onSelect, onGenerate }: {
  hasSource: boolean;
  hasOverview: boolean;
  hasResult: boolean;
  autoAnalyze: boolean;
  busy: BusyAction;
  selected: ManualAnalysisChoice;
  onSelect: (choice: Exclude<ManualAnalysisChoice, null>) => void;
  onGenerate: () => void;
}) {
  const unavailable = busy !== null;
  const generatingOverview = busy === "overview";
  const generatingFull = busy === "analyze";
  const generateLabel = selected === "overview"
    ? (hasOverview ? "重新生成概览" : "生成概览")
    : (hasResult ? "重新生成完整分析" : "生成完整分析");
  return <section className="analysis-actions" aria-label="选择分析方式">
    <header><strong>选择分析方式</strong><span>{autoAnalyze ? "自动分析已开启" : "选择不会消耗 API"}</span></header>
    <div className="analysis-choice-grid">
      <button className={`analysis-action ${selected === "overview" ? "selected" : ""}`} aria-pressed={selected === "overview"} disabled={!hasSource || unavailable} onClick={() => onSelect("overview")}>
        <ScanSearch size={18} />
        <span><strong>概览</strong><small>快速判断设计语言、手法与 CMF 价值</small></span>
        {selected === "overview" && <Check size={16} className="choice-check" />}
      </button>
      <button className={`analysis-action ${selected === "full" ? "selected" : ""}`} aria-pressed={selected === "full"} disabled={!hasSource || unavailable} onClick={() => onSelect("full")}>
        <FileJson size={18} />
        <span><strong>完整分析</strong><small>生成完整 JSON 并保存到设计档案</small></span>
        {selected === "full" && <Check size={16} className="choice-check" />}
      </button>
    </div>
    {selected && <button className="button primary analysis-generate" disabled={!hasSource || unavailable} onClick={onGenerate}>
      {generatingOverview || generatingFull ? <LoaderCircle size={17} className="spin" /> : selected === "overview" ? <ScanSearch size={17} /> : <FileJson size={17} />}
      {generatingOverview ? "正在生成概览" : generatingFull ? "正在生成完整分析" : generateLabel}
    </button>}
    {!selected && hasSource && <p className="analysis-choice-hint">选择一种方式后，下方会出现生成按钮。</p>}
  </section>;
}

function CollapsibleSection({ title, summary, count, badge, defaultOpen = false, className = "", children }: {
  title: string;
  summary?: string;
  count?: number;
  badge?: string;
  defaultOpen?: boolean;
  className?: string;
  children: ReactNode;
}) {
  const [isOpen, setIsOpen] = useState(defaultOpen);
  return <details className={`collapsible-section ${className}`.trim()} open={isOpen} onToggle={(event) => setIsOpen(event.currentTarget.open)}>
    <summary>
      <span><strong>{title}</strong>{summary && <small>{summary}</small>}</span>
      <span className="collapsible-meta">{badge && <b>{badge}</b>}{count !== undefined && <b>{count}</b>}<ChevronDown size={16} /></span>
    </summary>
    <div className="collapsible-body">{children}</div>
  </details>;
}

function OverviewPreview({ overview, busy, onGenerateJson, onLocateEvidence }: {
  overview: AnalysisOverviewResult;
  busy: BusyAction;
  onGenerateJson: () => void;
  onLocateEvidence: (label: string, evidence: string[]) => void;
}) {
  const data = overview.overview;
  const designDna = data.designDna ?? [];
  const recommendedDeepDives = data.recommendedDeepDives ?? [];
  return <section className="overview-preview">
    <header className="overview-preview-heading">
      <div><span>第一阶段 · 快速概览</span><h2>{data.title}</h2><p>{data.domain}</p></div>
      <Confidence value={data.confidence.overall} />
    </header>
    <CollapsibleSection title="概览摘要" summary={data.primarySubject} defaultOpen>
      <p className="overview-summary">{data.summary}</p>
      {data.learningValue && <section className="learning-value">
        <span>学习价值</span><p>{data.learningValue}</p>
      </section>}
      <dl className="overview-facts">
        <div><dt>主体</dt><dd>{data.primarySubject}</dd></div>
        <div><dt>意图</dt><dd>{data.visualIntent}</dd></div>
        <div><dt>轮廓</dt><dd>{data.formSnapshot.silhouette}</dd></div>
        <div><dt>实测</dt><dd>{overview.measured.width} x {overview.measured.height}</dd></div>
      </dl>
    </CollapsibleSection>
    <CollapsibleSection title="设计语言" count={data.designLanguage.length} defaultOpen>
      <section className="overview-insights">{data.designLanguage.map((item, index) => <article className="locatable-insight" key={`${item.term}-${index}`}>
        <div><strong>{item.term}</strong><Confidence value={item.confidence} /></div><p>{item.effect}</p><small>{item.evidence.join(" · ")}</small>
        <button onClick={() => onLocateEvidence(item.term, item.evidence)}><ScanSearch size={13} />定位证据</button>
      </article>)}</section>
    </CollapsibleSection>
    <CollapsibleSection title="核心手法" count={data.designTechniques.length} defaultOpen>
      <section className="overview-insights">{data.designTechniques.map((item, index) => <article className="locatable-insight" key={`${item.technique}-${index}`}>
        <div><strong>{item.technique}</strong><Confidence value={item.confidence} /></div><p>{item.transferableRule}</p><small>{item.evidence.join(" · ")}</small>
        <button onClick={() => onLocateEvidence(item.technique, item.evidence)}><ScanSearch size={13} />定位证据</button>
      </article>)}</section>
    </CollapsibleSection>
    {designDna.length > 0 && <CollapsibleSection title="设计 DNA" count={designDna.length}>
      <section className="overview-insights design-dna">{designDna.map((item, index) => <article key={`${item.mechanism}-${index}`}>
        <div><strong>{item.mechanism}</strong><Confidence value={item.confidence} /></div>
        <p><b>变体方向</b>{item.variableToExplore}</p><small>{item.evidence.join(" · ")}</small>
      </article>)}</section>
    </CollapsibleSection>}
    <CollapsibleSection title="CMF 快照" summary="Color / Material / Finish">
      <div className="overview-cmf">
        <div><strong>Color</strong><p>{data.cmfSnapshot.colorRoles.join("；") || "待详细分析"}</p></div>
        <div><strong>Material</strong><p>{data.cmfSnapshot.materialCues.join("；") || "待详细分析"}</p></div>
        <div><strong>Finish</strong><p>{data.cmfSnapshot.finishCues.join("；") || "待详细分析"}</p></div>
      </div>
    </CollapsibleSection>
    {(recommendedDeepDives.length > 0 || data.biggestUnknown) && <CollapsibleSection title="建议继续深挖" count={recommendedDeepDives.length}>
      <section className="deep-dive-preview">
        <div><div className="topic-list">{recommendedDeepDives.map((topic) => <span key={topic}>{topic}</span>)}</div></div>
        {data.biggestUnknown && <p><AlertTriangle size={14} /><span><b>最大信息缺口</b>{data.biggestUnknown}</span></p>}
      </section>
    </CollapsibleSection>}
    <section className="json-decision">
      <FileJson size={20} /><div><strong>继续生成完整 JSON</strong><p>补齐完整结构、设计谱系假设、相似设计策略、CMF、提示词、三视图规划与证据边界。</p></div>
      <button className="button primary" disabled={busy !== null} onClick={onGenerateJson}>{busy === "analyze" ? <LoaderCircle size={16} className="spin" /> : <FileJson size={16} />}{busy === "analyze" ? "正在生成" : "生成完整 JSON"}</button>
    </section>
    <p className="evidence-note">概览用于快速判断分析价值，不会写入设计档案或 Eagle；完整 JSON 由你按需触发。</p>
  </section>;
}

function Overview({ result, reconstructionDirective, onPromptChange, onPromptCommit, onPromptRestore, onPaletteChange, onReconstruct, reconstructing, onLocateEvidence, references, onExportReconstruction, onCopy, onFeedback }: {
  result: AnalysisResult;
  reconstructionDirective: string;
  onPromptChange: (field: "positivePrompt" | "negativePrompt", value: string) => void;
  onPromptCommit: () => void;
  onPromptRestore: (version: PromptVersionRecord) => void;
  onPaletteChange: (index: number, value: string) => void;
  onReconstruct: () => void;
  reconstructing: boolean;
  onLocateEvidence: (label: string, evidence: string[], explicitIds?: string[]) => void;
  references: ReferenceImage[];
  onExportReconstruction: () => void;
  onCopy: (value: string, label: string) => Promise<void>;
  onFeedback: FeedbackHandler;
}) {
  const { analysis, measured } = result;
  const [selectedPaletteIndex, setSelectedPaletteIndex] = useState<number | null>(null);
  const selectedColor = selectedPaletteIndex === null ? undefined : measured.palette[selectedPaletteIndex];
  const sha256 = measured.sha256 || "未记录";
  const sections = [
    ["主体与造型", [analysis.subject.primary, analysis.subject.poseOrState, ...analysis.subject.attributes, ...analysis.subject.wardrobeOrStyling]],
    ["场景结构", [analysis.sceneStructure.sceneType, ...analysis.sceneStructure.foreground, ...analysis.sceneStructure.midground, ...analysis.sceneStructure.background, ...analysis.sceneStructure.spatialRelationships]],
    ["造型结构", [analysis.formStructure.overallSilhouette, ...analysis.formStructure.primaryVolumes, ...analysis.formStructure.secondaryVolumes, ...analysis.formStructure.proportionRelationships, analysis.formStructure.axesAndSymmetry, ...analysis.formStructure.edgesAndTransitions, ...analysis.formStructure.openingsAndCutouts, ...analysis.formStructure.jointsAndConnections, ...analysis.formStructure.surfaceContinuity]],
    ["结构与制造假设", [...analysis.formStructure.hiddenGeometryAssumptions, ...analysis.formStructure.manufacturabilityNotes]],
    ["三视图规划", [analysis.orthographicPlan.canonicalOrientation, analysis.orthographicPlan.frontDefinition, analysis.orthographicPlan.leftDefinition, analysis.orthographicPlan.topDefinition, analysis.orthographicPlan.sharedScaleBasis, ...analysis.orthographicPlan.estimatedDimensionRatios, ...analysis.orthographicPlan.crossViewLandmarks, ...analysis.orthographicPlan.alignmentConstraints, analysis.orthographicPlan.inferredSurfaceTreatment]],
    ["构图", Object.values(analysis.composition).filter((value) => typeof value === "string") as string[]],
    ["光线", Object.values(analysis.lighting).filter((value) => typeof value === "string") as string[]],
    ["镜头", Object.values(analysis.camera).filter((value) => typeof value === "string") as string[]],
    ["风格", [analysis.style.medium, analysis.style.genre, analysis.style.era, analysis.style.mood, ...analysis.style.postProcessing]]
  ] as const;

  return <div className="result-content">
    <div className="result-heading"><div><span className="eyebrow">{measured.width} x {measured.height} / {measured.aspectRatio}</span><h2>{analysis.title}</h2></div><Confidence value={analysis.confidence.overall} /></div>
    <CollapsibleSection title="分析摘要" summary={analysis.subject.primary} defaultOpen>
      <p className="summary-text">{analysis.description}</p>
      <dl className="evidence-strip">
        <div><dt>尺寸</dt><dd>{measured.width} x {measured.height}</dd></div>
        <div><dt>比例</dt><dd>{measured.aspectRatio}</dd></div>
        <div className="hash-evidence"><dt>SHA-256</dt><dd title={sha256}>{sha256 === "未记录" ? sha256 : `${sha256.slice(0, 12)}…`}</dd><button className="mini-icon-button" title="复制 SHA-256" aria-label="复制 SHA-256" disabled={sha256 === "未记录"} onClick={() => void onCopy(sha256, "SHA-256")}><Copy size={13} /></button></div>
      </dl>
    </CollapsibleSection>
    <EmbeddedMetadata metadata={measured.embeddedMetadata} />
    <ReconstructionReadinessPanel result={result} references={references} onExport={onExportReconstruction} />
    {analysis.designIntelligence ? <DesignIntelligencePanel intelligence={analysis.designIntelligence} evidenceLinks={result.evidenceLinks ?? []} onLocateEvidence={onLocateEvidence} /> : <CollapsibleSection title="通用设计智能" summary="旧版档案"><section className="design-intelligence legacy-intelligence"><h2>通用设计智能待更新</h2><p>该档案来自旧版分析，重新分析后可获得设计手法、设计语言、造型谱系假设与相似设计策略。</p></section></CollapsibleSection>}
    <CollapsibleSection title="实测配色" summary={`${analysis.colorAnalysis.harmony} / ${analysis.colorAnalysis.temperature}`} count={measured.palette.length} defaultOpen>
      <section className="palette-section">
      <div className="palette-grid">{measured.palette.map((color, index) => <button key={`${index}-${color.hex}`} className={`swatch ${selectedPaletteIndex === index ? "active" : ""}`} title={`校正 ${color.hex}`} onClick={() => setSelectedPaletteIndex(index)}>
        <span className="swatch-color" style={{ background: color.hex }} />
        <span>{color.hex}</span><small>{color.correction ? "已校正" : `${(color.proportion * 100).toFixed(1)}%`}</small>
        <code>RGB {color.rgb.r}, {color.rgb.g}, {color.rgb.b}</code>
        <code>{formatCmyk(color)}</code>
        {color.deltaEFromPrimary !== undefined && <code>ΔE00 主色 {color.deltaEFromPrimary.toFixed(2)}</code>}
      </button>)}</div>
      {selectedColor && selectedPaletteIndex !== null && <PaletteEditor
        key={`${selectedPaletteIndex}-${selectedColor.hex}`}
        color={selectedColor}
        onApply={(value) => onPaletteChange(selectedPaletteIndex, value)}
        onClose={() => setSelectedPaletteIndex(null)}
        onCopy={onCopy}
      />}
      <p className="color-reading">{analysis.colorAnalysis.distribution} {analysis.colorAnalysis.grading}</p>
      <p className="evidence-note">CMYK 为无 ICC 配置的通用估算；生产转换需指定印刷设备与配置文件。</p>
      </section>
    </CollapsibleSection>
    {analysis.cmfAnalysis ? <CmfPanel result={result} /> : <CollapsibleSection title="完整 CMF 分析" summary="旧版档案"><section className="cmf-section cmf-missing"><h2>CMF 分析待更新</h2><p>该结果来自旧版结构，请重新分析当前图片。</p></section></CollapsibleSection>}
    <div className="detail-list">{sections.map(([title, values]) => {
      const filtered = values.filter(Boolean);
      if (!filtered.length) return null;
      return <details key={title}><summary>{title}<span>{filtered.length}</span></summary><ul>{filtered.map((value, index) => <li key={`${title}-${index}`}>{value}</li>)}</ul></details>;
    })}</div>
    <CollapsibleSection title="提示词工作区" summary="复现预览与 JSON 同步使用">
      <section className="prompt-section">
      <div className="prompt-editor">
        <label><span>正向提示词</span><textarea name="positive-prompt" rows={7} value={analysis.reconstruction.positivePrompt} onChange={(event) => onPromptChange("positivePrompt", event.target.value)} onBlur={onPromptCommit} /></label>
        <label><span>负向提示词</span><textarea name="negative-prompt" rows={4} value={analysis.reconstruction.negativePrompt} onChange={(event) => onPromptChange("negativePrompt", event.target.value)} onBlur={onPromptCommit} /></label>
      </div>
      <div className="prompt-actions">
        <button className="icon-button" title="复制正向提示词" aria-label="复制正向提示词" onClick={() => void onCopy(analysis.reconstruction.positivePrompt, "正向提示词")}><Copy size={16} /></button>
        <button className="icon-button" title="复制负向提示词" aria-label="复制负向提示词" onClick={() => void onCopy(analysis.reconstruction.negativePrompt, "负向提示词")}><Copy size={16} /></button>
        <button className="button primary" disabled={reconstructing || !analysis.reconstruction.positivePrompt.trim()} onClick={onReconstruct}>{reconstructing ? <LoaderCircle size={17} className="spin" /> : <WandSparkles size={17} />}生成复现预览</button>
      </div>
      <PromptVersionManager
        sha256={measured.sha256}
        positivePrompt={analysis.reconstruction.positivePrompt}
        negativePrompt={analysis.reconstruction.negativePrompt}
        reconstructionDirective={reconstructionDirective}
        onRestore={onPromptRestore}
        onFeedback={onFeedback}
      />
      </section>
    </CollapsibleSection>
    <EvidenceBoundary
      observed={analysis.confidence.observedFacts}
      inferred={analysis.confidence.inferredDetails}
      unknown={analysis.confidence.uncertainDetails}
      title="完整分析证据边界"
    />
  </div>;
}

function DesignIntelligencePanel({ intelligence, evidenceLinks, onLocateEvidence }: {
  intelligence: AnalysisResult["analysis"]["designIntelligence"];
  evidenceLinks: NonNullable<AnalysisResult["evidenceLinks"]>;
  onLocateEvidence: (label: string, evidence: string[], explicitIds?: string[]) => void;
}) {
  const learningBrief = intelligence.learningBrief;
  return <CollapsibleSection
    title="通用设计智能"
    summary={intelligence.domain || "跨品类设计分析"}
    badge={`${Math.round(intelligence.evidenceBoundary.overallConfidence * 100)}%`}
    defaultOpen
    className="design-intelligence-shell"
  ><section className="design-intelligence">
    <header className="design-intelligence-heading">
      <div><span>通用设计智能</span><h2>设计手法与语言</h2><p>{intelligence.domain || "跨品类设计分析"}</p></div>
      <Confidence value={intelligence.evidenceBoundary.overallConfidence} />
    </header>
    {learningBrief ? <details className="intelligence-subsection" open>
      <summary>设计学习简报 <span>{learningBrief.signatureMechanisms.length + 1}</span></summary><section className="learning-brief">
      <header><span>设计学习简报</span><strong>{learningBrief.learningValue}</strong></header>
      {learningBrief.signatureMechanisms.length > 0 && <div className="learning-mechanisms">{learningBrief.signatureMechanisms.map((item, index) => <article key={`${item.mechanism}-${index}`}>
        <div><strong>{item.mechanism}</strong><Confidence value={item.confidence} /></div>
        <dl><div><dt>保留机制</dt><dd>{item.preserve.join("；")}</dd></div><div><dt>可变变量</dt><dd>{item.vary.join("；")}</dd></div><div><dt>避免照搬</dt><dd>{item.avoidCopying.join("；")}</dd></div><div><dt>图像依据</dt><dd>{item.evidence.join("；")}</dd></div></dl>
      </article>)}</div>}
      <article className="study-exercise">
        <span>原创练习</span><strong>{learningBrief.studyExercise.brief}</strong>
        <dl><div><dt>保留约束</dt><dd>{learningBrief.studyExercise.constraintsToKeep.join("；")}</dd></div><div><dt>改变变量</dt><dd>{learningBrief.studyExercise.variablesToChange.join("；")}</dd></div><div><dt>成功标准</dt><dd>{learningBrief.studyExercise.successCriteria.join("；")}</dd></div><div><dt>收集证据</dt><dd>{learningBrief.studyExercise.evidenceToCollect.join("；")}</dd></div></dl>
      </article>
      {learningBrief.recommendedDeepDives.length > 0 && <div className="topic-list" aria-label="推荐深入专题">{learningBrief.recommendedDeepDives.map((topic) => <span key={topic}>{topic}</span>)}</div>}
    </section></details> : <p className="legacy-learning-note">该档案缺少设计学习简报。重新分析后可获得设计 DNA、决策权衡与原创练习。</p>}
    <details className="intelligence-subsection" open>
      <summary>设计语言 <span>{intelligence.designLanguage.length}</span></summary>
      <div className="design-language-list">{intelligence.designLanguage.map((item, index) => <article className="locatable-insight" key={`${item.term}-${index}`}>
        <span>{String(index + 1).padStart(2, "0")}</span><div><strong>{item.term}</strong><p>{item.effect}</p><small>{item.visualEvidence.join(" · ")}</small></div>
        <button onClick={() => onLocateEvidence(item.term, item.visualEvidence, evidenceLinks.find((link) => link.id === `design-language:${index}`)?.evidenceAnchorIds)}><ScanSearch size={13} />定位</button>
      </article>)}</div>
    </details>
    <details open>
      <summary>设计手法 <span>{intelligence.designTechniques.length}</span></summary>
      <div className="design-techniques">{intelligence.designTechniques.map((item, index) => <article className="locatable-insight" key={`${item.technique}-${index}`}>
        <header><strong>{item.technique}</strong><Confidence value={item.confidence} /></header>
        <p>{item.implementation}</p><dl><div><dt>图像依据</dt><dd>{item.evidence.join("；")}</dd></div><div><dt>迁移规则</dt><dd>{item.transferableRule}</dd></div><div><dt>误用风险</dt><dd>{item.misuseRisk}</dd></div></dl>
        <button onClick={() => onLocateEvidence(item.technique, item.evidence, evidenceLinks.find((link) => link.id === `design-technique:${index}`)?.evidenceAnchorIds)}><ScanSearch size={13} />定位证据</button>
      </article>)}</div>
    </details>
    {(intelligence.recommendedDirections?.length ?? 0) > 0 && <details open>
      <summary>建议探索的手法与语言 <span>{intelligence.recommendedDirections.length}</span></summary>
      <div className="direction-list">{intelligence.recommendedDirections.map((item, index) => <article key={`${item.directionType}-${item.name}-${index}`}>
        <header><span>{item.directionType}</span><strong>{item.name}</strong><Confidence value={item.confidence} /></header>
        <p>{item.rationale}</p>
        <dl><div><dt>可迁移机制</dt><dd>{item.transferableMechanisms.join("；")}</dd></div><div><dt>必须改变</dt><dd>{item.variablesToChange.join("；")}</dd></div><div><dt>误用风险</dt><dd>{item.misuseRisk}</dd></div></dl>
        {item.searchQueries.length > 0 && <div className="strategy-searches">{item.searchQueries.map((query) => <a key={query} href={`https://www.google.com/search?q=${encodeURIComponent(query)}`} target="_blank" rel="noreferrer">{query}<ExternalLink size={11} /></a>)}</div>}
      </article>)}</div>
      <p className="evidence-note">这些是后续探索建议，不代表当前产品已经采用该手法或语言。</p>
    </details>}
    {(intelligence.referenceCandidates?.length ?? 0) > 0 && <details>
      <summary>产品、作品与设计师参考 <span>{intelligence.referenceCandidates.length}</span></summary>
      <div className="design-reference-list">{intelligence.referenceCandidates.map((item, index) => <article key={`${item.referenceType}-${item.name}-${index}`}>
        <header><span>{item.referenceType}</span><strong>{item.name}</strong><em>{item.evidenceType}</em><Confidence value={item.confidence} /></header>
        <p>{item.relevance}</p>
        <dl><div><dt>共同机制</dt><dd>{item.sharedMechanisms.join("；")}</dd></div><div><dt>避免照搬</dt><dd>{item.avoidCopying.join("；")}</dd></div></dl>
        {item.verificationQueries.length > 0 && <div className="strategy-searches">{item.verificationQueries.map((query) => <a key={query} href={`https://www.google.com/search?q=${encodeURIComponent(query)}`} target="_blank" rel="noreferrer">{query}<ExternalLink size={11} /></a>)}</div>}
      </article>)}</div>
      <p className="evidence-note">名称仅作为人工核验入口。共同视觉机制不证明真实来源、作者影响或抄袭。</p>
    </details>}
    {learningBrief && learningBrief.decisionTradeoffs.length > 0 && <details>
      <summary>设计决策与权衡 <span>{learningBrief.decisionTradeoffs.length}</span></summary>
      <div className="tradeoff-list">{learningBrief.decisionTradeoffs.map((item, index) => <article key={`${item.decision}-${index}`}>
        <header><strong>{item.decision}</strong><Confidence value={item.confidence} /></header>
        <dl><div><dt>表观收益</dt><dd>{item.apparentBenefit}</dd></div><div><dt>可能代价</dt><dd>{item.likelyCost}</dd></div><div><dt>图像依据</dt><dd>{item.evidence.join("；")}</dd></div><div><dt>验证方法</dt><dd>{item.verification.join("；")}</dd></div></dl>
      </article>)}</div>
    </details>}
    <details>
      <summary>造型可能谱系 <span>{intelligence.formLineageHypotheses.length}</span></summary>
      <div className="lineage-list">{intelligence.formLineageHypotheses.map((item, index) => <article key={`${item.hypothesis}-${index}`}>
        <header><strong>{item.hypothesis}</strong><Confidence value={item.confidence} /></header>
        <p>{item.visualBasis.join("；")}</p><small><b>替代解释</b>{item.alternativeExplanation}</small>
        <div>{item.verificationQueries.map((query) => <a key={query} href={`https://www.google.com/search?q=${encodeURIComponent(query)}`} target="_blank" rel="noreferrer">{query}<ExternalLink size={11} /></a>)}</div>
      </article>)}</div>
      <p className="evidence-note">这里只是设计谱系假设和核验入口，不证明真实来源、作者影响或抄袭关系。</p>
    </details>
    <details>
      <summary>相似设计策略 <span>{intelligence.analogousStrategies.length}</span></summary>
      <div className="strategy-list">{intelligence.analogousStrategies.map((item, index) => <article key={`${item.strategy}-${index}`}>
        <strong>{item.strategy}</strong><p>{item.sharedMechanism.join("；")}</p><small>关键差异：{item.meaningfulDifference.join("；")}</small><em>{item.applicableDomains.join(" / ")}</em>
        {item.searchQueries.length > 0 && <div className="strategy-searches">{item.searchQueries.map((query) => <a key={query} href={`https://www.google.com/search?q=${encodeURIComponent(query)}`} target="_blank" rel="noreferrer">{query}<ExternalLink size={11} /></a>)}</div>}
      </article>)}</div>
    </details>
    <details>
      <summary>原创迁移原则 <span>{intelligence.transferablePrinciples.length}</span></summary>
      <div className="principle-list">{intelligence.transferablePrinciples.map((item, index) => <article key={`${item.principle}-${index}`}>
        <strong>{item.principle}</strong><dl><div><dt>保留机制</dt><dd>{item.preserve.join("；")}</dd></div><div><dt>可变变量</dt><dd>{item.adapt.join("；")}</dd></div><div><dt>避免照搬</dt><dd>{item.avoidCopying.join("；")}</dd></div><div><dt>验证</dt><dd>{item.validationMethod.join("；")}</dd></div></dl>
      </article>)}</div>
    </details>
    <EvidenceBoundary
      observed={intelligence.evidenceBoundary.observed}
      inferred={intelligence.evidenceBoundary.inferred}
      unknown={intelligence.evidenceBoundary.unknown}
      title="设计判断证据边界"
    />
  </section></CollapsibleSection>;
}

function EvidenceBoundary({ observed, inferred, unknown, title }: {
  observed: string[];
  inferred: string[];
  unknown: string[];
  title: string;
}) {
  const groups = [
    { label: "可见", tone: "observed", items: observed },
    { label: "推断", tone: "inferred", items: inferred },
    { label: "未知", tone: "unknown", items: unknown }
  ].filter((group) => group.items.length > 0);
  if (!groups.length) return null;
  return <CollapsibleSection title={title} count={groups.reduce((count, group) => count + group.items.length, 0)} className="evidence-boundary-shell">
    <div className="evidence-boundary"><div>{groups.map((group) => <section key={group.label}>
      <strong className={`evidence-kind ${group.tone}`}>{group.label}</strong>
      <ul>{group.items.map((item, index) => <li key={`${group.label}-${index}`}>{item}</li>)}</ul>
    </section>)}</div>
    <p>单张图不能证明真实材料、工艺、功能、人因、成本、安全、设计来源或生产可行性。</p></div>
  </CollapsibleSection>;
}

function EmbeddedMetadata({ metadata }: { metadata: MeasuredImageData["embeddedMetadata"] }) {
  if (!metadata) return null;
  const entries = [
    ["相机", [metadata.cameraMake, metadata.cameraModel].filter(Boolean).join(" ")],
    ["镜头", metadata.lensModel],
    ["拍摄时间", metadata.capturedAt],
    ["曝光", [metadata.exposureTime, metadata.aperture ? `f/${metadata.aperture}` : "", metadata.iso ? `ISO ${metadata.iso}` : ""].filter(Boolean).join(" · ")],
    ["焦距", metadata.focalLengthMm ? `${metadata.focalLengthMm} mm` : ""],
    ["声明色彩空间", metadata.declaredColorSpace],
    ["原始像素", metadata.originalWidth && metadata.originalHeight ? `${metadata.originalWidth} x ${metadata.originalHeight}` : ""],
    ["处理软件", metadata.software]
  ].filter((entry): entry is [string, string] => Boolean(entry[1]));
  if (!entries.length) return null;

  return <CollapsibleSection title="嵌入元数据" count={entries.length} className="metadata-shell">
    <div className="metadata-panel"><dl>{entries.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>
    <p>文件声明可能被修改；位置字段未读取，也不会发送给分析模型。</p></div>
  </CollapsibleSection>;
}

function PaletteEditor({ color, onApply, onClose, onCopy }: {
  color: PaletteColor;
  onApply: (value: string) => void;
  onClose: () => void;
  onCopy: (value: string, label: string) => Promise<void>;
}) {
  const [value, setValue] = useState(color.hex);
  return <div className="palette-editor">
    <div className="palette-picker"><HexColorPicker color={value} onChange={setValue} /></div>
    <div className="palette-editor-fields">
      <div className="palette-editor-heading"><div><span>颜色校正</span><strong>{value.toUpperCase()}</strong></div><button className="mini-icon-button" title="关闭校正器" aria-label="关闭颜色校正器" onClick={onClose}><X size={14} /></button></div>
      <label><span>HEX</span><input name="palette-hex" value={value} onChange={(event) => setValue(event.target.value)} spellCheck={false} /></label>
      {color.correction && <p>原始实测 {color.correction.originalHex} · ΔE00 {color.correction.deltaE2000.toFixed(2)}</p>}
      <div className="palette-editor-actions">
        <button className="icon-button" title="复制当前颜色" aria-label="复制当前颜色" onClick={() => void onCopy(value.toUpperCase(), "颜色值")}><Copy size={15} /></button>
        {color.correction && <button className="button secondary" onClick={() => onApply(color.correction!.originalHex)}><RotateCcw size={15} />恢复实测</button>}
        <button className="button primary" onClick={() => onApply(value)}>应用修正</button>
      </div>
    </div>
  </div>;
}

function ArchiveView({ records, search, onSearchChange, onOpen, onFavorite, onDelete, queryImage, querySha256, onSynced, onFeedback }: {
  records: AnalysisArchiveRecord[];
  search: string;
  onSearchChange: (value: string) => void;
  onOpen: (record: AnalysisArchiveRecord) => void;
  onFavorite: (record: AnalysisArchiveRecord) => void;
  onDelete: (record: AnalysisArchiveRecord) => void;
  queryImage: string;
  querySha256?: string;
  onSynced: () => Promise<void>;
  onFeedback: FeedbackHandler;
}) {
  const [comparisonIds, setComparisonIds] = useState<string[]>([]);
  const [similarMatches, setSimilarMatches] = useState<SimilarArchiveMatch[] | null>(null);
  const [similarityBusy, setSimilarityBusy] = useState(false);
  const [similarityError, setSimilarityError] = useState("");
  const [selectedRecordId, setSelectedRecordId] = useState("");
  const query = search.trim().toLocaleLowerCase("zh-CN");
  const filtered = records.filter((record) => !query || [
    record.title,
    record.sourceLabel,
    record.model,
    ...record.tags
  ].some((value) => value.toLocaleLowerCase("zh-CN").includes(query)));
  const comparisons = comparisonIds
    .map((id) => records.find((record) => record.id === id))
    .filter((record): record is AnalysisArchiveRecord => Boolean(record));

  useEffect(() => {
    if (!records.length) setSelectedRecordId("");
    else if (!selectedRecordId || !records.some((record) => record.id === selectedRecordId)) {
      setSelectedRecordId(records[0]!.id);
    }
  }, [records, selectedRecordId]);

  function toggleComparison(id: string) {
    setComparisonIds((current) => current.includes(id)
      ? current.filter((item) => item !== id)
      : [...current.slice(-1), id]);
  }

  async function findSimilar() {
    if (!queryImage) return;
    setSimilarityBusy(true);
    setSimilarityError("");
    try {
      const { findSimilarAnalysisArchives } = await import("../../lib/archive");
      const matches = await findSimilarAnalysisArchives(queryImage, 16);
      setSimilarMatches(matches.filter((match) => !querySha256 || match.record.sha256 !== querySha256).slice(0, 8));
    } catch (caught) {
      setSimilarityError(caught instanceof Error ? caught.message : "本地相似图搜索失败。");
    } finally {
      setSimilarityBusy(false);
    }
  }

  return <section className="archive-workspace">
    <header className="archive-heading">
      <div><span><Database size={15} />仅存于当前浏览器</span><h2>设计档案</h2><p>{records.length} 条分析 · 单击选择，双击打开</p></div>
      <strong>{filtered.length}</strong>
    </header>
    <EagleBridge records={records} selectedRecordId={selectedRecordId} onSelectedRecordChange={setSelectedRecordId} onSynced={onSynced} onFeedback={onFeedback} />
    <div className="history-toolbar"><span><GitCompareArrows size={15} />历史对比</span><strong>{comparisonIds.length}/2</strong><button disabled={!comparisonIds.length} onClick={() => setComparisonIds([])}>清除</button></div>
    {comparisons.length === 2 && <HistoryComparison left={comparisons[0]!} right={comparisons[1]!} />}
    <section className="similar-search">
      <div><ScanSearch size={17} /><span><strong>本地相似图</strong><small>64 位视觉哈希 · 不上传图片</small></span></div>
      <button className="button secondary" disabled={!queryImage || !records.length || similarityBusy} onClick={() => void findSimilar()}>{similarityBusy ? <LoaderCircle size={16} className="spin" /> : <ScanSearch size={16} />}{similarMatches ? "重新搜索" : "查找相似"}</button>
    </section>
    {similarityError && <p className="inline-error"><AlertTriangle size={14} />{similarityError}</p>}
    {similarMatches && <section className="similar-results">
      <header><strong>视觉近似结果</strong><button onClick={() => setSimilarMatches(null)}>返回全部档案</button></header>
      {similarMatches.length ? <div>{similarMatches.map((match) => <button
        key={match.record.id}
        className={selectedRecordId === match.record.id ? "selected" : ""}
        aria-pressed={selectedRecordId === match.record.id}
        title="单击选择，双击打开分析"
        onClick={() => setSelectedRecordId(match.record.id)}
        onDoubleClick={() => onOpen(match.record)}
        onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); onOpen(match.record); } }}
      >
        <img src={match.record.result.previewDataUrl} alt="" width="72" height="72" loading="lazy" />
        <span><strong>{match.record.title}</strong><small>差异位 {match.distance} / 64</small></span>
        <b>{Math.round(match.similarity * 100)}%</b>
      </button>)}</div> : <p>除当前图片外，没有可比较的本地档案。</p>}
      <small className="evidence-note">相似度只比较低分辨率明暗结构，不证明产品同款、材料相同或设计来源一致。</small>
    </section>}
    {!similarMatches && <label className="archive-search"><Search size={15} /><input name="archive-search" autoComplete="off" value={search} onChange={(event) => onSearchChange(event.target.value)} placeholder="搜索标题、来源或模型…" /></label>}
    {!similarMatches && (!filtered.length ? <div className="archive-empty"><Archive size={28} /><strong>{records.length ? "没有匹配档案" : "尚无本地档案"}</strong><span>{records.length ? "更换搜索词" : "完成一次图片分析后会自动保存"}</span></div> : (
      <div className="archive-list">{filtered.map((record) => <article className={`archive-record ${selectedRecordId === record.id ? "selected" : ""}`} key={record.id}>
        <button className="archive-open" aria-pressed={selectedRecordId === record.id} title="单击选择用于 Eagle 归档，双击打开分析" onClick={() => setSelectedRecordId(record.id)} onDoubleClick={() => onOpen(record)} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); onOpen(record); } }}>
          <span className="archive-thumbnail"><img src={record.result.previewDataUrl} alt="" width={86} height={76} loading="lazy" /></span>
          <span className="archive-copy"><small>{formatArchiveTime(record.generatedAt)}</small><strong>{record.title}</strong><em>{record.sourceLabel}</em><code>{record.eagleSync ? `Eagle ${record.eagleSync.itemId}` : record.model}</code></span>
        </button>
        <div className="archive-actions">
          <button className={comparisonIds.includes(record.id) ? "compare-active" : ""} title={comparisonIds.includes(record.id) ? "取消对比" : "加入历史对比"} aria-label={comparisonIds.includes(record.id) ? "取消历史对比" : "加入历史对比"} onClick={() => toggleComparison(record.id)}><GitCompareArrows size={15} /></button>
          <button className={record.favorite ? "active" : ""} title={record.favorite ? "取消收藏" : "收藏"} aria-label={record.favorite ? "取消收藏档案" : "收藏档案"} onClick={() => onFavorite(record)}><Star size={15} fill={record.favorite ? "currentColor" : "none"} /></button>
          <button title="删除档案" aria-label="删除档案" onClick={() => onDelete(record)}><Trash2 size={15} /></button>
        </div>
      </article>)}</div>
    ))}
  </section>;
}

function HistoryComparison({ left, right }: { left: AnalysisArchiveRecord; right: AnalysisArchiveRecord }) {
  const entries = [left, right];
  return <section className="history-comparison">
    <header><GitCompareArrows size={15} /><strong>快照差异</strong><span>{left.sha256 === right.sha256 ? "同一图片" : "不同图片"}</span></header>
    <div className="history-columns">{entries.map((record, index) => <article key={record.id}>
      <span className="history-side">{index === 0 ? "A" : "B"}</span>
      <img src={record.result.previewDataUrl} alt={`${record.title} 历史快照`} width={640} height={480} loading="lazy" />
      <strong>{record.title}</strong>
      <time>{formatArchiveTime(record.generatedAt)}</time>
      <dl>
        <div><dt>模型</dt><dd>{record.model}</dd></div>
        <div><dt>可信度</dt><dd>{Math.round(record.result.analysis.confidence.overall * 100)}%</dd></div>
        <div><dt>实测颜色</dt><dd>{record.result.measured.palette.length}</dd></div>
        <div><dt>材料标注</dt><dd>{record.result.materialRegions?.length ?? 0}</dd></div>
        <div><dt>CMF 分区</dt><dd>{record.result.analysis.cmfAnalysis?.materialZones.length ?? 0}</dd></div>
      </dl>
    </article>)}</div>
    <div className="history-delta">
      <span>尺寸 {left.result.measured.width}x{left.result.measured.height} → {right.result.measured.width}x{right.result.measured.height}</span>
      <span>提示词 {left.result.analysis.reconstruction.positivePrompt === right.result.analysis.reconstruction.positivePrompt ? "未变化" : "已变化"}</span>
    </div>
  </section>;
}

function formatArchiveTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  }).format(date);
}

function CmfPanel({ result }: { result: AnalysisResult }) {
  const { cmfAnalysis: cmf } = result.analysis;
  const references = [
    ...cmf.relatedReferences.productSearches.map((item) => ({ ...item, group: "相关产品" })),
    ...cmf.relatedReferences.componentSearches.map((item) => ({ ...item, group: "相关零件" }))
  ];
  return <CollapsibleSection
    title="完整 CMF 分析"
    summary="主体优先 / 证据分级"
    badge={`${Math.round(cmf.evidenceBoundary.overallConfidence * 100)}%`}
    className="cmf-section-shell"
  ><section className="cmf-section">
    <p className="cmf-summary">{cmf.summary}</p>
    <dl className="cmf-axis">
      <div><dt>C</dt><dd>{cmf.colorSystem.roles.length}</dd><small>色彩角色</small></div>
      <div><dt>M</dt><dd>{cmf.materialZones.length}</dd><small>材料分区</small></div>
      <div><dt>F</dt><dd>{cmf.finishZones.length}</dd><small>表面分区</small></div>
    </dl>
    <div className="detail-list cmf-details">
      <details open>
        <summary>Color 色彩系统<span>{cmf.colorSystem.roles.length}</span></summary>
        <div className="cmf-records">
          {cmf.colorSystem.roles.map((role, index) => <article className="cmf-record" key={`${role.role}-${index}`}>
            <header><strong>{role.role}</strong><span>{Math.round(role.confidence * 100)}%</span></header>
            <p>{role.description}</p>
            <p className="cmf-meta">画面占比约 {(role.estimatedImageProportion * 100).toFixed(1)}% · {role.locations.join(" / ")}</p>
            {role.measuredHexCandidates.map((hex) => {
              const measured = result.measured.palette.find((color) => color.hex.toUpperCase() === hex.toUpperCase());
              return <code className="color-value" key={hex}>{measured
                ? `${measured.hex} · RGB ${measured.rgb.r}, ${measured.rgb.g}, ${measured.rgb.b} · ${formatCmyk(measured)}`
                : `${hex} · 未匹配实测色板`}</code>;
            })}
            {role.pantoneCandidates.length > 0 && <div className="pantone-list"><small>Pantone 候选（视觉近似）</small>{role.pantoneCandidates.map((pantone, pantoneIndex) => <span key={`${pantone.name}-${pantoneIndex}`} title={pantone.rationale}>{pantone.name} {pantone.coatedOrUncoated} · {Math.round(pantone.confidence * 100)}%</span>)}</div>}
          </article>)}
          <p className="cmf-reading">{cmf.colorSystem.hierarchy} {cmf.colorSystem.interaction} {cmf.colorSystem.backgroundInfluence}</p>
        </div>
      </details>
      <details>
        <summary>Material 材料分区<span>{cmf.materialZones.length}</span></summary>
        <div className="cmf-records">{cmf.materialZones.map((zone, index) => <article className="cmf-record" key={`${zone.element}-${index}`}>
          <header><strong>{zone.element}</strong><span>{Math.round(zone.confidence * 100)}%</span></header>
          <p>{zone.visibleCues.join("；")}</p>
          <p className="cmf-meta">候选材料：{zone.likelyMaterialFamilies.join(" / ") || "未知"}</p>
          <p className="cmf-meta">{zone.texture} · {zone.apparentHardness} · {zone.translucency} · {zone.reflectance}</p>
          {zone.unknowns.length > 0 && <p className="cmf-unknown">未知：{zone.unknowns.join("；")}</p>}
        </article>)}</div>
      </details>
      <details>
        <summary>Finish 表面处理<span>{cmf.finishZones.length}</span></summary>
        <div className="cmf-records">{cmf.finishZones.map((zone, index) => <article className="cmf-record" key={`${zone.element}-${index}`}>
          <header><strong>{zone.element}</strong><span>{Math.round(zone.confidence * 100)}%</span></header>
          <p>{zone.glossLevel} · {zone.apparentRoughness} · {zone.textureScale}</p>
          <p className="cmf-meta">边缘：{zone.edgeTreatment} · 纹理方向：{zone.patternDirection}</p>
          <p className="cmf-meta">可见状态：{zone.visibleWearState}</p>
          {zone.coatingOrPlatingClues.length > 0 && <p className="cmf-meta">涂层/镀层线索：{zone.coatingOrPlatingClues.join("；")}</p>}
          {zone.unknowns.length > 0 && <p className="cmf-unknown">未知：{zone.unknowns.join("；")}</p>}
        </article>)}</div>
      </details>
      <details>
        <summary>转接与耐久风险<span>{cmf.interfaces.length + cmf.durabilityAndAging.length}</span></summary>
        <ul>{cmf.interfaces.map((item, index) => <li key={`interface-${index}`}><strong>{item.fromElement} → {item.toElement}</strong>：{item.boundaryType}；{item.transitionDescription}；{item.hardwareRelationship}</li>)}</ul>
        <ul>{cmf.durabilityAndAging.map((item, index) => <li key={`risk-${index}`}><strong>{item.category}</strong>：{item.risk} {item.unknowns.length > 0 ? `（未知：${item.unknowns.join("、")}）` : ""}</li>)}</ul>
      </details>
      <details>
        <summary>相关产品与零件<span>{references.length}</span></summary>
        <div className="reference-links">
          {cmf.relatedReferences.sourcePageUrl && <a href={cmf.relatedReferences.sourcePageUrl} target="_blank" rel="noreferrer"><span><strong>图片来源页面</strong><small>已记录的原始页面</small></span><ExternalLink size={14} /></a>}
          {references.map((item, index) => <a key={`${item.group}-${item.query}-${index}`} href={item.searchUrl} target="_blank" rel="noreferrer">
            <span><small>{item.group}</small><strong>{item.label}</strong><em>{item.relevance}</em></span><ExternalLink size={14} />
          </a>)}
        </div>
      </details>
      <details>
        <summary>证据边界<span>{cmf.evidenceBoundary.observed.length + cmf.evidenceBoundary.inferred.length + cmf.evidenceBoundary.unknown.length}</span></summary>
        <div className="evidence-groups"><p><strong>可见</strong>{cmf.evidenceBoundary.observed.join("；")}</p><p><strong>推断</strong>{cmf.evidenceBoundary.inferred.join("；")}</p><p><strong>未知</strong>{cmf.evidenceBoundary.unknown.join("；")}</p></div>
      </details>
    </div>
  </section></CollapsibleSection>;
}

function formatCmyk(color: MeasuredImageData["palette"][number]): string {
  const cmyk = color.cmyk ?? rgbToCmyk(color.rgb);
  return `CMYK* ${cmyk.c}, ${cmyk.m}, ${cmyk.y}, ${cmyk.k}`;
}

function rgbToCmyk(rgb: { r: number; g: number; b: number }): { c: number; m: number; y: number; k: number } {
  const red = rgb.r / 255;
  const green = rgb.g / 255;
  const blue = rgb.b / 255;
  const black = 1 - Math.max(red, green, blue);
  if (black >= 1) return { c: 0, m: 0, y: 0, k: 100 };
  return {
    c: Math.round(((1 - red - black) / (1 - black)) * 100),
    m: Math.round(((1 - green - black) / (1 - black)) * 100),
    y: Math.round(((1 - blue - black) / (1 - black)) * 100),
    k: Math.round(black * 100)
  };
}

function JsonView({ result, onCopy, onFeedback }: { result: AnalysisResult; onCopy: (value: string, label: string) => Promise<void>; onFeedback: FeedbackHandler }) {
  const json = JSON.stringify({ ...result, previewDataUrl: undefined }, null, 2);
  return <div className="json-view"><div className="json-actions"><button className="button secondary" onClick={() => void onCopy(json, "完整 JSON")}><Copy size={16} />复制</button><button className="button secondary" onClick={() => { downloadText(json, "yantai-analysis.json"); onFeedback("success", "JSON 已下载", "文件名：yantai-analysis.json"); }}><Download size={16} />下载</button></div><pre>{json}</pre></div>;
}

function Confidence({ value }: { value: number }) {
  return <div className="confidence"><strong>{Math.round(value * 100)}</strong><span>可信度</span></div>;
}

function SettingsView({ settings, showKey, setShowKey, onChange, onSave, onTest, onExportBackup, onImportBackup, testResult, busy }: {
  settings: AppSettings;
  showKey: boolean;
  setShowKey: (value: boolean) => void;
  onChange: (value: AppSettings) => void;
  onSave: () => void;
  onTest: () => void;
  onExportBackup: (includeApiKey: boolean) => void;
  onImportBackup: (file: File, mode: BackupImportMode) => void;
  testResult: ConnectionTestResult | null;
  busy: BusyAction;
}) {
  const patch = (next: Partial<AppSettings>) => onChange({ ...settings, ...next });
  return <section className="settings-workspace">
    <div className="settings-heading"><h2>模型与连接</h2><p>由你选择 API 服务商，砚台不提供默认端点</p></div>
    <div className="privacy-summary">
      <ShieldCheck size={18} />
      <span><strong>发送前由你确认</strong><small>AI 分析会把所选图片与提示词发送到下方 API；OCR、相似图与主体分区在本地运行。</small></span>
    </div>
    <label className="field"><span>API Key</span><div className="password-control"><input name="api-key" type={showKey ? "text" : "password"} value={settings.apiKey} onChange={(event) => patch({ apiKey: event.target.value })} autoComplete="off" spellCheck={false} /><button title={showKey ? "隐藏密钥" : "显示密钥"} aria-label={showKey ? "隐藏 API Key" : "显示 API Key"} onClick={() => setShowKey(!showKey)}>{showKey ? <EyeOff size={16} /> : <Eye size={16} />}</button></div></label>
    <label className="toggle-row credential-persistence"><input name="remember-api-key" type="checkbox" checked={settings.rememberApiKey} onChange={(event) => patch({ rememberApiKey: event.target.checked })} /><span><strong>在此设备长期保存 API Key</strong><small>{settings.rememberApiKey ? "密钥会保存在扩展本地存储中" : "默认仅用于本次浏览器会话，关闭浏览器后清除"}</small></span></label>
    <label className="field"><span>API Base URL</span><input name="api-base-url" type="url" inputMode="url" autoComplete="off" value={settings.apiBaseUrl} onChange={(event) => patch({ apiBaseUrl: event.target.value })} placeholder="例如：https://api.example.com/v1…" spellCheck={false} /><small>连接时只申请该域名的访问权限；远程地址必须使用 HTTPS。</small></label>
    <button className="connection-button" disabled={busy !== null || !settings.apiKey.trim() || !settings.apiBaseUrl.trim()} onClick={onTest}>
      {busy === "test" ? <LoaderCircle size={17} className="spin" /> : <RefreshCw size={17} />}
      <span><strong>{busy === "test" ? "正在读取模型" : "连接并读取模型"}</strong><small>{testResult ? `${testResult.modelCount} 个模型 · ${testResult.latencyMs} ms` : "使用上方 Key 与 URL"}</small></span>
    </button>
    <ModelField label="通用分析模型" value={settings.analysisModel} options={testResult?.analysisModels ?? []} catalogLoaded={testResult !== null} onChange={(value) => patch({ analysisModel: value })} />
    <ModelField label="图片编辑模型" value={settings.imageModel} options={testResult?.imageModels ?? []} catalogLoaded={testResult !== null} onChange={(value) => patch({ imageModel: value })} />
    <label className="toggle-row"><input name="auto-analyze" type="checkbox" checked={settings.autoAnalyze} onChange={(event) => patch({ autoAnalyze: event.target.checked })} /><span>选择图片后自动分析（默认关闭，可能产生 API 消耗）</span></label>
    <fieldset className="analysis-flow-setting" disabled={!settings.autoAnalyze}><legend>自动分析方式</legend><div className="analysis-flow-options">{([
      ["overview-first", "概览优先", "先判断图片是否值得深入，再按需生成完整 JSON", ScanSearch],
      ["full-direct", "直接完整分析", "跳过概览决策，一次生成完整分析并归档", FileJson]
    ] as const).map(([flow, label, description, Icon]) => <button key={flow} className={settings.analysisFlow === flow ? "active" : ""} onClick={() => patch({ analysisFlow: flow })}>
      <Icon size={17} /><span><strong>{label}</strong><small>{description}</small></span>{settings.analysisFlow === flow && <Check size={15} />}
    </button>)}</div></fieldset>
    <fieldset><legend>分析速度</legend><div className="segmented wide">{([
      ["fast", "快速"],
      ["balanced", "标准"],
      ["deep", "深度"]
    ] as const).map(([mode, label]) => <button key={mode} className={settings.analysisMode === mode ? "active" : ""} onClick={() => patch({ analysisMode: mode })}>{label}</button>)}</div></fieldset>
    <fieldset><legend>生成图片质量</legend><div className="segmented wide">{([
      ["low", "低"],
      ["medium", "中"],
      ["high", "高"]
    ] as const).map(([quality, label]) => <button key={quality} className={settings.imageQuality === quality ? "active" : ""} onClick={() => patch({ imageQuality: quality })}>{label}</button>)}</div></fieldset>
    {testResult && <dl className="connection-diagnostic">
      <div><dt>端点</dt><dd>{testResult.endpoint}</dd></div>
      <div><dt>耗时</dt><dd>{testResult.latencyMs} ms</dd></div>
      <div><dt>模型</dt><dd>{testResult.modelCount} 个</dd></div>
      <div><dt>分类</dt><dd>{testResult.analysisModels.length} 通用 / {testResult.imageModels.length} 图片</dd></div>
    </dl>}
    {testResult && <ul className="model-warnings">{testResult.warnings.map((warning) => <li key={warning}>{warning}</li>)}</ul>}
    <div className="settings-actions">
      <button className="button primary" disabled={busy !== null} onClick={onSave}><Save size={17} />保存设置</button>
    </div>
    <DataManagement busy={busy} onExport={onExportBackup} onImport={onImportBackup} />
  </section>;
}

function DataManagement({ busy, onExport, onImport }: {
  busy: BusyAction;
  onExport: (includeApiKey: boolean) => void;
  onImport: (file: File, mode: BackupImportMode) => void;
}) {
  const [includeApiKey, setIncludeApiKey] = useState(false);
  const [importMode, setImportMode] = useState<BackupImportMode>("merge");
  const backupInputRef = useRef<HTMLInputElement>(null);
  const disabled = busy !== null;
  return <section className="data-management" aria-labelledby="data-management-title">
    <div className="settings-heading">
      <h2 id="data-management-title">数据管理</h2>
      <p>用于换电脑、更换扩展 ID、误删重装或发送新版本后的数据迁移</p>
    </div>
    <div className="backup-summary">
      <Database size={18} />
      <span><strong>完整备份</strong><small>保存设置、分析档案、收藏、标签、Eagle 状态和提示词版本</small></span>
    </div>
    <label className="toggle-row backup-secret-toggle">
      <input type="checkbox" checked={includeApiKey} onChange={(event) => setIncludeApiKey(event.target.checked)} />
      <span>在备份中包含 API Key</span>
    </label>
    {includeApiKey && <p className="backup-warning"><AlertTriangle size={14} />备份文件将包含明文密钥，不要发送给其他人。</p>}
    <button className="button secondary backup-action" disabled={disabled} onClick={() => onExport(includeApiKey)}>
      {busy === "backup" ? <LoaderCircle size={17} className="spin" /> : <Download size={17} />}
      导出完整备份
    </button>
    <fieldset className="backup-import-mode">
      <legend>导入方式</legend>
      <div className="analysis-flow-options">{([
        ["merge", "合并现有数据", "按记录 ID 去重，冲突时保留更新的数据", GitCompareArrows],
        ["replace", "替换当前数据", "清空当前档案与提示词后恢复备份", RotateCcw]
      ] as const).map(([mode, label, description, Icon]) => <button
        key={mode}
        className={importMode === mode ? "active" : ""}
        disabled={disabled}
        onClick={() => setImportMode(mode)}
      >
        <Icon size={17} /><span><strong>{label}</strong><small>{description}</small></span>{importMode === mode && <Check size={15} />}
      </button>)}</div>
    </fieldset>
    <input ref={backupInputRef} type="file" accept="application/json,.json" hidden onChange={(event) => {
      const file = event.target.files?.[0];
      if (file) onImport(file, importMode);
      event.target.value = "";
    }} />
    <button className="button secondary backup-action" disabled={disabled} onClick={() => backupInputRef.current?.click()}>
      <Upload size={17} />选择备份并导入
    </button>
    <p className="backup-footnote">同一商店扩展 ID 的正常升级会自动保留本地数据；备份用于异常恢复和跨安装迁移。</p>
  </section>;
}

function ModelField({ label, value, options, catalogLoaded, onChange }: { label: string; value: string; options: string[]; catalogLoaded: boolean; onChange: (value: string) => void }) {
  const modelOptions = Array.from(new Set([value, ...options].filter(Boolean)));
  return <label className="field"><span>{label}</span>{catalogLoaded && options.length ? (
    <select name={label === "通用分析模型" ? "analysis-model-select" : "image-model-select"} aria-label={label} value={value} onChange={(event) => onChange(event.target.value)}>{modelOptions.map((model) => <option key={model} value={model}>{model}{options.includes(model) ? "" : "（当前值，端点未返回）"}</option>)}</select>
  ) : (
    <input name={label === "通用分析模型" ? "analysis-model" : "image-model"} autoComplete="off" value={value} onChange={(event) => onChange(event.target.value)} />
  )}<small>{catalogLoaded ? `${options.length} 个候选模型` : "连接成功后显示当前端点返回的候选模型。"}</small></label>;
}

function reconcileSettingsWithCatalog(settings: AppSettings, catalog: ConnectionTestResult): AppSettings {
  const analysisModel = catalog.analysisModels.includes(settings.analysisModel)
    ? settings.analysisModel
    : catalog.analysisModels[0] || settings.analysisModel;
  const imageModel = catalog.imageModels.includes(settings.imageModel)
    ? settings.imageModel
    : catalog.imageModels[0] || settings.imageModel;
  return { ...settings, analysisModel, imageModel };
}

async function sendRequest<T = unknown>(request: RuntimeRequest): Promise<T> {
  let response: RuntimeResponse<T> | undefined;
  try {
    const runtime = getBrowserRuntime();
    if (!runtime?.sendMessage) return previewRequest(request) as T;
    response = await sendRuntimeMessage<T>(runtime, request);
  } catch (error) {
    throw new Error(formatRuntimeMessageError(error));
  }
  if (!response) throw new Error("扩展后台没有返回响应，请重新加载扩展后再试。");
  if (!response.ok) throw new Error(response.error);
  return response.data;
}

async function sendRuntimeMessage<T>(
  runtime: typeof browser.runtime,
  request: RuntimeRequest
): Promise<RuntimeResponse<T>> {
  try {
    return (await runtime.sendMessage(request)) as RuntimeResponse<T>;
  } catch (error) {
    if (!isRetryableRuntimeRequest(request) || !isTransientMessageChannelError(error)) throw error;
    await new Promise((resolve) => setTimeout(resolve, 120));
    return (await runtime.sendMessage(request)) as RuntimeResponse<T>;
  }
}

async function persistAnalysisResult(result: AnalysisResult): Promise<void> {
  if (typeof browser === "undefined" || !browser.storage?.session) {
    previewSession = { ...previewSession, result };
    return;
  }
  try {
    await browser.storage.session.set({ [STORAGE_KEYS.result]: result });
  } catch (error) {
    throw new Error(formatRuntimeMessageError(error));
  }
}

async function ensureRemoteAccess(settings: AppSettings, source?: ImageSource | null): Promise<void> {
  await requestUrlAccesses(remoteAccessUrls(settings, source));
}

async function hasRemoteAccess(settings: AppSettings, source?: ImageSource | null): Promise<boolean> {
  return hasUrlAccesses(remoteAccessUrls(settings, source));
}

function remoteAccessUrls(settings: AppSettings, source?: ImageSource | null): string[] {
  const urls = [normalizeApiBaseUrl(settings.apiBaseUrl)];
  if (source?.url && !source.dataUrl) urls.push(source.url);
  return urls;
}

function ReconstructionReadinessPanel({ result, references, onExport }: {
  result: AnalysisResult;
  references: ReferenceImage[];
  onExport: () => void;
}) {
  const [readiness, setReadiness] = useState<ReconstructionReadiness>();
  useEffect(() => {
    let active = true;
    void import("../../shared/reconstruction-package").then(({ assessReconstructionReadiness }) => {
      if (active) setReadiness(assessReconstructionReadiness(result, references));
    });
    return () => { active = false; };
  }, [result, references]);
  if (!readiness) return null;
  return <CollapsibleSection
    title="3D 交接就绪度"
    summary={readiness.label}
    badge={`${Math.round(readiness.score * 100)}%`}
    className="reconstruction-shell"
  ><section className={`reconstruction-readiness ${readiness.level}`}>
    <header><div><span>IMG2THREEJS</span><p>{readiness.label}</p></div><strong>{Math.round(readiness.score * 100)}</strong></header>
    <p>{readiness.summary}</p>
    <div className="readiness-meter"><span style={{ width: `${Math.round(readiness.score * 100)}%` }} /></div>
    {readiness.missingViews.length > 0 && <div className="readiness-missing"><b>缺失真实视图</b>{readiness.missingViews.map((view) => <span key={view}>{view}</span>)}</div>}
    <ol>{readiness.nextActions.map((action) => <li key={action}>{action}</li>)}</ol>
    <button className="button secondary" onClick={onExport}><PackageCheck size={16} />导出 3D 交接包</button>
    <small>用于程序化 Three.js 早期体块与设计校核，不是可制造 CAD。AI 三视图不作为事实参考。</small>
  </section></CollapsibleSection>;
}

async function persistAnalysisOverview(overview: AnalysisOverviewResult): Promise<void> {
  if (typeof browser === "undefined" || !browser.storage?.session) {
    previewSession = { ...previewSession, overview };
    return;
  }
  try {
    await browser.storage.session.set({ [STORAGE_KEYS.overview]: overview });
  } catch (error) {
    throw new Error(formatRuntimeMessageError(error));
  }
}

async function persistReferences(references: ReferenceImage[]): Promise<void> {
  if (typeof browser === "undefined" || !browser.storage?.session) {
    previewSession = { ...previewSession, references };
    return;
  }
  try {
    await browser.storage.session.set({ [STORAGE_KEYS.references]: references });
  } catch (error) {
    throw new Error(formatRuntimeMessageError(error));
  }
}

async function persistSessionState(source: ImageSource, result: AnalysisResult): Promise<void> {
  if (typeof browser === "undefined" || !browser.storage?.session) {
    previewSession = { source, references: result.references ?? [], overview: null, result };
    return;
  }
  try {
    await browser.storage.session.remove(STORAGE_KEYS.overview);
    await browser.storage.session.set({
      [STORAGE_KEYS.selection]: source,
      [STORAGE_KEYS.references]: result.references ?? [],
      [STORAGE_KEYS.result]: result
    });
  } catch (error) {
    throw new Error(formatRuntimeMessageError(error));
  }
}

function previewRequest(request: RuntimeRequest): unknown {
  switch (request.type) {
    case "GET_SETTINGS": {
      try {
        const stored = JSON.parse(localStorage.getItem(PREVIEW_SETTINGS_KEY) || "{}");
        return normalizeSettings({
          ...(stored && typeof stored === "object" ? stored : {}),
          apiKey: previewApiKey || stored?.apiKey
        });
      } catch {
        return DEFAULT_SETTINGS;
      }
    }
    case "SAVE_SETTINGS": {
      const next = normalizeSettings(request.settings);
      previewApiKey = next.apiKey;
      localStorage.setItem(PREVIEW_SETTINGS_KEY, JSON.stringify(next.rememberApiKey ? next : { ...next, apiKey: "" }));
      return next;
    }
    case "GET_SELECTION":
      return previewSession;
    case "SET_SELECTION":
      previewSession = { source: request.source, references: [], overview: null, result: null };
      return request.source;
    default:
      throw new Error("此操作需要在已加载的 Chrome 扩展中运行。");
  }
}

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error ?? new Error("文件读取失败。"));
    reader.readAsDataURL(file);
  });
}

function downloadDataUrl(dataUrl: string, fileName: string) {
  const anchor = document.createElement("a");
  anchor.href = dataUrl;
  anchor.download = fileName;
  anchor.click();
}

function downloadText(text: string, fileName: string) {
  const url = URL.createObjectURL(new Blob([text], { type: "application/json" }));
  downloadDataUrl(url, fileName);
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  downloadDataUrl(url, fileName);
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError"
    || Boolean(error && typeof error === "object" && "name" in error && error.name === "AbortError");
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error || "未知错误");
}

function errorGuidance(message: string): string {
  if (/网页选图|标签页|系统页|扩展页|新标签页|注入选图|工具栏图标|文件网址/.test(message)) {
    return "网页选图在本地运行，与 API Key 或模型设置无关。";
  }
  if (/API|模型|密钥|端点|连接|HTTPS|网络/.test(message)) {
    return "请检查 API 地址、密钥、模型与网络后重试。";
  }
  if (/图片|文件|OCR|主体|裁切|SVG/.test(message)) {
    return "请检查图片或文件状态后重试，已有档案不会被删除。";
  }
  return "请按上方原因处理后重试。";
}

function referenceViewLabel(viewKind: ReferenceViewKind): string {
  return ({
    primary: "主图",
    front: "正面",
    left: "左侧",
    right: "右侧",
    top: "俯视",
    back: "背面",
    detail: "细节",
    "orthographic-sheet": "AI 三视图",
    unknown: "未分类"
  } satisfies Record<ReferenceViewKind, string>)[viewKind];
}

function evidenceProvenanceLabel(provenance: EvidenceAnchor["provenance"]): string {
  return provenance === "user-annotation" ? "人工标注"
    : provenance === "local-extraction" ? "本地提取"
      : "模型估计";
}

function normalizedRectStyle(rect: NonNullable<EvidenceAnchor["rect"]>): React.CSSProperties {
  return {
    left: `${rect.x * 100}%`,
    top: `${rect.y * 100}%`,
    width: `${rect.width * 100}%`,
    height: `${rect.height * 100}%`
  };
}

function formatElapsed(value: number): string {
  const seconds = Math.max(0, Math.round(value / 1_000));
  if (seconds < 60) return `${seconds} 秒`;
  return `${Math.floor(seconds / 60)} 分 ${seconds % 60} 秒`;
}
