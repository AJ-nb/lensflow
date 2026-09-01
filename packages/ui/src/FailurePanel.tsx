import { useEffect, useRef, useState } from "react";
import { AlertTriangle, Copy, KeyRound, RotateCw, ServerCrash, Settings, WifiOff } from "lucide-react";
import type { OperationFailure } from "@lensflow/contracts";

export interface FailurePanelProps {
  failure: OperationFailure;
  title?: string;
  onRetry?: () => void;
  onConfigure?: () => void;
  onSaveDraft?: () => void;
  retryLabel?: string;
}

export function FailurePanel({ failure, title, onRetry, onConfigure, onSaveDraft, retryLabel = "重新尝试" }: FailurePanelProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const [copyState, setCopyState] = useState<"idle" | "copied" | "failed">("idle");
  useEffect(() => { panelRef.current?.focus(); }, [failure.summary, failure.status]);

  const copyDiagnostics = async () => {
    const text = JSON.stringify({
      category: failure.category,
      status: failure.status,
      summary: failure.summary,
      requestId: failure.requestId,
      technicalDetails: failure.technicalDetails
    }, null, 2);
    try {
      await navigator.clipboard.writeText(text);
      setCopyState("copied");
    } catch {
      setCopyState("failed");
    }
    window.setTimeout(() => setCopyState("idle"), 1800);
  };

  return <div ref={panelRef} className={`lf-failure-panel state-${failure.category}`} role="alert" tabIndex={-1}>
    <div className="lf-failure-icon" aria-hidden="true">{failureIcon(failure.category)}</div>
    <div className="lf-failure-copy">
      <div className="lf-failure-heading"><strong>{title || failure.summary}</strong>{failure.status && <span>HTTP {failure.status}</span>}</div>
      {title && <p>{failure.summary}</p>}
      <p>{failure.guidance}</p>
      {failure.requestId && <small>请求 ID：<code>{failure.requestId}</code></small>}
      {failure.technicalDetails && <details><summary>技术详情</summary><pre>{failure.technicalDetails}</pre></details>}
    </div>
    <div className="lf-failure-actions">
      {onRetry && <button className="lf-button is-primary" onClick={onRetry}><RotateCw size={15} />{retryLabel}</button>}
      {onConfigure && <button className="lf-button" onClick={onConfigure}><Settings size={15} />检查 Provider</button>}
      {onSaveDraft && <button className="lf-button" onClick={onSaveDraft}><KeyRound size={15} />保存草稿</button>}
      <button className="lf-button" onClick={() => void copyDiagnostics()} aria-live="polite"><Copy size={15} />{copyState === "copied" ? "已复制" : copyState === "failed" ? "复制失败" : "复制诊断"}</button>
    </div>
  </div>;
}

function failureIcon(category: OperationFailure["category"]) {
  if (category === "authentication" || category === "permission") return <KeyRound size={19} />;
  if (category === "network" || category === "timeout") return <WifiOff size={19} />;
  if (category === "upstream" || category === "rate-limit") return <ServerCrash size={19} />;
  return <AlertTriangle size={19} />;
}
