import { useCallback, useEffect, useMemo, useRef, useState, type ComponentType } from "react";
import * as Tabs from "@radix-ui/react-tabs";
import * as Dialog from "@radix-ui/react-dialog";
import {
  AlertTriangle,
  Archive,
  ArrowRight,
  BookOpenText,
  Boxes,
  Check,
  ChevronRight,
  CircleDot,
  CloudOff,
  DatabaseBackup,
  Download,
  Copy,
  FileImage,
  FolderHeart,
  History,
  ImagePlus,
  Image as ImageIcon,
  Library,
  Lock,
  PackageCheck,
  PanelRight,
  Palette,
  PersonStanding,
  Plus,
  RefreshCw,
  Save,
  Search,
  ScanFace,
  Settings,
  ShieldCheck,
  Shuffle,
  Sparkles,
  Trash2,
  Upload,
  WandSparkles,
  X
} from "lucide-react";
import {
  AXIS_LABELS,
  AXIS_ORDER,
  UNKNOWN_CAPABILITIES,
  type AxisHand,
  type AxisName,
  type AnalysisMode,
  type AnalysisRecord,
  type AnalysisSummary,
  type AssetRecord,
  type BackupImportMode,
  type GenerationBatch,
  type GenerationSettings,
  type KeywordCard,
  type MaintenanceSummary,
  type ReferenceKind,
  type StudioRuntime,
  type StudioSnapshot
} from "@lensflow/contracts";
import { compilePrompt, drawAxis, drawHand, normalizeReferences, validateKeywordInput } from "@lensflow/core";
import { FanGallery } from "./FanGallery";
import type { ProviderDialogProps } from "./ProviderDialog";

export interface StudioAppProps {
  runtime: StudioRuntime;
  surface?: "page" | "sidepanel" | "site";
  title?: string;
  logoUrl?: string;
  initialView?: "create" | "collection" | "history" | "backup";
  initialProviderOpen?: boolean;
  providerDialog?: ComponentType<ProviderDialogProps>;
}

function AnalysisStage({ asset, summary, record, busy, readOnly, onQuick, onDeep, onCancel, onAdvanced, onSavePrompt, onUsePrompt, onSavePalette, onBack, onContinue }: {
  asset: AssetRecord | null;
  summary: AnalysisSummary | null;
  record: AnalysisRecord | null;
  busy: AnalysisMode | "";
  readOnly: boolean;
  onQuick: () => void;
  onDeep: () => void;
  onCancel: () => void;
  onAdvanced: () => void;
  onSavePrompt: (text: string, negative: string, language: "zh" | "en", variantKind?: "faithful" | "commercial" | "exploratory") => void;
  onUsePrompt: (text: string) => void;
  onSavePalette: () => void;
  onBack: () => void;
  onContinue: () => void;
}) {
  const result = record?.result;
  const [language, setLanguage] = useState<"zh" | "en">("zh");
  const [positive, setPositive] = useState("");
  const [negative, setNegative] = useState("");
  useEffect(() => {
    if (!result) return;
    setPositive(result.prompts.positive[language]);
    setNegative(result.prompts.negative[language]);
  }, [language, result]);
  const running = Boolean(busy) || ["queued", "preparing", "analyzing"].includes(summary?.state ?? "");
  if (!asset) return <section className="lf-stage"><div className="lf-empty-state"><ImagePlus size={28} /><h2>先选择一张产品或视觉素材</h2><p>Lensflow 会先在本机测量尺寸、比例和色卡，再发送一次结构化视觉分析请求。</p><button className="lf-button" onClick={onBack}>返回素材</button></div></section>;
  return <section className="lf-stage lf-analysis-stage">
    <div className="lf-section-heading"><div><span className="lf-kicker">产品优先 · 通用视觉回退</span><h1>分析产品并生成可编辑提示词</h1></div><div className="lf-heading-actions"><button className="lf-button" onClick={onAdvanced}><Settings size={16} />高级分析工具</button><button className="lf-button" disabled={readOnly || running} onClick={onDeep}><Sparkles size={16} />{busy === "deep" ? "深入分析中" : "深入分析"}</button></div></div>
    <div className="lf-analysis-layout">
      <div className="lf-analysis-source">
        <div className="lf-analysis-image">{asset.dataUrl || asset.previewUrl ? <img src={asset.dataUrl || asset.previewUrl} alt={asset.name} /> : <FileImage size={32} />}</div>
        <strong>{asset.name}</strong>
        <LocalMeasurements asset={asset} />
        {result?.measurements.palette.value?.length ? <div className="lf-palette-row" aria-label="本地测量色卡">{result.measurements.palette.value.map((color) => <span key={color.hex} title={`${color.hex} · ${Math.round(color.proportion * 100)}%`} style={{ background: color.hex }} />)}<button disabled={readOnly} onClick={onSavePalette}><Palette size={14} />保存为色卡参考</button></div> : null}
      </div>
      <div className="lf-analysis-content">
        {!summary && !record ? <div className="lf-analysis-empty"><WandSparkles size={24} /><h2>一次请求完成快速解构</h2><p>返回内容分类、形态与 CMF、构图镜头、证据边界、双语提示词、三种变体和五轴建议。</p><button className="lf-button is-primary" disabled={readOnly} onClick={onQuick}><WandSparkles size={16} />开始快速分析</button></div> : null}
        {running ? <div className="lf-analysis-progress" role="status"><RefreshCw className="is-spinning" /><div><strong>{summary?.state === "preparing" ? "正在准备本地证据" : (busy || summary?.mode) === "deep" ? "正在执行三段深入分析" : "正在执行一次结构化分析"}</strong><span>不会自动重试；中断后需由你明确重新发起。</span></div><button className="lf-button" onClick={onCancel}>取消</button></div> : null}
        {summary && ["failed", "interrupted"].includes(summary.state) ? <div className="lf-analysis-error"><AlertTriangle size={18} /><div><strong>{summary.state === "interrupted" ? "分析已中断" : "分析未完成"}</strong><span>{summary.error}</span></div><button className="lf-button" disabled={readOnly} onClick={onQuick}>重新分析</button></div> : null}
        {result ? <>
          <div className="lf-analysis-status"><span className={`state-${record?.state}`}><ShieldCheck size={15} />{record?.state === "partial" ? "部分结果" : "分析完成"}</span><strong>{contentKindLabel(result.classification.kind)}</strong><small>{Math.round(result.classification.confidence * 100)}% · {result.classification.reason}</small></div>
          <div className="lf-evidence-grid">
            <EvidenceBlock label="主体与摘要" values={[result.summary, result.subject]} />
            <EvidenceBlock label="形态结构" values={result.formStructure} />
            <EvidenceBlock label="CMF" values={[...result.cmf.color, ...result.cmf.material, ...result.cmf.finish]} />
            <EvidenceBlock label="画面呈现" values={[result.composition, result.camera, result.lighting, result.style]} />
          </div>
          <div className="lf-prompt-editor">
            <div className="lf-tray-heading"><div><strong>双语提示词</strong><small>编辑会保存为新版本，不覆盖分析结果。</small></div><div className="lf-segment"><button className={language === "zh" ? "is-active" : ""} onClick={() => setLanguage("zh")}>中文</button><button className={language === "en" ? "is-active" : ""} onClick={() => setLanguage("en")}>English</button></div></div>
            <label><span>正向提示词</span><textarea value={positive} onChange={(event) => setPositive(event.target.value)} /></label>
            <label><span>负向提示词</span><textarea value={negative} onChange={(event) => setNegative(event.target.value)} /></label>
            <div className="lf-prompt-actions"><button className="lf-button" onClick={() => void navigator.clipboard.writeText(positive)}><Copy size={15} />复制</button><button className="lf-button" disabled={readOnly || !positive.trim()} onClick={() => onSavePrompt(positive, negative, language)}><Save size={15} />收藏版本</button><button className="lf-button is-primary" disabled={!positive.trim()} onClick={() => onUsePrompt(positive)}>送入组合<ArrowRight size={15} /></button></div>
          </div>
          <div className="lf-variant-list"><strong>三种创作方向</strong>{result.variants.map((variant) => <div key={variant.kind}><span>{variant.label}</span><p>{variant.prompts.positive[language]}</p><button onClick={() => onUsePrompt(variant.prompts.positive[language])}>使用</button><button disabled={readOnly} onClick={() => onSavePrompt(variant.prompts.positive[language], variant.prompts.negative[language], language, variant.kind)}>收藏</button></div>)}</div>
          <div className="lf-axis-suggestions"><strong>五轴关键词建议</strong>{AXIS_ORDER.map((axis) => <div key={axis}><span>{AXIS_LABELS[axis]}</span><p>{result.axisSuggestions[axis].join(" · ") || "未识别"}</p></div>)}</div>
        </> : null}
      </div>
    </div>
    <div className="lf-stage-footer"><button className="lf-button" onClick={onBack}>返回素材</button><span>快速分析固定一次请求；深入分析必须由你主动发起。</span><button className="lf-button is-primary" disabled={!result} onClick={onContinue}>进入组合<ChevronRight size={16} /></button></div>
  </section>;
}

