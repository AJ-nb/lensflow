import { useEffect, useState } from "react";
import { History, RotateCcw, Save, Trash2 } from "lucide-react";
import type { PromptVersionRecord } from "../../shared/types";
import type { FeedbackHandler } from "./InteractionFeedback";

export function PromptVersionManager({ sha256, positivePrompt, negativePrompt, reconstructionDirective, onRestore, onFeedback }: {
  sha256: string;
  positivePrompt: string;
  negativePrompt: string;
  reconstructionDirective: string;
  onRestore: (version: PromptVersionRecord) => void;
  onFeedback: FeedbackHandler;
}) {
  const [versions, setVersions] = useState<PromptVersionRecord[]>([]);
  const [label, setLabel] = useState("");

  useEffect(() => { void load(); }, [sha256]);

  async function load() {
    const { listPromptVersions } = await import("../../lib/archive");
    setVersions(await listPromptVersions(sha256));
  }

  async function save() {
    try {
      const { savePromptVersion } = await import("../../lib/archive");
      const versionLabel = label.trim() || `版本 ${versions.length + 1}`;
      await savePromptVersion({
        sha256,
        label: versionLabel,
        positivePrompt,
        negativePrompt,
        reconstructionDirective
      });
      setLabel("");
      await load();
      onFeedback("success", "提示词版本已保存", versionLabel);
    } catch (caught) {
      onFeedback("error", "提示词版本保存失败", `${caught instanceof Error ? caught.message : "本地存储不可用。"} 请释放浏览器存储空间后重试。`);
    }
  }

  async function remove(id: string) {
    if (!window.confirm("删除这个提示词版本？此操作无法撤销。")) return;
    try {
      const { deletePromptVersion } = await import("../../lib/archive");
      await deletePromptVersion(id);
      await load();
      onFeedback("success", "提示词版本已删除");
    } catch (caught) {
      onFeedback("error", "提示词版本删除失败", `${caught instanceof Error ? caught.message : "本地存储不可用。"} 请重试。`);
    }
  }

  return <div className="prompt-versions">
    <div className="prompt-version-save"><History size={15} /><input name="prompt-version-label" autoComplete="off" aria-label="提示词版本名称" value={label} onChange={(event) => setLabel(event.target.value)} placeholder="版本名称，例如：降低金属反光…" /><button className="icon-button" title="保存提示词版本" aria-label="保存提示词版本" disabled={!positivePrompt.trim() && !negativePrompt.trim()} onClick={() => void save()}><Save size={15} /></button></div>
    {versions.length > 0 && <div className="prompt-version-list">{versions.map((version) => <article key={version.id}>
      <div><small>{formatTime(version.createdAt)}</small><strong>{version.label}</strong><p>{version.positivePrompt || "无正向提示词"}</p></div>
      <button title="恢复此版本" aria-label={`恢复提示词版本：${version.label}`} onClick={() => onRestore(version)}><RotateCcw size={14} /></button>
      <button title="删除此版本" aria-label={`删除提示词版本：${version.label}`} onClick={() => void remove(version.id)}><Trash2 size={14} /></button>
    </article>)}</div>}
  </div>;
}

function formatTime(value: string): string {
  return new Intl.DateTimeFormat("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }).format(new Date(value));
}
