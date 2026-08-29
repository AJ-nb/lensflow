import { useEffect, useMemo, useState, type MouseEvent as ReactMouseEvent } from "react";
import {
  AlertTriangle,
  Check,
  Crop,
  Download,
  FileCode2,
  Image as ImageIcon,
  Layers3,
  LoaderCircle,
  MousePointer2,
  ScanSearch,
  ScanText,
  WandSparkles
} from "lucide-react";
import { recognizeLocalText, type OcrProgress } from "../../lib/ocr";
import { segmentSelectedSubject } from "../../lib/segmentation";
import { countSvgLayers, createLayeredSvg } from "../../lib/svg";
import type {
  AnalysisResult,
  MaterialRegion,
  NormalizedRect,
  OcrResult,
  SubjectSegmentation
} from "../../shared/types";
import { DesignWorkbench } from "./DesignWorkbench";
import type { FeedbackHandler } from "./InteractionFeedback";

export type WorkbenchTool = "regions" | "ocr" | "segment" | "svg" | "edit";

interface DesignToolboxProps {
  activeTool: WorkbenchTool;
  onToolChange: (tool: WorkbenchTool) => void;
  imageUrl: string;
  result: AnalysisResult | null;
  regions: MaterialRegion[];
  ocrResult?: OcrResult;
  segmentation?: SubjectSegmentation;
  disabled: boolean;
  canRestoreOriginal: boolean;
  busyAction: string | null;
  editPrompt: string;
  editedDataUrl: string;
  threeViewDataUrl: string;
  editPreview: "source" | "edited" | "three-view";
  imageModel: string;
  onChooseImage: () => void;
  onResolveImage: () => Promise<string>;
  onApplyCrop: (rect: NormalizedRect, aspect?: number) => void;
  onRestoreOriginal: () => void;
  onSaveRegions: (regions: MaterialRegion[]) => void;
  onSaveOcr: (result: OcrResult) => void;
  onSaveSegmentation: (result: SubjectSegmentation) => void;
  onEditPromptChange: (value: string) => void;
  onEditPreviewChange: (value: "source" | "edited" | "three-view") => void;
  onRequestFullAnalysis: () => void;
  onGenerateThreeView: () => void;
  onEditImage: () => void;
  onFeedback: FeedbackHandler;
}

const TOOLS: Array<{ id: WorkbenchTool; label: string; icon: typeof Crop }> = [
  { id: "regions", label: "裁切与材料", icon: Layers3 },
  { id: "ocr", label: "OCR", icon: ScanText },
  { id: "segment", label: "主体分区", icon: MousePointer2 },
  { id: "svg", label: "SVG", icon: FileCode2 },
  { id: "edit", label: "AI 编辑", icon: WandSparkles }
];

export function DesignToolbox(props: DesignToolboxProps) {
  const usesApi = props.activeTool === "edit";
  return <section className="design-toolbox">
    <header className="toolbox-heading">
      <div>
        <span>设计工作台</span>
        <h2>从图片证据到可编辑资产</h2>
        <p>{usesApi ? "在同一证据图上生成视图或定向修改。" : "本地处理优先，结果保留在当前设计档案。"}</p>
      </div>
      <span className={`local-badge ${usesApi ? "api" : ""}`}>{usesApi ? "AI 云端" : "本地处理"}</span>
    </header>
    <nav className="tool-rail" aria-label="设计工具">
      {TOOLS.map(({ id, label, icon: Icon }) => <button
        key={id}
        className={props.activeTool === id ? "active" : ""}
        aria-current={props.activeTool === id ? "page" : undefined}
        onClick={() => props.onToolChange(id)}
      ><Icon size={16} /><span>{label}</span></button>)}
    </nav>

    {props.activeTool === "regions" && <DesignWorkbench
      imageUrl={props.imageUrl}
      regions={props.regions}
      disabled={props.disabled}
      canRestoreOriginal={props.canRestoreOriginal}
      onChooseImage={props.onChooseImage}
      onApplyCrop={props.onApplyCrop}
      onRestoreOriginal={props.onRestoreOriginal}
      onSaveRegions={props.onSaveRegions}
    />}
    {props.activeTool === "ocr" && <OcrTool
      imageUrl={props.imageUrl}
      result={props.ocrResult}
      disabled={props.disabled}
      onChooseImage={props.onChooseImage}
      onResolveImage={props.onResolveImage}
      onSave={props.onSaveOcr}
    />}
    {props.activeTool === "segment" && <SegmentationTool
      imageUrl={props.imageUrl}
      result={props.segmentation}
      disabled={props.disabled}
      onChooseImage={props.onChooseImage}
      onResolveImage={props.onResolveImage}
      onSave={props.onSaveSegmentation}
    />}
    {props.activeTool === "svg" && <SvgTool
      imageUrl={props.imageUrl}
      result={props.result}
      regions={props.regions}
      ocrResult={props.ocrResult}
      segmentation={props.segmentation}
      onChooseImage={props.onChooseImage}
      onResolveImage={props.onResolveImage}
      onFeedback={props.onFeedback}
    />}
    {props.activeTool === "edit" && <AiEditTool {...props} />}
  </section>;
}