function LocalMeasurements({ asset }: { asset: AssetRecord }) {
  const value = (name: string) => {
    const field = asset.metadata[name];
    return field && typeof field === "object" && "value" in field ? (field as { value?: unknown }).value : field;
  };
  return <dl className="lf-local-measurements"><div><dt>尺寸</dt><dd>{String(value("width") ?? "?")} × {String(value("height") ?? "?")}</dd></div><div><dt>比例</dt><dd>{String(value("aspectRatio") ?? "未知")}</dd></div><div><dt>证据</dt><dd><span className="evidence-measured">measured</span></dd></div></dl>;
}

function EvidenceBlock({ label, values }: { label: string; values: Array<{ value: string | null; source: "observed" | "inferred" | "unknown"; confidence?: number }> }) {
  const shown = values.filter((item) => item.value);
  return <section><strong>{label}</strong>{shown.length ? shown.map((item, index) => <p key={`${item.value}-${index}`}><span className={`evidence-${item.source}`}>{item.source}</span>{item.value}</p>) : <p><span className="evidence-unknown">unknown</span>未返回可验证内容</p>}</section>;
}

function contentKindLabel(kind: AnalysisRecord["result"] extends infer _ ? "product" | "person" | "scene" | "graphic" | "other" : never) {
  return ({ product: "实体产品", person: "人物", scene: "场景", graphic: "平面内容", other: "其他内容" } as const)[kind];
}

const EMPTY_HAND: AxisHand = { style: null, subject: null, composition: null, color: null, motion: null };
const EMPTY_SNAPSHOT: StudioSnapshot = {
  connectionState: "checking",
  connected: false,
  readOnly: true,
  protocolVersion: 2,
  extensionVersion: null,
  connectionMessage: "正在检测本机插件。",
  provider: null,
  capabilities: { ...UNKNOWN_CAPABILITIES },
  keywords: [],
  analyses: [],
  prompts: [],
  assets: [],
  references: [],
  batches: [],
  historyEvents: [],
  storage: null
};

