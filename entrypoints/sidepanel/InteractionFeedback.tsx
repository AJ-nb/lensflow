import { AlertTriangle, CheckCircle2, CircleX, Info, X } from "lucide-react";

export type FeedbackTone = "success" | "info" | "warning" | "error";

export interface FeedbackNotice {
  id: number;
  tone: FeedbackTone;
  message: string;
  detail?: string;
}

export type FeedbackHandler = (tone: FeedbackTone, message: string, detail?: string) => void;

export function InteractionFeedback({ notice, onDismiss }: {
  notice: FeedbackNotice | null;
  onDismiss: () => void;
}) {
  if (!notice) return null;
  const Icon = notice.tone === "success"
    ? CheckCircle2
    : notice.tone === "warning"
      ? AlertTriangle
      : notice.tone === "error"
        ? CircleX
        : Info;
  return <aside className={`interaction-feedback ${notice.tone}`} role={notice.tone === "error" ? "alert" : "status"} aria-live={notice.tone === "error" ? "assertive" : "polite"}>
    <Icon size={18} />
    <span><strong>{notice.message}</strong>{notice.detail && <small>{notice.detail}</small>}</span>
    <button title="关闭反馈" aria-label="关闭反馈" onClick={onDismiss}><X size={15} /></button>
  </aside>;
}