function OcrTool({ imageUrl, result, disabled, onChooseImage, onResolveImage, onSave }: {
  imageUrl: string;
  result?: OcrResult;
  disabled: boolean;
  onChooseImage: () => void;
  onResolveImage: () => Promise<string>;
  onSave: (result: OcrResult) => void;
}) {
  const [progress, setProgress] = useState<OcrProgress | null>(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState("");

  async function runOcr() {
    setRunning(true);
    setError("");
    setProgress({ status: "准备本地 OCR", progress: 0 });
    try {
      const output = await recognizeLocalText(await onResolveImage(), setProgress);
      onSave(output);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "本地 OCR 失败，请换一张清晰图片后重试。");
    } finally {
      setRunning(false);
      setProgress(null);
    }
  }

  if (!imageUrl) return <ChooseImageEmpty onChooseImage={onChooseImage} />;
  return <section className="local-tool">
    <ToolHeading icon={<ScanText size={19} />} title="本地文字识别" subtitle="简体中文 + 英文，不发送图片" badge="本地处理" />
    <div className="ocr-preview"><img src={imageUrl} alt="待识别文字的图片" width={1600} height={1000} /></div>
    <button className="button primary" disabled={disabled || running} onClick={() => void runOcr()}>
      {running ? <LoaderCircle size={17} className="spin" /> : <ScanText size={17} />}
      {result ? "重新识别" : "开始本地 OCR"}
    </button>
    {running && progress && <div className="progress-block" role="status" aria-live="polite">
      <div><span>{progress.status}</span><strong>{Math.round(progress.progress * 100)}%</strong></div>
      <progress value={progress.progress} max={1} />
    </div>}
    {error && <p className="inline-error"><AlertTriangle size={14} />{error}</p>}
    {result && <div className="ocr-output">
      <header><span>{result.lines.length} 行文字</span><strong>平均置信度 {Math.round(result.confidence * 100)}%</strong></header>
      <textarea name="ocr-result" aria-label="OCR 识别结果" value={result.text} readOnly rows={8} />
      <div className="evidence-note">OCR 结果可能受透视、反光和字体影响，文本框坐标为图片相对坐标。</div>
    </div>}
  </section>;
}

function SegmentationTool({ imageUrl, result, disabled, onChooseImage, onResolveImage, onSave }: {
  imageUrl: string;
  result?: SubjectSegmentation;
  disabled: boolean;
  onChooseImage: () => void;
  onResolveImage: () => Promise<string>;
  onSave: (result: SubjectSegmentation) => void;
}) {
  const [threshold, setThreshold] = useState(result?.threshold ?? 0.5);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => setThreshold(result?.threshold ?? 0.5), [result?.processedAt]);

  async function selectSubject(event: ReactMouseEvent<HTMLButtonElement>) {
    if (disabled || running) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    const point = {
      x: Math.max(0, Math.min(1, (event.clientX - bounds.left) / bounds.width)),
      y: Math.max(0, Math.min(1, (event.clientY - bounds.top) / bounds.height))
    };
    setRunning(true);
    setError("");
    try {
      const image = await loadImage(await onResolveImage());
      onSave(await segmentSelectedSubject(image, point, threshold));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "主体分区失败，请重新选择主体位置。");
    } finally {
      setRunning(false);
    }
  }

  if (!imageUrl) return <ChooseImageEmpty onChooseImage={onChooseImage} />;
  return <section className="local-tool">
    <ToolHeading icon={<MousePointer2 size={19} />} title="点选主体分区" subtitle="点击希望保留的主体位置" badge="模型估计" warning />
    <button className="segmentation-stage" disabled={disabled || running} onClick={(event) => void selectSubject(event)} aria-label="点击图片选择需要分区的主体">
      <img src={imageUrl} alt="主体分区图片" width={1600} height={1000} />
      {result && <img className="segmentation-mask" src={result.maskDataUrl} alt="模型估计的主体遮罩" width={1600} height={1000} />}
      {result && <i style={{ left: `${result.point.x * 100}%`, top: `${result.point.y * 100}%` }} />}
      <span>{running ? <><LoaderCircle size={18} className="spin" />正在计算遮罩…</> : <><MousePointer2 size={16} />点击主体</>}</span>
    </button>
    <label className="threshold-control">
      <span>边界阈值 <strong>{threshold.toFixed(2)}</strong></span>
      <input name="segmentation-threshold" aria-label="主体分区边界阈值" type="range" min="0.2" max="0.8" step="0.05" value={threshold} onChange={(event) => setThreshold(Number(event.target.value))} />
    </label>
    {error && <p className="inline-error"><AlertTriangle size={14} />{error}</p>}
    {result && <dl className="segmentation-stats">
      <div><dt>估计覆盖</dt><dd>{Math.round(result.coverage * 100)}%</dd></div>
      <div><dt>遮罩尺寸</dt><dd>{result.maskWidth} × {result.maskHeight}</dd></div>
      <div><dt>证据等级</dt><dd>模型估计</dd></div>
    </dl>}
    <p className="evidence-note">这不是人工确认的真实边界，也不会恢复“去除背景”功能。调整阈值后再次点击主体可更新遮罩。</p>
  </section>;
}