export function StudioApp({ runtime, surface = "page", title = "镜序 Lensflow", logoUrl, initialView = "create", initialProviderOpen = false, providerDialog: ProviderEditor }: StudioAppProps) {
  const [snapshot, setSnapshot] = useState<StudioSnapshot>(EMPTY_SNAPSHOT);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [providerOpen, setProviderOpen] = useState(initialProviderOpen);
  const [hand, setHand] = useState<AxisHand>(EMPTY_HAND);
  const [tray, setTray] = useState<KeywordCard[]>([]);
  const [body, setBody] = useState("");
  const [newKeyword, setNewKeyword] = useState("");
  const [newAxis, setNewAxis] = useState<AxisName>("style");
  const [showKeywordForm, setShowKeywordForm] = useState(false);
  const [keywordError, setKeywordError] = useState("");
  const [activeStep, setActiveStep] = useState(1);
  const [settings, setSettings] = useState<GenerationSettings>({ model: "", size: "1024x1024", quality: "medium", count: 4, concurrency: 2 });
  const [submitting, setSubmitting] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);
  const [activeSection, setActiveSection] = useState(initialView);
  const [selectedAssetId, setSelectedAssetId] = useState<string | null>(null);
  const [selectedBatchId, setSelectedBatchId] = useState<string | null>(null);
  const [analysisRecord, setAnalysisRecord] = useState<AnalysisRecord | null>(null);
  const [analysisBusy, setAnalysisBusy] = useState<AnalysisMode | "">("");
  const uploadInputRef = useRef<HTMLInputElement>(null);
  const providerReturnRef = useRef<HTMLButtonElement>(null);

  const reload = useCallback(async () => {
    try {
      const next = await runtime.load();
      setSnapshot(next);
      setSettings((current) => ({ ...current, model: current.model || next.provider?.imageModel || "" }));
      setError("");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "无法读取本地工作区");
    } finally { setLoading(false); }
  }, [runtime]);

  useEffect(() => {
    void reload();
    const unsubscribe = runtime.subscribe?.(setSnapshot);
    const media = matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReducedMotion(media.matches);
    update();
    media.addEventListener("change", update);
    return () => { unsubscribe?.(); media.removeEventListener("change", update); };
  }, [reload, runtime]);

  useEffect(() => {
    try {
      const stored = JSON.parse(sessionStorage.getItem("lensflow-composer-session") || "null") as { hand?: AxisHand; tray?: KeywordCard[]; body?: string; activeStep?: number; selectedAssetId?: string | null } | null;
      const handoff = JSON.parse(sessionStorage.getItem("lensflow-studio-handoff") || "null") as { body?: string; activeStep?: number; selectedAssetId?: string } | null;
      sessionStorage.removeItem("lensflow-studio-handoff");
      if (stored?.hand) setHand(stored.hand);
      if (stored?.tray) setTray(stored.tray);
      if (typeof stored?.body === "string") setBody(stored.body);
      if (stored?.activeStep && stored.activeStep >= 1 && stored.activeStep <= 5) setActiveStep(stored.activeStep);
      if (stored?.selectedAssetId) setSelectedAssetId(stored.selectedAssetId);
      if (typeof handoff?.body === "string") setBody(handoff.body);
      if (handoff?.activeStep && handoff.activeStep >= 1 && handoff.activeStep <= 5) setActiveStep(handoff.activeStep);
      if (handoff?.selectedAssetId) setSelectedAssetId(handoff.selectedAssetId);
      if (!sessionStorage.getItem("lensflow-session-id")) sessionStorage.setItem("lensflow-session-id", crypto.randomUUID());
    } catch { /* Ignore damaged per-tab session state. */ }
  }, []);

  useEffect(() => {
    sessionStorage.setItem("lensflow-composer-session", JSON.stringify({ hand, tray, body, activeStep, selectedAssetId }));
  }, [activeStep, body, hand, selectedAssetId, tray]);

  const compiledPrompt = useMemo(() => compilePrompt(hand, [tray.map((card) => card.text).join("，"), body].filter(Boolean).join("，")), [body, hand, tray]);
  const latestBatch = snapshot.batches.find((batch) => batch.id === selectedBatchId) ?? snapshot.batches[0] ?? null;
  const selectedAsset = snapshot.assets.find((asset) => asset.id === selectedAssetId) ?? null;
  const selectedAnalysis = snapshot.analyses.find((analysis) => analysis.assetId === selectedAssetId) ?? null;
  const isSite = surface === "site";
  const writesDisabled = snapshot.readOnly || snapshot.connectionState !== "connected";

  const drawOne = (axis: AxisName) => setHand((current) => ({ ...current, [axis]: drawAxis(axis, snapshot.keywords, current[axis]) }));
  const toggleLock = (axis: AxisName) => setHand((current) => current[axis] ? ({ ...current, [axis]: { ...current[axis]!, locked: !current[axis]!.locked } }) : current);
  const addHandToTray = () => setTray((current) => [...new Map([...current, ...AXIS_ORDER.map((axis) => hand[axis]).filter((card): card is KeywordCard => Boolean(card))].map((card) => [card.id, card])).values()]);

  const createKeyword = async () => {
    try {
      const text = validateKeywordInput(newKeyword, newAxis, snapshot.keywords);
      await runtime.createKeyword({ axis: newAxis, text });
      setNewKeyword("");
      setKeywordError("");
      setShowKeywordForm(false);
      await reload();
    } catch (reason) {
      setKeywordError(reason instanceof Error ? reason.message : "关键词保存失败。");
    }
  };

  const openKeywordDialog = () => {
    if (writesDisabled) return;
    setKeywordError("");
    setShowKeywordForm(true);
  };

  const openProvider = async (trigger?: HTMLButtonElement) => {
    if (trigger) providerReturnRef.current = trigger;
    setError("");
    if (!isSite) {
      setProviderOpen(true);
      return;
    }
    try { await runtime.openProviderSettings(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "无法打开插件 Provider 设置。"); }
  };

  const openAdvancedAnalysis = async () => {
    if (!selectedAssetId || writesDisabled) return;
    try { await runtime.openAnalysis(selectedAssetId); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "无法打开图像解构。"); }
  };

  useEffect(() => {
    const handoff = snapshot.captureHandoff;
    if (!handoff || sessionStorage.getItem("lensflow-last-capture-handoff") === handoff.createdAt) return;
    sessionStorage.setItem("lensflow-last-capture-handoff", handoff.createdAt);
    setSelectedAssetId(handoff.assetId);
    setActiveSection("create");
    setActiveStep(2);
  }, [snapshot.captureHandoff]);

  useEffect(() => {
    if (!selectedAnalysis || !["ready", "partial"].includes(selectedAnalysis.state)) {
      if (!selectedAnalysis) setAnalysisRecord(null);
      return;
    }
    void runtime.getAnalysis(selectedAnalysis.id).then((record) => {
      setAnalysisRecord(record);
      const handoff = snapshot.captureHandoff;
      if (handoff?.assetId === record.assetId && handoff.intent === "analyze-generate" && record.result) {
        setBody(record.result.prompts.positive.zh);
        setActiveStep(3);
      }
    }).catch((reason) => setError(reason instanceof Error ? reason.message : "无法读取分析结果"));
  }, [runtime, selectedAnalysis?.id, selectedAnalysis?.state, snapshot.captureHandoff?.createdAt]);

  const runAnalysis = async (mode: AnalysisMode) => {
    if (!selectedAssetId || writesDisabled) return;
    setAnalysisBusy(mode);
    setError("");
    try {
      const record = await runtime.analyzeAsset(selectedAssetId, mode);
      setAnalysisRecord(record);
      await reload();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "分析失败");
    } finally { setAnalysisBusy(""); }
  };

  const saveAnalysisPrompt = async (text: string, negativeText: string, language: "zh" | "en", variantKind?: "faithful" | "commercial" | "exploratory") => {
    if (!analysisRecord?.result) return;
    await runtime.savePrompt({
      text,
      negativeText,
      language,
      sourceAssetId: analysisRecord.assetId,
      sourceAnalysisId: analysisRecord.id,
      variantKind,
      model: analysisRecord.model
    });
    await reload();
  };

  const canOpenStep = (step: number) => {
    if (snapshot.readOnly) return true;
    if (step <= 2) return true;
    if (step === 3) return Boolean(selectedAssetId || body || snapshot.keywords.length);
    if (step === 4) return Boolean(compiledPrompt);
    return Boolean(latestBatch);
  };

  const createBatch = async () => {
    if (!compiledPrompt || !settings.model || snapshot.readOnly) return;
    setSubmitting(true);
    setError("");
    try {
      const batch = await runtime.createBatch({ prompt: compiledPrompt, settings, referenceIds: snapshot.references.filter((item) => item.enabled).map((item) => item.id) });
      setSelectedBatchId(batch.id);
      setActiveStep(5);
      await reload();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "提交失败");
    } finally { setSubmitting(false); }
  };

  const importCapture = async (file: File) => {
    if (!runtime.importCapture) {
      setError("当前界面不能直接导入图片，请在插件工作台中操作。");
      return;
    }
    if (!file.type.startsWith("image/")) {
      setError("请选择图片文件。");
      return;
    }
    setLoading(true);
    try {
      const asset = await runtime.importCapture({ name: file.name, dataUrl: await fileToDataUrl(file), mimeType: file.type, size: file.size });
      setActiveSection("create");
      setSelectedAssetId(asset.id);
      setActiveStep(2);
      await reload();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "图片导入失败");
    } finally { setLoading(false); }
  };

  const openBackup = () => {
    if (runtime.exportBackup) setActiveSection("backup");
    else void runtime.openBackup();
  };

  const addReference = async (kind: ReferenceKind) => {
    if (!selectedAssetId || !runtime.addReference) return;
    try {
      await runtime.addReference(selectedAssetId, kind);
      await reload();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "参考资产添加失败");
    }
  };

  return (
    <div className={`lf-app surface-${surface}`}>
      <header className="lf-topbar">
        <div className="lf-brand"><span className="lf-brand-mark">{logoUrl ? <img src={logoUrl} alt="" /> : <Boxes size={22} />}</span><strong>{title}</strong></div>
        {surface !== "sidepanel" && <div className="lf-project"><span>产品分析与创作</span><small>本地工作区</small></div>}
        <div className={`lf-connection state-${snapshot.connectionState} ${snapshot.connected ? "is-online" : ""}`}><CircleDot size={14} />{connectionLabel(snapshot.connectionState)}</div>
        <nav className="lf-topnav" aria-label="工作区">
          <button className={activeSection === "create" ? "is-active" : ""} onClick={() => setActiveSection("create")}>创作</button>
          <button className={activeSection === "collection" ? "is-active" : ""} onClick={() => setActiveSection("collection")}>收藏</button>
          <button className={activeSection === "history" ? "is-active" : ""} onClick={() => setActiveSection("history")}>历史</button>
        </nav>
        <button className="lf-icon-button lf-provider-trigger" type="button" onClick={(event) => void openProvider(event.currentTarget)} aria-label="Provider 设置"><Settings size={19} /></button>
      </header>

      {snapshot.connectionState !== "connected" && surface === "site" && (
        <div className={`lf-bridge-notice state-${snapshot.connectionState}`}>
          {snapshot.connectionState === "checking" ? <RefreshCw className="is-spinning" size={17} /> : snapshot.connectionState === "incompatible" ? <AlertTriangle size={17} /> : <CloudOff size={17} />}
          <span>{snapshot.connectionMessage || "安装并连接 Lensflow 插件后才能生成、写入资产和同步任务。"}</span>
          <a href="/lensflow/download">{snapshot.connectionState === "incompatible" ? "更新插件" : "安装插件"}</a>
          <button type="button" onClick={() => { setLoading(true); void reload(); }}><RefreshCw size={14} />重新检测</button>
        </div>
      )}
      {surface === "site" && <div className="lf-mobile-readonly"><AlertTriangle size={16} /><span>移动端仅提供只读预览；完整创作请使用桌面 Chrome 与 Lensflow 插件。</span></div>}

      <div className="lf-workspace">
        <aside className="lf-library" aria-label="资产库">
          <Tabs.Root defaultValue="assets">
            <Tabs.List className="lf-tabs" aria-label="资产类型"><Tabs.Trigger value="assets">素材</Tabs.Trigger><Tabs.Trigger value="prompts">提示词</Tabs.Trigger><Tabs.Trigger value="references">参考</Tabs.Trigger><Tabs.Trigger value="works">作品</Tabs.Trigger></Tabs.List>
            <div className="lf-library-tools"><label className="lf-search"><Search size={15} /><input placeholder="搜索本地资产" /></label><button className="lf-icon-button" aria-label="筛选"><PanelRight size={16} /></button></div>
            <Tabs.Content value="assets">
              <div className="lf-quick-actions">
                <button className="lf-write-action" disabled={writesDisabled} title={writesDisabled ? "连接桌面插件后可用" : undefined} onClick={() => void runtime.openCapture()}><FileImage size={18} /><span>网页捕捉</span></button>
                <button className="lf-write-action" disabled={writesDisabled} title={writesDisabled ? "连接桌面插件后可用" : undefined} onClick={() => uploadInputRef.current?.click()}><Upload size={18} /><span>上传图片</span></button>
              </div>
              <AssetList snapshot={snapshot} kind="capture" selectedId={selectedAssetId} onSelect={setSelectedAssetId} />
              {selectedAssetId && <div className="lf-selected-actions"><strong>选中素材操作</strong><button disabled={writesDisabled} onClick={() => setActiveStep(2)}><WandSparkles size={16} />产品分析</button><button disabled={writesDisabled || Boolean(analysisBusy)} onClick={() => void runAnalysis("deep")}><Sparkles size={16} />深入分析</button></div>}
            </Tabs.Content>
            <Tabs.Content value="prompts"><PromptLibrary snapshot={snapshot} onDelete={async (id) => { await runtime.deleteKeyword(id); await reload(); }} onUse={(text) => { setBody(text); setActiveStep(3); }} /></Tabs.Content>
            <Tabs.Content value="references"><AssetList snapshot={snapshot} kind="reference" /></Tabs.Content>
            <Tabs.Content value="works"><AssetList snapshot={snapshot} kind="work" /></Tabs.Content>
          </Tabs.Root>
          <div className="lf-library-footer">
            <StorageMeter snapshot={snapshot} />
            <button className="lf-wide-action" onClick={openBackup}><Archive size={17} />本地备份与恢复<ChevronRight size={16} /></button>
          </div>
        </aside>

        <main className="lf-main" id="create">
          {activeSection === "create" && <>
          <div className="lf-stepper" aria-label="创作步骤">
            {["素材", "分析", "组合", "预检", "结果"].map((label, index) => { const step = index + 1; const reachable = canOpenStep(step); return <button key={label} disabled={!reachable} aria-current={activeStep === step ? "step" : undefined} className={activeStep === step ? "is-active" : activeStep > step ? "is-complete" : ""} onClick={() => setActiveStep(step)}><span>{activeStep > step ? <Check size={14} /> : step}</span>{label}</button>; })}
          </div>

          {loading ? <div className="lf-empty"><RefreshCw className="is-spinning" /><strong>正在读取本地工作区</strong></div> : null}
          {!loading && activeStep === 1 && (
            <section className="lf-stage">
              <div className="lf-section-heading"><div><span className="lf-kicker">从自己的素材开始</span><h1>建立本次创作的输入</h1></div></div>
              {snapshot.assets.length === 0 ? (
                <div className="lf-empty-state">
                  <div className="lf-empty-icon"><ImagePlus size={26} /></div>
                  <h2>本机还没有创作素材</h2>
                  <p>Lensflow 不内置演示素材。捕捉网页图片、上传自己的图片，或先创建关键词。</p>
                  <div className="lf-write-actions"><button className="lf-button is-primary" disabled={writesDisabled} onClick={() => void runtime.openCapture()}><FileImage size={16} />去网页捕捉</button><button className="lf-button" disabled={writesDisabled} onClick={() => uploadInputRef.current?.click()}><Upload size={16} />上传并解构</button><button className="lf-button" disabled={writesDisabled} onClick={openKeywordDialog}><Plus size={16} />创建关键词</button></div>
                </div>
              ) : <AssetList snapshot={snapshot} selectedId={selectedAssetId} onSelect={setSelectedAssetId} />}
              <div className="lf-stage-footer"><span>选择图片后先完成本地测量与一次快速结构化分析。</span><button className="lf-button is-primary" disabled={!selectedAssetId && !snapshot.readOnly} onClick={() => setActiveStep(2)}>进入分析<ChevronRight size={16} /></button></div>
            </section>
          )}

          {!loading && activeStep === 2 && (
            <AnalysisStage
              asset={selectedAsset}
              summary={selectedAnalysis}
              record={analysisRecord}
              busy={analysisBusy}
              readOnly={writesDisabled}
              onQuick={() => void runAnalysis("quick")}
              onDeep={() => void runAnalysis("deep")}
              onCancel={() => { const id = analysisRecord?.id || selectedAnalysis?.id; if (id) void runtime.cancelAnalysis(id).then(setAnalysisRecord); }}
              onAdvanced={() => void openAdvancedAnalysis()}
              onSavePrompt={(text, negative, language, variantKind) => void saveAnalysisPrompt(text, negative, language, variantKind)}
              onUsePrompt={(text) => { setBody(text); setActiveStep(3); }}
              onSavePalette={() => void addReference("palette")}
              onBack={() => setActiveStep(1)}
              onContinue={() => setActiveStep(3)}
            />
          )}

          {!loading && activeStep === 3 && (
            <section className="lf-stage lf-composer">
              <div className="lf-section-heading"><div><span className="lf-kicker">五轴抽卡</span><h1>把灵感组合成可控提示词</h1></div><div className="lf-heading-actions"><button className="lf-button" disabled={writesDisabled} onClick={openKeywordDialog}><Plus size={16} />新增关键词</button><button className="lf-button" disabled={!snapshot.keywords.length} onClick={() => setHand((current) => drawHand(snapshot.keywords, current))}><Shuffle size={16} />全部重抽</button></div></div>
              {snapshot.keywords.length === 0 ? (
                <div className="lf-inline-empty"><Library size={20} /><span>关键词库为空。先从网页收藏文字、图片解构结果或手动输入创建。</span><button disabled={writesDisabled} onClick={openKeywordDialog}>创建第一个关键词</button></div>
              ) : (
                <div className="lf-axis-grid">{AXIS_ORDER.map((axis) => <AxisCard key={axis} axis={axis} card={hand[axis]} onDraw={() => drawOne(axis)} onLock={() => toggleLock(axis)} />)}</div>
              )}
              <button className="lf-tray-add" onClick={addHandToTray} disabled={!AXIS_ORDER.some((axis) => hand[axis])}><Plus size={16} />整手送入词卡托盘</button>
              <div className="lf-tray"><div className="lf-tray-heading"><strong>词卡托盘</strong><button onClick={() => setTray([])}>清空</button></div><div>{tray.length ? tray.map((card) => <button key={card.id} onClick={() => setTray((current) => current.filter((item) => item.id !== card.id))}>{card.text}<X size={13} /></button>) : <span>抽取或创建关键词后放入这里</span>}</div></div>
              <label className="lf-prompt-field"><span>正文与补充要求</span><textarea value={body} onChange={(event) => setBody(event.target.value)} placeholder="描述主体、环境、镜头和需要保留的细节……" /></label>
              <div className="lf-prompt-preview"><span>最终提示词</span><p>{compiledPrompt || "提示词将在这里按风格、主体、构图、色彩、动态的顺序预览。"}</p></div>
              <ReferenceComposer snapshot={snapshot} selectedAssetId={selectedAssetId} onAdd={(kind) => void addReference(kind)} onToggle={async (id, enabled) => { await runtime.setReferenceEnabled?.(id, enabled); await reload(); }} onDelete={async (id) => { await runtime.deleteReference?.(id); await reload(); }} />
              <div className="lf-stage-footer"><button className="lf-button" onClick={() => setActiveStep(2)}>返回分析</button><button className="lf-button is-primary" disabled={!compiledPrompt} onClick={() => setActiveStep(4)}>检查并提交<ChevronRight size={16} /></button></div>
            </section>
          )}

          {!loading && activeStep === 4 && (
            <Preflight snapshot={snapshot} settings={settings} setSettings={setSettings} prompt={compiledPrompt} onConfigure={(trigger) => void openProvider(trigger)} onBack={() => setActiveStep(3)} onSubmit={() => void createBatch()} submitting={submitting} />
          )}

          {!loading && activeStep === 5 && (
            latestBatch ? <FanGallery
              batch={latestBatch}
              reducedMotion={reducedMotion}
              readOnly={writesDisabled}
              onRetryFailed={async () => { await runtime.retryFailed(latestBatch.id); await reload(); }}
              onSave={async (child) => { await runtime.saveWork(latestBatch.id, child.id); await reload(); }}
              onDownload={(child) => runtime.download(latestBatch.id, child?.id)}
              onDownloadMany={(children) => runtime.downloadMany({ batchId: latestBatch.id, childIds: children.map((child) => child.id) })}
              onEagle={runtime.exportToEagle ? async (child) => { const result = await runtime.exportToEagle!(latestBatch.id, child.id); return `${result.libraryName} · ${result.itemCount} 项 · ${result.tags.length} 个标签已回读`; } : undefined}
              onEagleMany={runtime.exportManyToEagle ? async (children) => { const results = await runtime.exportManyToEagle!({ batchId: latestBatch.id, childIds: children.map((child) => child.id) }); const last = results.at(-1); return `${last?.libraryName ?? "Eagle"} · 已导出 ${results.length} 项${last ? ` · 库内 ${last.itemCount} 项` : ""}`; } : undefined}
              onCancel={async () => { await runtime.cancelBatch(latestBatch.id); await reload(); }}
              canCancel={snapshot.capabilities.cancellation === "supported"}
              logoUrl={logoUrl}
            />
              : <div className="lf-empty-state"><FolderHeart size={28} /><h2>还没有生成结果</h2><p>完成组合和预检后，结果会以卡池形式保存在本次会话画架。</p><button className="lf-button is-primary" onClick={() => setActiveStep(3)}>开始组合</button></div>
          )}
          </>}
          {activeSection === "collection" && <CollectionView snapshot={snapshot} />}
          {activeSection === "history" && <HistoryView
            snapshot={snapshot}
            onOpenBatch={(batchId) => { setSelectedBatchId(batchId); setActiveSection("create"); setActiveStep(5); }}
            onOpenAnalysis={(assetId) => { setSelectedAssetId(assetId); setActiveSection("create"); setActiveStep(2); }}
          />}
          {activeSection === "backup" && <BackupCenter runtime={runtime} onChanged={reload} />}
          {error && <div className="lf-error" role="alert">{error}</div>}
        </main>

        <aside className="lf-inspector" aria-label="上下文检查器">
          <Tabs.Root defaultValue="provider">
            <Tabs.List className="lf-tabs"><Tabs.Trigger value="work">作品</Tabs.Trigger><Tabs.Trigger value="tasks">任务</Tabs.Trigger><Tabs.Trigger value="provider">Provider</Tabs.Trigger><Tabs.Trigger value="sync">同步</Tabs.Trigger></Tabs.List>
            <Tabs.Content value="provider"><InspectorProvider snapshot={snapshot} onConfigure={(trigger) => void openProvider(trigger)} /></Tabs.Content>
            <Tabs.Content value="tasks"><InspectorTasks batches={snapshot.batches} /></Tabs.Content>
            <Tabs.Content value="work"><InspectorWorks snapshot={snapshot} /></Tabs.Content>
            <Tabs.Content value="sync"><InspectorSync snapshot={snapshot} /></Tabs.Content>
          </Tabs.Root>
        </aside>
      </div>

      <Dialog.Root open={showKeywordForm} onOpenChange={(open) => { setShowKeywordForm(open); if (!open) setKeywordError(""); }}>
        <Dialog.Portal><Dialog.Overlay className="lf-dialog-overlay" /><Dialog.Content className="lf-dialog-content lf-keyword-dialog" aria-describedby="keyword-description"><div className="lf-dialog-titlebar"><div><span className="lf-kicker">用户关键词库</span><Dialog.Title>创建关键词</Dialog.Title></div><Dialog.Close className="lf-icon-button" aria-label="关闭创建关键词"><X size={18} /></Dialog.Close></div><Dialog.Description id="keyword-description">关键词只保存在本机，并用于五轴抽卡和提示词组合。</Dialog.Description><label className="lf-field"><span>所属轴</span><select value={newAxis} onChange={(event) => { setNewAxis(event.target.value as AxisName); setKeywordError(""); }}>{AXIS_ORDER.map((axis) => <option value={axis} key={axis}>{AXIS_LABELS[axis]}</option>)}</select></label><label className="lf-field"><span>关键词</span><input autoFocus value={newKeyword} onChange={(event) => { setNewKeyword(event.target.value); setKeywordError(""); }} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); void createKeyword(); } }} placeholder="输入自己的关键词" maxLength={240} /></label>{keywordError && <p className="lf-inline-status is-warning" role="alert"><AlertTriangle size={15} />{keywordError}</p>}<div className="lf-dialog-actions"><Dialog.Close className="lf-button">取消</Dialog.Close><button className="lf-button is-primary" disabled={!newKeyword.trim()} onClick={() => void createKeyword()}>保存到关键词库</button></div></Dialog.Content></Dialog.Portal>
      </Dialog.Root>
      <input ref={uploadInputRef} type="file" accept="image/*" hidden onChange={(event) => { const file = event.target.files?.[0]; if (file) void importCapture(file); event.currentTarget.value = ""; }} />
      {!isSite && ProviderEditor && <ProviderEditor runtime={runtime} provider={snapshot.provider} open={providerOpen} onOpenChange={setProviderOpen} onSaved={reload} returnFocusRef={providerReturnRef} />}
    </div>
  );
}

