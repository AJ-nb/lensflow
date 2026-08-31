import { useEffect, useMemo, useRef, useState } from "react";
import { AlertCircle, Check, CheckSquare, Download, FolderHeart, Image as ImageIcon, RotateCcw, Send, Square } from "lucide-react";
import type { GenerationBatch, GenerationChild } from "@lensflow/contracts";
import { getFanLayout, nextFanIndex } from "@lensflow/core";

export interface FanGalleryProps {
  batch: GenerationBatch;
  reducedMotion: boolean;
  readOnly?: boolean;
  onRetryFailed: () => Promise<void> | void;
  onSave: (child: GenerationChild) => Promise<void> | void;
  onDownload: (child?: GenerationChild) => Promise<void> | void;
  onDownloadMany?: (children: GenerationChild[]) => Promise<void> | void;
  onEagle?: (child: GenerationChild) => Promise<string>;
  onEagleMany?: (children: GenerationChild[]) => Promise<string>;
  onCancel: () => Promise<void> | void;
  canCancel: boolean;
  logoUrl?: string;
  onReveal?: () => void;
}

export function FanGallery({ batch, reducedMotion, readOnly = false, onRetryFailed, onSave, onDownload, onDownloadMany, onEagle, onEagleMany, onCancel, canCancel, logoUrl, onReveal }: FanGalleryProps) {
  const [focused, setFocused] = useState(0);
  const [revealed, setRevealed] = useState<Set<string>>(() => new Set());
  const [busyAction, setBusyAction] = useState("");
  const [notice, setNotice] = useState("");
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [containerWidth, setContainerWidth] = useState(960);
  const rootRef = useRef<HTMLDivElement>(null);
  const revealTimers = useRef<number[]>([]);
  const layouts = useMemo(() => getFanLayout(batch.children.length, focused, containerWidth), [batch.children.length, containerWidth, focused]);
  const readyCount = batch.children.filter((child) => child.state === "ready").length;
  const failedCount = batch.children.filter((child) => child.state === "failed").length;
  const activeCount = batch.children.filter((child) => child.state === "queued" || child.state === "generating" || child.state === "retrying").length;
  const focusedChild = batch.children[focused];
  const selectedReady = batch.children.filter((child) => selected.has(child.id) && child.state === "ready");

  useEffect(() => {
    if (reducedMotion) {
      setRevealed(new Set(batch.children.filter((child) => child.state === "ready").map((child) => child.id)));
    }
  }, [batch.children, reducedMotion]);

  useEffect(() => {
    const element = rootRef.current;
    if (!element) return;
    const update = () => setContainerWidth(Math.max(280, element.getBoundingClientRect().width));
    update();
    const observer = new ResizeObserver(update);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  useEffect(() => () => {
    revealTimers.current.forEach((timer) => window.clearTimeout(timer));
  }, []);

  const reveal = (child: GenerationChild) => {
    if (child.state !== "ready") return;
    setRevealed((current) => new Set(current).add(child.id));
    onReveal?.();
  };

  const revealAll = () => {
    const ready = batch.children.filter((child) => child.state === "ready");
    revealTimers.current.forEach((timer) => window.clearTimeout(timer));
    revealTimers.current = [];
    if (reducedMotion) {
      setRevealed(new Set(ready.map((child) => child.id)));
      if (ready.length) onReveal?.();
      return;
    }
    ready.forEach((child, index) => {
      revealTimers.current.push(window.setTimeout(() => setRevealed((current) => new Set(current).add(child.id)), index * 110));
    });
    if (ready.length) onReveal?.();
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
      event.preventDefault();
      setFocused((current) => nextFanIndex(current, batch.children.length, event.key === "ArrowLeft" ? -1 : 1));
    }
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      const child = batch.children[focused];
      if (child) reveal(child);
    }
  };

  const runAction = async (name: string, action: () => Promise<void | string> | void | string, success: string) => {
    setBusyAction(name);
    setNotice("");
    try {
      const message = await action();
      setNotice(typeof message === "string" ? message : success);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "操作失败，请重试。");
    } finally {
      setBusyAction("");
    }
  };

  return (
    <section className="lf-results" aria-labelledby="lf-results-title">
      <div className="lf-section-heading lf-results-heading">
        <div>
          <span className="lf-kicker">当前批次</span>
          <h2 id="lf-results-title">结果 {readyCount}/{batch.children.length}</h2>
        </div>
        <div className="lf-result-counts" aria-label="批次统计">
          <span className="is-ready"><Check size={14} />{readyCount} 成功</span>
          {failedCount > 0 && <span className="is-failed"><AlertCircle size={14} />{failedCount} 失败</span>}
        </div>
      </div>

      <div
        ref={rootRef}
        className={`lf-fan ${reducedMotion ? "is-reduced" : ""}`}
        tabIndex={0}
        role="listbox"
        aria-label="生成结果卡池，使用左右方向键选择，按 Enter 或空格揭示"
        aria-activedescendant={focusedChild ? `lf-result-${focusedChild.id}` : undefined}
        onKeyDown={onKeyDown}
        style={{ "--lf-fan-width": `${containerWidth}px` } as React.CSSProperties}
      >
        {batch.children.map((child, index) => {
          const layout = layouts[index];
          const isRevealed = revealed.has(child.id);
          const source = child.dataUrl || child.imageUrl;
          return (
            <button
              key={child.id}
              id={`lf-result-${child.id}`}
              type="button"
              tabIndex={-1}
              role="option"
              aria-selected={focused === index}
              aria-label={`结果 ${index + 1}，${child.state === "ready" ? isRevealed ? "已揭示" : "待揭示" : child.state}`}
              className={`lf-fan-card state-${child.state} ${focused === index ? "is-focused" : ""} ${isRevealed ? "is-revealed" : ""}`}
              style={reducedMotion || !layout ? undefined : {
                "--lf-angle": `${layout.angle}deg`,
                "--lf-x": `${layout.offsetX}px`,
                "--lf-y": `${layout.offsetY}px`,
                zIndex: layout.zIndex,
                "--lf-deal-delay": `${index * 45}ms`
              } as React.CSSProperties}
              onFocus={() => setFocused(index)}
              onClick={() => { setFocused(index); reveal(child); rootRef.current?.focus(); }}
            >
              <span className="lf-card-front">
                {source ? <img src={source} alt="" /> : <span className="lf-card-status"><ImageIcon size={22} /><small>{child.state === "failed" ? "生成失败" : "生成中"}</small></span>}
                <span className="lf-card-index">{String(index + 1).padStart(2, "0")}</span>
              </span>
              <span className="lf-card-back">
                {logoUrl ? <img className="lf-card-brand" src={logoUrl} alt="" /> : <ImageIcon size={26} />}
                <strong>{child.state === "ready" ? "点击揭示" : child.state === "failed" ? "可以补全" : "正在生成"}</strong>
                {(child.state === "generating" || child.state === "retrying") && <span className="lf-card-progress"><i style={{ width: `${Math.round((child.progress ?? 0) * 100)}%` }} /><small>{Math.round((child.progress ?? 0) * 100)}%</small></span>}
                {child.state === "failed" && child.error && <small className="lf-card-error" title={child.error}>{child.error}</small>}
              </span>
            </button>
          );
        })}
      </div>

      {focusedChild?.state === "ready" && revealed.has(focusedChild.id) && <div className={`lf-focused-actions ${readOnly ? "is-readonly" : ""}`} aria-label={`结果 ${focused + 1} 操作`}>
        <strong>结果 {focused + 1}</strong>
        <button className="lf-button" disabled={Boolean(busyAction)} onClick={() => void runAction("download-one", () => onDownload(focusedChild), "当前结果已加入下载队列")}><Download size={15} />下载</button>
        {!readOnly && <button className="lf-button" disabled={Boolean(busyAction)} onClick={() => void runAction("save", () => onSave(focusedChild), "当前结果已收入作品集")}><FolderHeart size={15} />收入作品集</button>}
        {!readOnly && onEagle && <button className="lf-button" disabled={Boolean(busyAction)} onClick={() => void runAction("eagle", () => onEagle(focusedChild), "已导出 Eagle")}><Send size={15} />导出 Eagle</button>}
        {!readOnly && <button className={`lf-button ${selected.has(focusedChild.id) ? "is-selected" : ""}`} disabled={Boolean(busyAction)} aria-pressed={selected.has(focusedChild.id)} onClick={() => setSelected((current) => { const next = new Set(current); if (next.has(focusedChild.id)) next.delete(focusedChild.id); else next.add(focusedChild.id); return next; })}><CheckSquare size={15} />{selected.has(focusedChild.id) ? "已选择" : "多选"}</button>}
      </div>}

      {!readOnly && selectedReady.length > 0 && <div className="lf-batch-selection" role="toolbar" aria-label="批量结果操作"><strong>已选 {selectedReady.length} 张</strong><button className="lf-button" disabled={!onDownloadMany || Boolean(busyAction)} onClick={() => void runAction("download-many", () => onDownloadMany?.(selectedReady), `已提交 ${selectedReady.length} 张下载`)}><Download size={15} />批量下载</button>{onEagleMany && <button className="lf-button" disabled={Boolean(busyAction)} onClick={() => void runAction("eagle-many", () => onEagleMany(selectedReady), "已批量导出 Eagle")}><Send size={15} />批量 Eagle</button>}<button className="lf-button" onClick={() => setSelected(new Set())}>清除选择</button></div>}

      <div className="lf-result-actions">
        <button className="lf-button is-primary" type="button" onClick={revealAll} disabled={readyCount === 0}>
          <ImageIcon size={16} />揭示全部
        </button>
        <button className="lf-button" type="button" disabled={readyCount === 0 || Boolean(busyAction)} onClick={() => void runAction("download-all", () => onDownload(), `已提交 ${readyCount} 张下载`)}>
          <Download size={16} />下载成功项
        </button>
        {!readOnly && failedCount > 0 && (
          <button className="lf-button" type="button" disabled={Boolean(busyAction)} onClick={() => void runAction("retry", onRetryFailed, "失败位置已进入补全队列")}>
            <RotateCcw size={16} />补全失败位置
          </button>
        )}
        {!readOnly && activeCount > 0 && (canCancel
          ? <button className="lf-button" type="button" disabled={Boolean(busyAction)} onClick={() => void runAction("cancel", onCancel, "取消请求已提交")}><Square size={15} />取消任务</button>
          : <button className="lf-button" type="button" disabled title="当前 Provider 未提供取消接口"><Square size={15} />不支持取消</button>)}
      </div>
      {notice && <p className="lf-result-notice" role="status">{notice}</p>}
    </section>
  );
}