function SvgTool({ imageUrl, result, regions, ocrResult, segmentation, onChooseImage, onResolveImage, onFeedback }: {
  imageUrl: string;
  result: AnalysisResult | null;
  regions: MaterialRegion[];
  ocrResult?: OcrResult;
  segmentation?: SubjectSegmentation;
  onChooseImage: () => void;
  onResolveImage: () => Promise<string>;
  onFeedback: FeedbackHandler;
}) {
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState("");
  const layerSummary = useMemo(() => [
    { label: "原图", ready: Boolean(imageUrl) },
    { label: `主体遮罩 ${segmentation ? 1 : 0}`, ready: Boolean(segmentation) },
    { label: `材料区域 ${regions.length}`, ready: regions.length > 0 },
    { label: `OCR 文本 ${ocrResult?.lines.length ?? 0}`, ready: Boolean(ocrResult?.lines.length) }
  ], [imageUrl, segmentation, regions.length, ocrResult?.lines.length]);

  async function exportSvg() {
    setExporting(true);
    setError("");
    try {
      const dataUrl = await onResolveImage();
      const dimensions = result?.measured ?? await getImageDimensions(dataUrl);
      const svg = createLayeredSvg({
        imageDataUrl: dataUrl,
        width: dimensions.width,
        height: dimensions.height,
        title: result?.analysis.title || "Lensflow 设计资产",
        materialRegions: regions,
        ocrResult,
        subjectSegmentation: segmentation
      });
      downloadSvg(svg, `lensflow-${Date.now()}.svg`);
      onFeedback("success", "分层 SVG 已下载", `${layerSummary.filter((layer) => layer.ready).length} 个有效图层。`);
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "SVG 导出失败，请重新选择图片后重试。";
      setError(message);
      onFeedback("error", "SVG 导出失败", `${message} 请重新选择图片后重试。`);
    } finally {
      setExporting(false);
    }
  }

  if (!imageUrl) return <ChooseImageEmpty onChooseImage={onChooseImage} />;
  return <section className="local-tool">
    <ToolHeading icon={<FileCode2 size={19} />} title="分层 SVG 导出" subtitle="保留可独立编辑的证据图层" badge="本地生成" />
    <div className="svg-sheet">
      <div className="svg-preview"><img src={imageUrl} alt="SVG 导出预览" width={1600} height={1200} />{segmentation && <img src={segmentation.maskDataUrl} alt="" width={1600} height={1200} />}</div>
      <div className="svg-layers">
        {layerSummary.map((layer, index) => <div key={layer.label} className={layer.ready ? "ready" : ""}><span>{String(index + 1).padStart(2, "0")}</span><strong>{layer.label}</strong>{layer.ready && <Check size={14} />}</div>)}
      </div>
    </div>
    <button className="button primary" disabled={exporting} onClick={() => void exportSvg()}>
      {exporting ? <LoaderCircle size={17} className="spin" /> : <Download size={17} />}导出分层 SVG
    </button>
    {error && <p className="inline-error"><AlertTriangle size={14} />{error}</p>}
    <p className="evidence-note">SVG 内嵌原图；材料框、OCR 文本和模型遮罩分别存放在独立 &lt;g&gt; 图层，不会把推断边界冒充矢量轮廓。</p>
  </section>;
}