function CollectionView({ snapshot }: { snapshot: StudioSnapshot }) {
  const works = snapshot.assets.filter((asset) => asset.kind === "work");
  const palettes = snapshot.references.filter((reference) => reference.kind === "palette");
  return <section className="lf-secondary-view">
    <div className="lf-section-heading"><div><span className="lf-kicker">四类本地资产</span><h1>收藏与作品</h1></div><span>{snapshot.keywords.length + snapshot.prompts.length + palettes.length + works.length} 项</span></div>
    <Tabs.Root defaultValue="keywords" className="lf-collection-tabs">
      <Tabs.List className="lf-tabs" aria-label="收藏类型">
        <Tabs.Trigger value="keywords">关键词 <span>{snapshot.keywords.length}</span></Tabs.Trigger>
        <Tabs.Trigger value="prompts">提示词 <span>{snapshot.prompts.length}</span></Tabs.Trigger>
        <Tabs.Trigger value="palettes">色卡 <span>{palettes.length}</span></Tabs.Trigger>
        <Tabs.Trigger value="works">作品 <span>{works.length}</span></Tabs.Trigger>
      </Tabs.List>
      <Tabs.Content value="keywords">{snapshot.keywords.length ? <div className="lf-collection-list">{snapshot.keywords.map((item) => <article key={item.id}><span>{AXIS_LABELS[item.axis]}</span><strong>{item.text}</strong></article>)}</div> : <CollectionEmpty label="关键词" />}</Tabs.Content>
      <Tabs.Content value="prompts">{snapshot.prompts.length ? <div className="lf-collection-list is-prompts">{snapshot.prompts.map((item) => <article key={item.id}><span>{item.language === "zh" ? "中文" : "English"}{item.variantKind ? ` · ${item.variantKind}` : ""}</span><strong>{item.text}</strong><small>{item.model || "未记录模型"}</small></article>)}</div> : <CollectionEmpty label="提示词" />}</Tabs.Content>
      <Tabs.Content value="palettes">{palettes.length ? <div className="lf-work-grid">{palettes.map((item) => <article key={item.id}><div>{item.previewUrl || item.dataUrl ? <img src={item.previewUrl || item.dataUrl} alt={item.name} /> : <Palette size={28} />}</div><strong>{item.name}</strong><small>{item.enabled ? "当前启用" : "已保存"}</small></article>)}</div> : <CollectionEmpty label="色卡" />}</Tabs.Content>
      <Tabs.Content value="works">{works.length ? <div className="lf-work-grid">{works.map((asset) => <article key={asset.id}>
        <div>{asset.previewUrl || asset.dataUrl ? <img src={asset.previewUrl || asset.dataUrl} alt={asset.name} /> : <FolderHeart size={28} />}</div>
        <strong>{asset.name}</strong><small>{asset.prompt || "未保存提示词"}</small>
      </article>)}</div> : <CollectionEmpty label="作品" detail="生成结果会先进入历史，只有主动收入作品集后才会出现在这里。" />}</Tabs.Content>
    </Tabs.Root>
  </section>;
}

