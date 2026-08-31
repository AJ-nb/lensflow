import { useState, type ReactNode } from "react";
import {
  AlertTriangle,
  Check,
  ChevronDown,
  FileJson,
  LoaderCircle,
  Palette,
  Plus,
  RefreshCw,
  ScanSearch,
  Shuffle,
  X
} from "lucide-react";
import { VISUAL_THEMES, type ThemeId, type ThemeMode } from "../../shared/themes";
import type { ReferenceImage, ReferenceViewKind } from "../../shared/types";

type AnalysisTaskPhase = "prepare" | "overview" | "design" | "structure" | "cmf" | "archive";
type AnalysisTaskPhaseStatus = "pending" | "active" | "complete" | "failed" | "cancelled";

interface AnalysisTaskProgressState {
  action: "overview" | "analyze";
  status: "running" | "complete" | "failed" | "cancelled";
  phases: Record<AnalysisTaskPhase, AnalysisTaskPhaseStatus>;
  elapsedMs: number;
  error?: string;
}

export function IconTab({ active, title, label, onClick, children }: { active: boolean; title: string; label: string; onClick: () => void; children: ReactNode }) {
  return <button className={active ? "active" : ""} title={title} aria-label={title} aria-current={active ? "page" : undefined} onClick={onClick}>{children}<span>{label}</span></button>;
}

export function ThemeMenu({ activeThemeId, mode, onSelect, onRandom }: {
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

export function AnalysisTaskProgress({ task, onCancel, onRetry, onDismiss }: {
  task: AnalysisTaskProgressState;
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

export function ReferenceTray({ references, selectedViewKind, onViewKindChange, onAdd, onRemove }: {
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

export function AnalysisActions({ hasSource, hasOverview, hasResult, autoAnalyze, busy, selected, onSelect, onGenerate }: {
  hasSource: boolean;
  hasOverview: boolean;
  hasResult: boolean;
  autoAnalyze: boolean;
  busy: string | null;
  selected: "overview" | "full" | null;
  onSelect: (choice: "overview" | "full") => void;
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

export function CollapsibleSection({ title, summary, count, badge, defaultOpen = false, className = "", children }: {
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

export function referenceViewLabel(viewKind: ReferenceViewKind): string {
  const labels: Record<ReferenceViewKind, string> = {
    primary: "主视图",
    front: "正面",
    left: "左侧",
    right: "右侧",
    top: "俯视",
    back: "背面",
    detail: "细节",
    "orthographic-sheet": "正交视图表",
    unknown: "未分类"
  };
  return labels[viewKind];
}

function formatElapsed(value: number): string {
  const seconds = Math.max(0, Math.round(value / 1000));
  if (seconds < 60) return `${seconds}s`;
  return `${Math.floor(seconds / 60)}m ${String(seconds % 60).padStart(2, "0")}s`;
}
