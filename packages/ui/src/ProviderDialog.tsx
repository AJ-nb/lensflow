import { useEffect, useMemo, useRef, useState, type RefObject } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { AlertTriangle, CheckCircle2, Eye, EyeOff, FileJson, FlaskConical, Loader2, RefreshCw, Settings2, X } from "lucide-react";
import {
  DEFAULT_BIYUAN_PROFILE,
  type ModelDescriptor,
  type ProviderCapabilities,
  type ProviderProfile,
  type StudioRuntime
} from "@lensflow/contracts";
import { endpointUrl, normalizeBaseUrl } from "@lensflow/core";

interface ProviderDialogProps {
  runtime: StudioRuntime;
  provider: ProviderProfile | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => Promise<void>;
  returnFocusRef?: RefObject<HTMLButtonElement | null>;
}

export function ProviderDialog({ runtime, provider, open, onOpenChange, onSaved, returnFocusRef }: ProviderDialogProps) {
  const [draft, setDraft] = useState<ProviderProfile>(provider ?? DEFAULT_BIYUAN_PROFILE);
  const [secret, setSecret] = useState("");
  const [showSecret, setShowSecret] = useState(false);
  const [models, setModels] = useState<ModelDescriptor[]>([]);
  const [capabilities, setCapabilities] = useState<ProviderCapabilities | null>(null);
  const [status, setStatus] = useState("");
  const [statusKind, setStatusKind] = useState<"success" | "warning">("success");
  const [busy, setBusy] = useState("");
  const workflowInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    setDraft(provider ?? { ...DEFAULT_BIYUAN_PROFILE, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
    setSecret("");
    setCapabilities(null);
    setStatus("");
  }, [open, provider]);

  const modelEndpoint = useMemo(() => {
    try { return endpointUrl(draft.baseUrl, draft.kind === "comfyui" ? "object_info" : "models"); } catch { return "地址无效"; }
  }, [draft.baseUrl, draft.kind]);
  const analysisModels = models.filter((model) => model.modalities.length === 0 || model.modalities.includes("text"));
  const imageModels = models.filter((model) => model.modalities.length === 0 || model.modalities.includes("image"));

  const patch = (value: Partial<ProviderProfile>) => setDraft((current) => ({ ...current, ...value, updatedAt: new Date().toISOString() }));
  const normalizedDraft = () => ({ ...draft, baseUrl: normalizeBaseUrl(draft.baseUrl), updatedAt: new Date().toISOString() });
  const persistDraft = async () => runtime.saveProvider(normalizedDraft(), secret || undefined);

  const run = async (name: string, action: () => Promise<void>) => {
    setBusy(name);
    setStatus("");
    try { await action(); } catch (error) {
      setStatusKind("warning");
      setStatus(error instanceof Error ? error.message : "操作失败");
    } finally { setBusy(""); }
  };

  const save = () => run("save", async () => {
    await persistDraft();
    await onSaved();
    setStatusKind("success");
    setStatus("非敏感设置已写入 IndexedDB；密钥已由插件独立保存。");
  });

  const discover = () => run("discover", async () => {
    const saved = await persistDraft();
    const result = await runtime.listModels(saved.id, true);
    setModels(result);
    setStatusKind("success");
    setStatus(`已从认证目录读取 ${result.length} 个模型；${result.filter((model) => model.modalities.length === 0).length} 个能力仍未知。`);
  });

  const testConnection = () => run("test", async () => {
    const saved = await persistDraft();
    const result = await runtime.testConnection(saved.id);
    setStatusKind("success");
    setStatus(`连接成功：GET ${modelEndpoint} · ${result.modelCount} 个模型 · ${result.latencyMs} ms。`);
  });

  const probe = async () => {
    const requestCount = 1 + (draft.analysisModel ? 2 : 0) + (draft.imageModel ? 2 : 0);
    const billable = draft.analysisModel || draft.imageModel;
    const confirmed = window.confirm(`能力检测最多发送 ${requestCount} 次请求。${billable ? "其中分析、生成和编辑请求可能计费；每项只发送一次且失败不重试。" : "当前只检测鉴权。"}是否继续？`);
    if (!confirmed) return;
    await run("probe", async () => {
      const saved = await persistDraft();
      const result = await runtime.probeCapabilities(saved.id);
      setCapabilities(result);
      setStatusKind("success");
      setStatus("能力检测已完成。状态来自本次请求结果与公开协议，不按模型名称推断。");
      await onSaved();
    });
  };

  const importWorkflow = async (file: File) => {
    if (file.size > 5 * 1024 * 1024) {
      setStatusKind("warning");
      setStatus("ComfyUI API-workflow JSON 不能超过 5 MB。");
      return;
    }
    try {
      const value: unknown = JSON.parse(await file.text());
      if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("工作流必须是 JSON 对象。");
      patch({ comfyWorkflow: value as Record<string, unknown> });
      setStatusKind("success");
      setStatus(`已载入 ${Object.keys(value as object).length} 个工作流节点；保存设置后生效。`);
    } catch (error) {
      setStatusKind("warning");
      setStatus(error instanceof Error ? error.message : "工作流 JSON 无效。");
    }
  };

  return <Dialog.Root open={open} onOpenChange={onOpenChange}>
    <Dialog.Portal>
      <Dialog.Overlay className="lf-dialog-overlay" />
      <Dialog.Content
        className="lf-dialog-content"
        aria-describedby="provider-description"
        onCloseAutoFocus={(event) => {
          if (!returnFocusRef?.current) return;
          event.preventDefault();
          returnFocusRef.current.focus();
        }}
      >
        <div className="lf-dialog-titlebar"><div><span className="lf-kicker">本地 Provider</span><Dialog.Title>连接生成服务</Dialog.Title></div><Dialog.Close className="lf-icon-button" aria-label="关闭"><X size={18} /></Dialog.Close></div>
        <Dialog.Description id="provider-description">密钥只交给插件后台；网页、日志、IndexedDB、诊断包和备份都无法读取。</Dialog.Description>

        <div className="lf-provider-presets" role="group" aria-label="Provider 预设">
          <button type="button" className={draft.kind === "biyuan" ? "is-active" : ""} onClick={() => setDraft({ ...DEFAULT_BIYUAN_PROFILE, createdAt: draft.createdAt, updatedAt: new Date().toISOString() })}>彼源</button>
          <button type="button" className={draft.kind === "openai-compatible" ? "is-active" : ""} onClick={() => patch({ kind: "openai-compatible", name: "兼容接口", protocolMode: "responses", comfyWorkflow: undefined })}>OpenAI-compatible</button>
          <button type="button" className={draft.kind === "comfyui" ? "is-active" : ""} onClick={() => patch({ kind: "comfyui", name: "ComfyUI", baseUrl: "http://127.0.0.1:8188", protocolMode: "comfyui" })}>ComfyUI</button>
        </div>

        <div className="lf-model-grid">
          <label className="lf-field"><span>名称</span><input value={draft.name} onChange={(event) => patch({ name: event.target.value })} /></label>
          {draft.kind !== "comfyui" && <label className="lf-field"><span>协议模式</span><select value={draft.protocolMode} onChange={(event) => patch({ protocolMode: event.target.value as ProviderProfile["protocolMode"] })}><option value="responses">Responses</option><option value="chat-completions">Chat Completions</option><option value="images">Images only</option></select></label>}
        </div>
        <label className="lf-field"><span>API Base URL</span><input value={draft.baseUrl} onChange={(event) => patch({ baseUrl: event.target.value })} spellCheck={false} /></label>
        <div className="lf-endpoint-preview"><Settings2 size={14} /><span>最终请求</span><code>{modelEndpoint}</code></div>

        {draft.kind !== "comfyui" ? <>
          <label className="lf-field"><span>API Key</span><div className="lf-secret-input"><input type={showSecret ? "text" : "password"} value={secret} onChange={(event) => setSecret(event.target.value)} autoComplete="off" /><button type="button" onClick={() => setShowSecret((value) => !value)} aria-label={showSecret ? "隐藏密钥" : "显示密钥"}>{showSecret ? <EyeOff size={16} /> : <Eye size={16} />}</button></div></label>
          <label className="lf-check"><input type="checkbox" checked={draft.rememberSecret} onChange={(event) => patch({ rememberSecret: event.target.checked })} /><span>在此设备记住密钥；否则关闭浏览器后清除</span></label>
        </> : <div className="lf-workflow-import"><FileJson size={19} /><div><strong>API-workflow JSON</strong><small>{draft.comfyWorkflow ? `${Object.keys(draft.comfyWorkflow).length} 个节点已载入` : "在 ComfyUI 中以 API 格式导出，并用 {{LENSFLOW_PROMPT}} 标记提示词输入。"}</small></div><button className="lf-button" onClick={() => workflowInputRef.current?.click()}>导入</button><input ref={workflowInputRef} type="file" accept="application/json,.json" hidden onChange={(event) => { const file = event.target.files?.[0]; if (file) void importWorkflow(file); event.currentTarget.value = ""; }} /></div>}

        <div className="lf-model-grid">
          <ModelSelect label="分析模型" value={draft.analysisModel} models={analysisModels} onChange={(analysisModel) => patch({ analysisModel })} />
          <ModelSelect label="图片模型" value={draft.imageModel} models={imageModels} onChange={(imageModel) => patch({ imageModel })} />
        </div>
        {capabilities && <div className="lf-probe-results">{Object.entries(capabilities).map(([name, value]) => <div key={name}><span>{capabilityLabel(name)}</span><em className={`state-${value}`}>{value}</em></div>)}</div>}
        {status && <p className={`lf-inline-status is-${statusKind}`}>{statusKind === "success" ? <CheckCircle2 size={15} /> : <AlertTriangle size={15} />}{status}</p>}
        <div className="lf-dialog-actions">
          <button className="lf-button" type="button" onClick={testConnection} disabled={Boolean(busy) || !draft.baseUrl.trim()}>{busy === "test" ? <Loader2 className="is-spinning" size={16} /> : <CheckCircle2 size={16} />}测试连接</button>
          <button className="lf-button" type="button" onClick={discover} disabled={Boolean(busy) || !draft.baseUrl.trim()}>{busy === "discover" ? <Loader2 className="is-spinning" size={16} /> : <RefreshCw size={16} />}发现模型</button>
          <button className="lf-button" type="button" onClick={() => void probe()} disabled={Boolean(busy)}>{busy === "probe" ? <Loader2 className="is-spinning" size={16} /> : <FlaskConical size={16} />}检测能力</button>
          <button className="lf-button is-primary" type="button" onClick={save} disabled={Boolean(busy)}>{busy === "save" ? "正在保存" : "保存设置"}</button>
        </div>
      </Dialog.Content>
    </Dialog.Portal>
  </Dialog.Root>;
}

function ModelSelect({ label, value, models, onChange }: { label: string; value: string; models: ModelDescriptor[]; onChange: (value: string) => void }) {
  const options = [...new Map([{ id: value, modalities: [] as ModelDescriptor["modalities"] }, ...models].filter((model) => model.id).map((model) => [model.id, model])).values()];
  return <label className="lf-field"><span>{label}</span>{models.length ? <select value={value} onChange={(event) => onChange(event.target.value)}><option value="">请选择</option>{options.map((model) => <option key={model.id} value={model.id}>{model.id}{model.modalities.length ? ` · ${model.modalities.join("/")}` : " · 能力未知"}</option>)}</select> : <input value={value} onChange={(event) => onChange(event.target.value)} placeholder="发现模型后选择，或手动输入" />}</label>;
}

function capabilityLabel(name: string) {
  return ({ authentication: "鉴权", visionInput: "图像输入", structuredOutputs: "结构化输出", imageGeneration: "图片生成", imageEditing: "图片编辑", backgroundTasks: "后台任务", cancellation: "取消任务" } as Record<string, string>)[name] ?? name;
}