function CollectionEmpty({ label, detail }: { label: string; detail?: string }) {
  return <div className="lf-empty-state"><FolderHeart size={28} /><h2>还没有{label}</h2><p>{detail || `从分析和创作流程中主动保存${label}后，会在这里集中管理。`}</p></div>;
}

function HistoryView({ snapshot, onOpenBatch, onOpenAnalysis }: { snapshot: StudioSnapshot; onOpenBatch: (batchId: string) => void; onOpenAnalysis: (assetId: string) => void }) {
  const [taskType, setTaskType] = useState<"all" | "generation" | "analysis">("all");
  const [state, setState] = useState("all");
  const [previewBatchId, setPreviewBatchId] = useState(snapshot.batches[0]?.id ?? "");
  const batches = snapshot.batches.filter((batch) => (taskType === "all" || taskType === "generation") && (state === "all" || batch.state === state));
  const analyses = snapshot.analyses.filter((analysis) => (taskType === "all" || taskType === "analysis") && (state === "all" || analysis.state === state));
  const previewBatch = snapshot.batches.find((batch) => batch.id === previewBatchId) ?? batches[0];
  const previewReferences = previewBatch ? snapshot.references.filter((reference) => previewBatch.referenceIds.includes(reference.id)) : [];
  return <section className="lf-secondary-view">
    <div className="lf-section-heading"><div><span className="lf-kicker">可恢复的本地记录</span><h1>历史与任务</h1></div><span>{snapshot.batches.length} 个批次 · {snapshot.analyses.length} 次分析</span></div>
    <div className="lf-history-filters"><label>任务类型<select value={taskType} onChange={(event) => setTaskType(event.target.value as typeof taskType)}><option value="all">全部任务</option><option value="analysis">产品分析</option><option value="generation">图片生成</option></select></label><label>状态<select value={state} onChange={(event) => setState(event.target.value)}><option value="all">全部状态</option><option value="ready">已完成</option><option value="partial">部分完成</option><option value="generating">生成中</option><option value="failed">失败</option><option value="interrupted">已中断</option></select></label></div>
    <div className="lf-history-layout">
      <div><h2>任务记录</h2>
        {batches.map((batch) => <div className={`lf-history-row ${previewBatch?.id === batch.id ? "is-selected" : ""}`} key={batch.id}>
          <button className="lf-history-primary" onClick={() => setPreviewBatchId(batch.id)}><span className={`state-${batch.state}`}><History size={17} /></span><div><strong>{batch.prompt}</strong><small>{batch.settings.model} · {batch.children.filter((child) => child.state === "ready").length}/{batch.children.length} 完成</small></div><em>{batch.state}</em></button>
          <button className="lf-history-open" onClick={() => onOpenBatch(batch.id)}>打开结果</button>
        </div>)}
        {analyses.map((analysis) => <div className="lf-history-row" key={analysis.id}><button className="lf-history-primary" onClick={() => onOpenAnalysis(analysis.assetId)}><span className={`state-${analysis.state}`}><WandSparkles size={17} /></span><div><strong>{analysis.summary || "产品分析"}</strong><small>{analysis.model} · {analysis.mode === "deep" ? "深入分析" : "快速分析"}</small></div><em>{analysis.state}</em></button><button className="lf-history-open" onClick={() => onOpenAnalysis(analysis.assetId)}>查看分析</button></div>)}
        {!batches.length && !analyses.length ? <p className="lf-muted-copy">当前筛选条件下没有任务。</p> : null}
      </div>
      <div><h2>参考图与结果对比</h2>{previewBatch ? <div className="lf-history-compare"><section><strong>参考输入</strong><div>{previewReferences.length ? previewReferences.map((reference) => reference.previewUrl || reference.dataUrl ? <img key={reference.id} src={reference.previewUrl || reference.dataUrl} alt={reference.name} /> : null) : <span>本批次未使用参考图片</span>}</div></section><section><strong>生成结果</strong><div>{previewBatch.children.filter((child) => child.imageUrl || child.dataUrl).map((child) => <img key={child.id} src={child.imageUrl || child.dataUrl} alt={`结果 ${child.index + 1}`} />)}{!previewBatch.children.some((child) => child.imageUrl || child.dataUrl) ? <span>暂无可对比结果</span> : null}</div></section><button className="lf-button is-primary" onClick={() => onOpenBatch(previewBatch.id)}>打开批次并批量处理</button></div> : <p className="lf-muted-copy">选择生成批次后可并排核对参考图和结果。</p>}
        <h2>最近事件</h2>{snapshot.historyEvents.slice(0, 20).length ? snapshot.historyEvents.slice(0, 20).map((event) => <div className="lf-event-row" key={event.id}><span /><div><strong>{event.message}</strong><small>{new Date(event.createdAt).toLocaleString("zh-CN")}</small></div></div>) : <p className="lf-muted-copy">暂无历史事件。</p>}
      </div>
    </div>
  </section>;
}