function AiEditTool(props: DesignToolboxProps) {
  const previewUrl = props.editPreview === "edited" && props.editedDataUrl
    ? props.editedDataUrl
    : props.editPreview === "three-view" && props.threeViewDataUrl
      ? props.threeViewDataUrl
      : props.imageUrl;
  if (!props.imageUrl) return <ChooseImageEmpty onChooseImage={props.onChooseImage} />;
  const generatingViews = props.busyAction === "three-view" || props.busyAction === "analyze";
  const editing = props.busyAction === "edit";
  return <section className="local-tool ai-tool">
    <ToolHeading icon={<WandSparkles size={19} />} title="AI 造型工作区" subtitle={props.imageModel} badge="调用 API" warning />
    <figure className="ai-preview-shell">
      <figcaption className="ai-preview-toolbar">
        <div className="segmented preview-switcher" aria-label="预览版本">
          <button className={props.editPreview === "source" ? "active" : ""} onClick={() => props.onEditPreviewChange("source")}>原图</button>
          {props.editedDataUrl && <button className={props.editPreview === "edited" ? "active" : ""} onClick={() => props.onEditPreviewChange("edited")}>编辑图</button>}
          {props.threeViewDataUrl && <button className={props.editPreview === "three-view" ? "active" : ""} onClick={() => props.onEditPreviewChange("three-view")}>三视图</button>}
        </div>
        <span>{props.editPreview === "source" ? "证据原图" : props.editPreview === "edited" ? "最近编辑" : "正交视图"}</span>
      </figcaption>
      <div className="ai-preview"><img src={previewUrl} alt="AI 造型工作区预览" width={1600} height={900} /></div>
    </figure>
    <div className="ai-task-grid">
      <section className={`ai-task ${generatingViews ? "running" : ""}`}>
        <header><span className="task-index">01</span><div><h3>正交三视图</h3><p>主视图、左视图、俯视图</p></div><ScanSearch size={18} /></header>
        <p className="task-status" role="status" aria-live="polite">{generatingViews ? "正在推断不可见面与视图关系…" : props.result ? "结构 JSON 已就绪" : "需要先生成完整 JSON"}</p>
        <button
          className={`button primary ${generatingViews ? "busy-button" : ""}`}
          disabled={props.disabled && Boolean(props.result)}
          onClick={props.result ? props.onGenerateThreeView : props.onRequestFullAnalysis}
        >
          {generatingViews ? <LoaderCircle size={17} className="spin" /> : <ScanSearch size={17} />}{generatingViews ? "正在生成三视图…" : props.result ? "生成三视图" : "先生成完整 JSON"}
        </button>
        <p className="task-boundary"><AlertTriangle size={14} />不可见面来自结构推断，不是生产图纸。</p>
      </section>
      <section className={`ai-task ${editing ? "running" : ""}`}>
        <header><span className="task-index">02</span><div><h3>定向编辑</h3><p>只修改你明确描述的内容</p></div><WandSparkles size={18} /></header>
        <label className="edit-prompt"><span>编辑要求</span><textarea name="ai-edit-prompt" autoComplete="off" value={props.editPrompt} onChange={(event) => props.onEditPromptChange(event.target.value)} placeholder="例如：保留结构，将主体改为冷灰色金属…" /></label>
        <button className={`button primary ${editing ? "busy-button" : ""}`} disabled={props.disabled || !props.editPrompt.trim()} onClick={props.onEditImage}>
          {editing ? <LoaderCircle size={17} className="spin" /> : <WandSparkles size={17} />}{editing ? "正在编辑…" : "生成编辑图"}
        </button>
      </section>
    </div>
  </section>;
}

function ToolHeading({ icon, title, subtitle, badge, warning = false }: { icon: React.ReactNode; title: string; subtitle: string; badge: string; warning?: boolean }) {
  return <header className="local-tool-heading"><div className="tool-icon">{icon}</div><div><h3>{title}</h3><p>{subtitle}</p></div><span className={warning ? "warning" : ""}>{badge}</span></header>;
}

function ChooseImageEmpty({ onChooseImage }: { onChooseImage: () => void }) {
  return <button className="workbench-empty" onClick={onChooseImage}><ImageIcon size={30} /><strong>选择一张图片开始</strong></button>;
}

function loadImage(source: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("无法读取当前图片，请重新上传本地图片。"));
    image.src = source;
  });
}

async function getImageDimensions(source: string): Promise<{ width: number; height: number }> {
  const image = await loadImage(source);
  return { width: image.naturalWidth, height: image.naturalHeight };
}

function downloadSvg(svg: string, fileName: string) {
  const url = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml;charset=utf-8" }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

export function svgLayerCountForResult(result: AnalysisResult): number {
  return countSvgLayers(createLayeredSvg({
    imageDataUrl: result.previewDataUrl,
    width: result.measured.width,
    height: result.measured.height,
    title: result.analysis.title,
    materialRegions: result.materialRegions ?? [],
    ocrResult: result.ocrResult,
    subjectSegmentation: result.subjectSegmentation
  }));
}