function BackupCenter({ runtime, onChanged }: { runtime: StudioRuntime; onChanged: () => Promise<void> }) {
  const [maintenance, setMaintenance] = useState<MaintenanceSummary | null>(null);
  const [mode, setMode] = useState<BackupImportMode>("merge");
  const [busy, setBusy] = useState("");
  const [status, setStatus] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  const refresh = useCallback(async () => {
    if (runtime.loadMaintenance) setMaintenance(await runtime.loadMaintenance());
  }, [runtime]);

  useEffect(() => { void refresh(); }, [refresh]);

  const run = async (label: string, action: () => Promise<void>) => {
    setBusy(label);
    setStatus("");
    try { await action(); } catch (reason) { setStatus(reason instanceof Error ? reason.message : "操作失败"); }
    finally { setBusy(""); }
  };

  const importFile = async (file: File) => {
    if (!runtime.importBackup) return;
    if (file.size > 250 * 1024 * 1024) {
      setStatus("备份文件超过 250 MB，未读取或修改任何数据。");
      return;
    }
    if (mode === "replace" && !window.confirm("替换恢复会先清空 Lensflow 当前九张数据表。API Key 不受影响，是否继续？")) return;
    await run("import", async () => {
      const summary = await runtime.importBackup!(await file.text(), mode);
      const total = Object.values(summary.imported).reduce((sum, value) => sum + value, 0);
      setStatus(`已从${summary.sourceFormat === "lensflow" ? " Lensflow" : "旧插件"}导入 ${total} 条记录${summary.discardedSecrets ? "，密钥字段已丢弃" : ""}。`);
      await Promise.all([refresh(), onChanged()]);
    });
  };

  if (!runtime.exportBackup || !runtime.importBackup) {
    return <section className="lf-secondary-view"><div className="lf-empty-state"><DatabaseBackup size={28} /><h2>备份只在插件工作台中开放</h2><p>网页桥接不能读取完整数据库或密钥。请打开插件的本地备份界面。</p><button className="lf-button is-primary" onClick={() => void runtime.openBackup()}>打开插件备份</button></div></section>;
  }

  return <section className="lf-secondary-view lf-data-center">
    <div className="lf-section-heading"><div><span className="lf-kicker">数据只留在本机</span><h1>备份、恢复与维护</h1></div><ShieldCheck size={24} /></div>
    <div className="lf-data-section"><div><DatabaseBackup size={21} /><span><strong>完整本地备份</strong><small>包含九张数据表；API Key、令牌和授权头始终排除。</small></span></div><button className="lf-button is-primary" disabled={Boolean(busy)} onClick={() => void run("export", async () => { const output = await runtime.exportBackup!(); setStatus(`已导出 ${output.fileName}`); })}><Download size={16} />{busy === "export" ? "正在整理" : "导出备份"}</button></div>
    <div className="lf-data-section"><div><Upload size={21} /><span><strong>导入或迁移</strong><small>兼容 Lensflow 与 visual-lens-backup；导入前不会读取或恢复密钥。</small></span></div><div className="lf-data-actions"><select value={mode} onChange={(event) => setMode(event.target.value as BackupImportMode)}><option value="merge">合并现有数据</option><option value="replace">替换当前数据</option></select><button className="lf-button" disabled={Boolean(busy)} onClick={() => fileRef.current?.click()}><Upload size={16} />选择文件</button></div><input ref={fileRef} type="file" accept="application/json,.json" hidden onChange={(event) => { const file = event.target.files?.[0]; if (file) void importFile(file); event.currentTarget.value = ""; }} /></div>
    <div className="lf-data-section"><div><History size={21} /><span><strong>历史保留策略</strong><small>{maintenance ? `${maintenance.historyEventCount} 条事件 · ${maintenance.completedBatchCount} 个完成批次` : "正在读取"}</small></span></div><div className="lf-data-actions"><select value={maintenance?.historyRetentionDays ?? "all"} onChange={(event) => void run("retention", async () => { const value = event.target.value === "all" ? null : Number(event.target.value) as 30 | 90 | 180 | 365; setMaintenance(await runtime.setHistoryRetention!(value)); setStatus("历史保留策略已更新。") })}><option value="all">永久保留</option><option value="30">30 天</option><option value="90">90 天</option><option value="180">180 天</option><option value="365">365 天</option></select><button className="lf-button" disabled={Boolean(busy) || maintenance?.historyRetentionDays === null} onClick={() => void run("prune", async () => { setMaintenance(await runtime.pruneHistory!()); setStatus("已按保留策略清理过期历史，作品资产未删除。"); await onChanged(); })}>立即清理</button></div></div>
    <div className="lf-data-section"><div><PackageCheck size={21} /><span><strong>重复资产检测</strong><small>{maintenance ? maintenance.duplicateGroups.length ? `发现 ${maintenance.duplicateGroups.length} 组相同哈希` : "未发现可验证重复项" : "正在读取"}</small></span></div>{maintenance?.duplicateGroups.length ? <ul>{maintenance.duplicateGroups.slice(0, 5).map((group) => <li key={group.fingerprint}>{group.names.join("、")}</li>)}</ul> : null}</div>
    <div className="lf-data-section"><div><BookOpenText size={21} /><span><strong>脱敏诊断包</strong><small>只导出版本、表计数、能力状态和事件类型，不含提示词、图片、URL 或密钥。</small></span></div><button className="lf-button" disabled={Boolean(busy)} onClick={() => void run("diagnostics", async () => { const output = await runtime.exportDiagnostics!(); setStatus(`已导出 ${output.fileName}`); })}><Download size={16} />导出诊断</button></div>
    {status && <p className="lf-data-status" role="status">{status}</p>}
  </section>;
}

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error ?? new Error("图片读取失败。"));
    reader.readAsDataURL(file);
  });
}

function AxisCard({ axis, card, onDraw, onLock }: { axis: AxisName; card: KeywordCard | null; onDraw: () => void; onLock: () => void }) {
  return <div className={`lf-axis-card ${card ? "has-card" : ""}`}><div><span>{AXIS_LABELS[axis]}</span><button onClick={onLock} disabled={!card} aria-label={`锁定${AXIS_LABELS[axis]}`} className={card?.locked ? "is-locked" : ""}><Lock size={14} /></button></div><strong>{card?.text || "等待抽取"}</strong><button onClick={onDraw}><RefreshCw size={14} />{card ? "重抽" : "抽一张"}</button></div>;
}

function AssetList({ snapshot, kind, selectedId, onSelect }: { snapshot: StudioSnapshot; kind?: "capture" | "reference" | "work"; selectedId?: string | null; onSelect?: (id: string) => void }) {
  const assets = kind ? snapshot.assets.filter((asset) => asset.kind === kind) : snapshot.assets;
  return <div className="lf-asset-list">{assets.length ? assets.slice(0, 12).map((asset) => <button className={selectedId === asset.id ? "is-selected" : ""} aria-pressed={onSelect ? selectedId === asset.id : undefined} onClick={() => onSelect?.(asset.id)} key={asset.id}><span>{asset.previewUrl || asset.dataUrl ? <img src={asset.previewUrl || asset.dataUrl} alt="" /> : <FileImage size={16} />}</span><strong>{asset.name}</strong><small>{new Date(asset.updatedAt).toLocaleDateString("zh-CN")}</small></button>) : <p>暂无本地内容</p>}</div>;
}

function ReferenceComposer({ snapshot, selectedAssetId, onAdd, onToggle, onDelete }: {
  snapshot: StudioSnapshot;
  selectedAssetId: string | null;
  onAdd: (kind: ReferenceKind) => void;
  onToggle: (id: string, enabled: boolean) => void;
  onDelete: (id: string) => void;
}) {
  const selected = snapshot.assets.find((asset) => asset.id === selectedAssetId);
  const editingReady = snapshot.capabilities.imageEditing === "supported";
  return <section className="lf-reference-composer">
    <div className="lf-tray-heading"><div><strong>参考关系</strong><small>正文与主体 ＞ 角色身份 ＞ 姿态 ＞ 色卡</small></div><span>{snapshot.references.filter((reference) => reference.enabled).length} 个启用</span></div>
    <div className="lf-reference-add">
      <span>{selected ? `当前素材：${selected.name}` : "先在素材栏选择一张本地图片"}</span>
      <div>
        <button disabled={!selected || !editingReady} onClick={() => onAdd("image")}><ImageIcon size={15} />主体</button>
        <button disabled={!selected || !editingReady} onClick={() => onAdd("face")}><ScanFace size={15} />角色脸</button>
        <button disabled={!selected || !editingReady} onClick={() => onAdd("pose")}><PersonStanding size={15} />姿态</button>
        <button disabled={!selected || !editingReady} onClick={() => onAdd("palette")}><Palette size={15} />色卡</button>
      </div>
    </div>
    {!editingReady && <p className="lf-reference-warning">图片编辑能力未验证，参考关系暂不可添加或提交。请在 Provider 设置中主动运行能力检测。</p>}
    {snapshot.references.length ? <div className="lf-reference-list">{snapshot.references.map((reference) => <div key={reference.id}>
      <label><input type="checkbox" checked={reference.enabled} disabled={!editingReady} onChange={(event) => onToggle(reference.id, event.target.checked)} /><span>{referenceLabel(reference.kind)}</span><strong>{reference.name}</strong></label>
      <button onClick={() => onDelete(reference.id)} aria-label={`删除参考 ${reference.name}`}><Trash2 size={14} /></button>
    </div>)}</div> : null}
  </section>;
}

function referenceLabel(kind: ReferenceKind) {
  return ({ image: "主体", face: "角色脸", pose: "姿态", palette: "色卡" } as const)[kind];
}

function KeywordLibrary({ keywords, onDelete }: { keywords: KeywordCard[]; onDelete: (id: string) => void }) {
  return <div className="lf-keyword-list">{keywords.length ? keywords.map((card) => <div key={card.id}><span>{AXIS_LABELS[card.axis]}</span><strong>{card.text}</strong><button onClick={() => onDelete(card.id)} aria-label={`删除 ${card.text}`}><Trash2 size={14} /></button></div>) : <p>暂无关键词</p>}</div>;
}

function PromptLibrary({ snapshot, onDelete, onUse }: { snapshot: StudioSnapshot; onDelete: (id: string) => void; onUse: (text: string) => void }) {
  return <div className="lf-prompt-library">
    <div className="lf-library-subheading"><strong>提示词册</strong><span>{snapshot.prompts.length}</span></div>
    {snapshot.prompts.length ? snapshot.prompts.slice(0, 20).map((prompt) => <div className="lf-saved-prompt" key={prompt.id}><span>{prompt.language.toUpperCase()}{prompt.variantKind ? ` · ${prompt.variantKind}` : ""}</span><p>{prompt.text}</p><button onClick={() => onUse(prompt.text)}>使用</button></div>) : <p className="lf-muted-copy">暂无已收藏提示词</p>}
    <div className="lf-library-subheading"><strong>五轴关键词</strong><span>{snapshot.keywords.length}</span></div>
    <KeywordLibrary keywords={snapshot.keywords} onDelete={onDelete} />
  </div>;
}

function StorageMeter({ snapshot }: { snapshot: StudioSnapshot }) {
  const storage = snapshot.storage;
  const percent = storage?.quota ? Math.min(100, storage.usage / storage.quota * 100) : 0;
  return <div className="lf-storage"><div><Archive size={16} /><strong>本地存储</strong><small>{storage ? `${formatBytes(storage.usage)} / ${formatBytes(storage.quota)}` : "正在估算"}</small></div><span><i style={{ width: `${percent}%` }} /></span></div>;
}

function formatBytes(bytes: number) { return bytes >= 1024 ** 3 ? `${(bytes / 1024 ** 3).toFixed(1)} GB` : `${(bytes / 1024 ** 2).toFixed(1)} MB`; }

function connectionLabel(state: StudioSnapshot["connectionState"]): string {
  return ({
    checking: "正在检测插件",
    connected: "本机插件在线",
    missing: "未检测到插件",
    incompatible: "插件需要更新",
    error: "连接异常"
  } as const)[state];
}

function Preflight({ snapshot, settings, setSettings, prompt, onConfigure, onBack, onSubmit, submitting }: { snapshot: StudioSnapshot; settings: GenerationSettings; setSettings: React.Dispatch<React.SetStateAction<GenerationSettings>>; prompt: string; onConfigure: (trigger: HTMLButtonElement) => void; onBack: () => void; onSubmit: () => void; submitting: boolean }) {
  const caps = snapshot.capabilities;
  const references = normalizeReferences(snapshot.references);
  const referencesBlocked = references.length > 0 && caps.imageEditing !== "supported";
  const blocked = snapshot.readOnly || !snapshot.provider || !settings.model || caps.imageGeneration === "unsupported" || referencesBlocked;
  return <section className="lf-stage">
    <div className="lf-section-heading"><div><span className="lf-kicker">提交预检</span><h1>确认发送内容和能力边界</h1></div></div>
    <div className="lf-preflight-grid">
      <div className="lf-preflight-main">
        <span>最终提示词</span><p>{prompt || "请返回组合步骤填写提示词。"}</p>
        <div className="lf-setting-grid">
          <label>模型<select value={settings.model} onChange={(event) => setSettings((current) => ({ ...current, model: event.target.value }))}><option value="">选择模型</option>{snapshot.provider?.imageModel && <option value={snapshot.provider.imageModel}>{snapshot.provider.imageModel}</option>}</select></label>
          <label>画幅<select value={settings.size} onChange={(event) => setSettings((current) => ({ ...current, size: event.target.value }))}><option>1024x1024</option><option>1536x1024</option><option>1024x1536</option></select></label>
          <label>清晰度<select value={settings.quality} onChange={(event) => setSettings((current) => ({ ...current, quality: event.target.value as GenerationSettings["quality"] }))}><option value="low">低</option><option value="medium">中</option><option value="high">高</option><option value="auto">自动</option></select></label>
          <label>张数<input type="number" min={1} max={10} value={settings.count} onChange={(event) => setSettings((current) => ({ ...current, count: Math.max(1, Math.min(10, Number(event.target.value))) }))} /></label>
          <label>并发<input type="number" min={1} max={4} value={settings.concurrency} onChange={(event) => setSettings((current) => ({ ...current, concurrency: Math.max(1, Math.min(4, Number(event.target.value))) }))} /></label>
        </div>
        <div className="lf-preflight-references"><strong>参考关系</strong>{references.length ? references.map((reference, index) => <div key={reference.id}><span>{index + 1}. {referenceLabel(reference.kind)}</span><b>{reference.name}</b><small>{reference.kind === "face" ? "只约束身份" : reference.kind === "pose" ? "只约束动作/位置/透视/受力" : reference.kind === "palette" ? "整批色彩" : "主体视觉"}</small></div>) : <p>本批次不发送参考图片。</p>}</div>
      </div>
      <div className="lf-capabilities"><strong>能力状态</strong>{Object.entries({ "鉴权": caps.authentication, "图像输入": caps.visionInput, "结构化输出": caps.structuredOutputs, "图片生成": caps.imageGeneration, "图片编辑": caps.imageEditing, "后台任务": caps.backgroundTasks }).map(([label, state]) => <div key={label}><span>{label}</span><em className={`state-${state}`}>{state}</em></div>)}<button onClick={(event) => onConfigure(event.currentTarget)}>打开 Provider 设置</button></div>
    </div>
    {referencesBlocked && <div className="lf-request-summary is-blocked"><AlertTriangle size={15} /><span>参考图片需要已验证的图片编辑能力；当前提交已阻断。</span></div>}
    <div className="lf-request-summary"><Lock size={15} /><span>将产生最多 {settings.count} 次{references.length ? "编辑" : "生成"}请求；超时、429、5xx 或 Schema 失败均不会自动重新付费请求。</span></div>
    <div className="lf-stage-footer"><button className="lf-button" onClick={onBack}>返回修改</button><button className="lf-button is-primary" disabled={blocked || !prompt || submitting} onClick={onSubmit}><Sparkles size={16} />{submitting ? "正在提交" : `生成 ${settings.count} 张`}</button></div>
  </section>;
}

function InspectorProvider({ snapshot, onConfigure }: { snapshot: StudioSnapshot; onConfigure: (trigger: HTMLButtonElement) => void }) {
  return <div className="lf-inspector-content"><div className="lf-inspector-status"><span className={snapshot.provider ? "is-ok" : ""}><CircleDot size={18} /></span><div><strong>{snapshot.provider ? snapshot.provider.name : "尚未配置 Provider"}</strong><small>{snapshot.provider?.baseUrl || "密钥由插件隔离保存"}</small></div></div><dl><div><dt>协议版本</dt><dd>v{snapshot.protocolVersion}</dd></div><div><dt>分析模型</dt><dd>{snapshot.provider?.analysisModel || "未选择"}</dd></div><div><dt>图片模型</dt><dd>{snapshot.provider?.imageModel || "未选择"}</dd></div><div><dt>写入状态</dt><dd>{snapshot.readOnly ? "只读" : "可写"}</dd></div></dl><button className="lf-button is-primary" onClick={(event) => onConfigure(event.currentTarget)}><Settings size={16} />配置 Provider</button></div>;
}

function InspectorTasks({ batches }: { batches: GenerationBatch[] }) { return <div className="lf-inspector-content"><div className="lf-panel-heading"><strong>最近任务</strong><small>{batches.length} 个批次</small></div><div className="lf-event-list">{batches.length ? batches.slice(0, 8).map((batch) => { const progress = Math.round(batch.children.reduce((total, child) => total + (child.state === "ready" ? 1 : child.progress ?? 0), 0) / Math.max(1, batch.children.length) * 100); return <div key={batch.id}><span className={`state-${batch.state}`} /><div><strong>{batch.state}</strong><small>{batch.children.filter((child) => child.state === "ready").length}/{batch.children.length} 已完成 · {progress}%</small><span className="lf-task-progress"><i style={{ width: `${progress}%` }} /></span></div></div>; }) : <p>暂无生成任务</p>}</div></div>; }
function InspectorWorks({ snapshot }: { snapshot: StudioSnapshot }) { const count = snapshot.assets.filter((asset) => asset.kind === "work").length; return <div className="lf-inspector-content"><div className="lf-metric"><FolderHeart size={20} /><strong>{count}</strong><span>已收入作品</span></div><p className="lf-inspector-note">生成结果先进入历史，只有主动保存后才会成为作品资产。</p></div>; }
function InspectorSync({ snapshot }: { snapshot: StudioSnapshot }) { return <div className="lf-inspector-content"><div className="lf-inspector-status"><span className={snapshot.connected ? "is-ok" : ""}>{snapshot.connected ? <Check size={18} /> : <CloudOff size={18} />}</span><div><strong>{snapshot.connected ? "网页与插件已连接" : "未连接本机插件"}</strong><small>数据只在本机处理与传输</small></div></div><dl><div><dt>协议</dt><dd>v{snapshot.protocolVersion}</dd></div><div><dt>云端同步</dt><dd>未启用</dd></div><div><dt>密钥桥接</dt><dd>禁止</dd></div></dl></div>; }
