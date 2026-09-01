import { useEffect, useMemo, useRef, useState, type RefObject } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import * as AlertDialog from "@radix-ui/react-alert-dialog";
import { AlertTriangle, CheckCircle2, Eye, EyeOff, FileJson, FlaskConical, KeyRound, Loader2, RefreshCw, Save, Settings2, X } from "lucide-react";
import {
  DEFAULT_BIYUAN_PROFILE,
  type ModelDescriptor,
  type OperationFailure,
  type ProviderCandidateInput,
  type ProviderCapabilities,
  type ProviderCredentialMutation,
  type ProviderCredentialState,
  type ProviderEditorState,
  type ProviderProfile,
  type StudioRuntime
} from "@lensflow/contracts";
import { endpointUrl, normalizeBaseUrl, toOperationFailure } from "@lensflow/core";
import { FailurePanel } from "./FailurePanel";
import { defaultProviderCredential, providerConnectionFingerprint, providerCredentialStateLabel, providerFormFingerprint } from "./provider-editor-state";

export interface ProviderDialogProps {
  runtime: StudioRuntime;
  provider: ProviderProfile | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => Promise<void>;
  returnFocusRef?: RefObject<HTMLButtonElement | null>;
  surface?: "page" | "sidepanel" | "site";
}

type BusyAction = "load" | "test" | "refresh" | "draft" | "probe" | "activate" | "";
type ValidationImpact = "connection" | "capability" | "none";

export function ProviderDialog({ runtime, provider, open, onOpenChange, onSaved, returnFocusRef, surface = "page" }: ProviderDialogProps) {
  const [editor, setEditor] = useState<ProviderEditorState>({ active: provider, draft: null, activeCredentialState: "missing", draftCredentialState: "missing" });
  const [draft, setDraft] = useState<ProviderProfile>(freshProfile(provider));
  const [credential, setCredential] = useState<ProviderCredentialMutation>({ action: "replace", secret: "" });
  const [credentialState, setCredentialState] = useState<ProviderCredentialState>("missing");
  const [showSecret, setShowSecret] = useState(false);
  const [models, setModels] = useState<ModelDescriptor[]>([]);
  const [verifiedFingerprint, setVerifiedFingerprint] = useState("");
  const [capabilities, setCapabilities] = useState<ProviderCapabilities | null>(null);
  const [status, setStatus] = useState("");
  const [failure, setFailure] = useState<OperationFailure | null>(null);
  const [busy, setBusy] = useState<BusyAction>("");
  const [initialFingerprint, setInitialFingerprint] = useState("");
  const [probeConfirmationOpen, setProbeConfirmationOpen] = useState(false);
  const [discardConfirmationOpen, setDiscardConfirmationOpen] = useState(false);
  const workflowInputRef = useRef<HTMLInputElement>(null);

  const loadEditor = async () => {
    setBusy("load");
    setFailure(null);
    try {
      const next = await runtime.loadProviderEditorState();
      const source = freshProfile(next.draft ?? next.active ?? provider);
      const state = next.draft ? next.draftCredentialState : next.activeCredentialState;
      const nextCredential = defaultProviderCredential(source, state);
      setEditor(next);
      setDraft(source);
      setCredentialState(state);
      setCredential(nextCredential);
      setInitialFingerprint(providerFormFingerprint(source, nextCredential));
      setModels([]);
      setCapabilities(null);
      setVerifiedFingerprint("");
      setStatus(next.draft ? "已恢复未激活草稿；当前生效配置没有改变。" : "");
    } catch (reason) {
      setFailure(toOperationFailure(reason));
    } finally {
      setBusy("");
    }
  };

  useEffect(() => {
    if (!open) return;
    void loadEditor();
  }, [open]);

  const modelEndpoint = useMemo(() => {
    try { return endpointUrl(draft.baseUrl, draft.kind === "comfyui" ? "object_info" : "models"); } catch { return "地址无效"; }
  }, [draft.baseUrl, draft.kind]);
  const analysisModels = models.filter((model) => model.modalities.length === 0 || model.modalities.includes("text"));
  const imageModels = models.filter((model) => model.modalities.length === 0 || model.modalities.includes("image"));
  const currentConnectionFingerprint = providerConnectionFingerprint(draft, credential);
  const connected = Boolean(verifiedFingerprint && verifiedFingerprint === currentConnectionFingerprint);
  const dirty = Boolean(initialFingerprint && initialFingerprint !== providerFormFingerprint(draft, credential));
  const baseValid = Boolean(draft.name.trim() && draft.baseUrl.trim() && modelEndpoint !== "地址无效");
  const usableCredential = draft.kind === "comfyui" || (credential.action === "keep" && credentialState !== "missing") || (credential.action === "replace" && credential.secret.trim().length > 0);

  const patch = (value: Partial<ProviderProfile>, impact: ValidationImpact = "connection") => {
    setDraft((current) => ({ ...current, ...value, updatedAt: new Date().toISOString() }));
    setFailure(null);
    setStatus("");
    if (impact === "connection") {
      setVerifiedFingerprint("");
      setModels([]);
      setCapabilities(null);
    } else if (impact === "capability") {
      setCapabilities(null);
    }
  };

  const changeCredential = (next: ProviderCredentialMutation) => {
    setCredential(next);
    setFailure(null);
    setStatus("");
    setVerifiedFingerprint("");
    setModels([]);
    setCapabilities(null);
  };

  const candidate = (): ProviderCandidateInput => ({
    profile: { ...draft, baseUrl: normalizeBaseUrl(draft.baseUrl), updatedAt: new Date().toISOString() },
    credential
  });

  const run = async (name: BusyAction, action: () => Promise<void>): Promise<boolean> => {
    setBusy(name);
    setFailure(null);
    setStatus("");
    try {
      await action();
      return true;
    } catch (reason) {
      setFailure(toOperationFailure(reason, draft.name || "Provider"));
      return false;
    } finally {
      setBusy("");
    }
  };

  const testConnection = (refresh = false) => run(refresh ? "refresh" : "test", async () => {
    const input = candidate();
    const result = await runtime.testProviderCandidate(input);
    setModels(result.models);
    setVerifiedFingerprint(providerConnectionFingerprint(input.profile, input.credential));
    setStatus(`连接成功：GET ${modelEndpoint} · ${result.models.length} 个模型 · ${result.latencyMs} ms${result.warnings.length ? ` · ${result.warnings.join("；")}` : ""}`);
  });

  const saveDraft = async (closeAfter = false) => {
    const ok = await run("draft", async () => {
      const next = await runtime.saveProviderDraft(candidate());
      const source = freshProfile(next.draft ?? draft);
      const state = next.draftCredentialState;
      const nextCredential = defaultProviderCredential(source, state);
      setEditor(next);
      setDraft(source);
      setCredentialState(state);
      setCredential(nextCredential);
      setInitialFingerprint(providerFormFingerprint(source, nextCredential));
      setVerifiedFingerprint("");
      setModels([]);
      setCapabilities(null);
      setStatus("草稿已保存但未启用；当前活动配置和密钥保持不变。");
      await onSaved();
    });
    if (ok && closeAfter) {
      setDiscardConfirmationOpen(false);
      onOpenChange(false);
    }
  };

  const probe = async () => {
    setProbeConfirmationOpen(false);
    await run("probe", async () => {
      const result = await runtime.probeProviderCandidate(candidate());
      setCapabilities(result);
      setStatus("能力检测已完成；结果只属于当前候选配置，启用前不会覆盖活动能力状态。");
    });
  };

  const activate = () => run("activate", async () => {
    const saved = await runtime.activateProviderCandidate(candidate());
    const nextState: ProviderCredentialState = draft.kind === "comfyui" || credential.action === "clear" ? "missing" : draft.rememberSecret ? "device" : "session";
    const nextEditor: ProviderEditorState = { active: saved, draft: null, activeCredentialState: nextState, draftCredentialState: "missing" };
    const nextCredential = defaultProviderCredential(saved, nextState);
    setEditor(nextEditor);
    setDraft(saved);
    setCredentialState(nextState);
    setCredential(nextCredential);
    setInitialFingerprint(providerFormFingerprint(saved, nextCredential));
    setVerifiedFingerprint(providerConnectionFingerprint(saved, nextCredential));
    setStatus(`已验证并启用 ${saved.name}；旧密钥引用已安全清理。`);
    await onSaved();
  });

  const requestOpenChange = (next: boolean) => {
    if (next) return onOpenChange(true);
    if (dirty && !busy) {
      setDiscardConfirmationOpen(true);
      return;
    }
    onOpenChange(false);
  };

  const selectPreset = (kind: ProviderProfile["kind"]) => {
    const next = kind === "biyuan"
      ? { ...DEFAULT_BIYUAN_PROFILE, credentialRef: draft.credentialRef, createdAt: draft.createdAt, updatedAt: new Date().toISOString() }
      : kind === "openai-compatible"
        ? { ...draft, kind, name: "兼容接口", protocolMode: "responses" as const, comfyWorkflow: undefined, updatedAt: new Date().toISOString() }
        : { ...draft, kind, name: "ComfyUI", baseUrl: "http://127.0.0.1:8188", protocolMode: "comfyui" as const, updatedAt: new Date().toISOString() };
    setDraft(next);
    changeCredential(kind === "comfyui" ? { action: "clear" } : credentialState === "missing" ? { action: "replace", secret: "" } : { action: "keep" });
  };

  const requestCount = 1 + (draft.analysisModel ? 2 : 0) + (draft.imageModel ? 2 : 0);
  const billableCategories = [draft.analysisModel ? "视觉分析与结构化输出" : "", draft.imageModel ? "图片生成与编辑" : ""].filter(Boolean);

  const importWorkflow = async (file: File) => {
    if (file.size > 5 * 1024 * 1024) {
      setFailure({ category: "configuration", retryable: false, summary: "工作流文件过大", guidance: "ComfyUI API-workflow JSON 不能超过 5 MB。" });
      return;
    }
    try {
      const value: unknown = JSON.parse(await file.text());
      if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("工作流必须是 JSON 对象。");
      patch({ comfyWorkflow: value as Record<string, unknown> }, "connection");
      setStatus(`已载入 ${Object.keys(value as object).length} 个工作流节点；保存草稿或启用后生效。`);
    } catch (reason) {
      setFailure(toOperationFailure(reason, "ComfyUI"));
    }
  };

  return <Dialog.Root open={open} onOpenChange={requestOpenChange}>
    <Dialog.Portal>
      <Dialog.Overlay className="lf-dialog-overlay" />
      <Dialog.Content className={`lf-dialog-content lf-provider-dialog surface-${surface}`} aria-describedby="provider-description" onCloseAutoFocus={(event) => {
        if (!returnFocusRef?.current) return;
        const returnTarget = returnFocusRef.current;
        event.preventDefault();
        window.setTimeout(() => returnTarget.focus(), 0);
      }}>
        <div className="lf-dialog-titlebar"><div><span className="lf-kicker">本地 Provider</span><Dialog.Title>连接生成服务</Dialog.Title></div><button type="button" className="lf-icon-button" aria-label="关闭" onClick={() => requestOpenChange(false)}><X size={18} /></button></div>
        <Dialog.Description id="provider-description">密钥只交给插件后台；网页、日志、IndexedDB、诊断包和备份都无法读取。</Dialog.Description>

        <div className="lf-provider-state-strip"><div><span>当前生效</span><strong>{editor.active?.name ?? "尚未配置"}</strong><small>{editor.active?.baseUrl ?? "没有活动 Provider"}</small></div><div className={editor.draft ? "has-draft" : ""}><span>未激活草稿</span><strong>{editor.draft?.name ?? "无"}</strong><small>{editor.draft ? "测试失败不会影响当前配置" : "修改只在明确保存后保留"}</small></div></div>
        <ol className="lf-provider-steps" aria-label="Provider 配置步骤">
          <ProviderStep complete={connected} active={!connected} number="1" label="测试连接" />
          <ProviderStep complete={connected && Boolean(draft.analysisModel || draft.imageModel)} active={connected && !draft.analysisModel && !draft.imageModel} number="2" label="选择模型" />
          <ProviderStep complete={Boolean(capabilities)} active={connected && Boolean(draft.analysisModel || draft.imageModel) && !capabilities} number="3" label="检测能力" />
          <ProviderStep complete={editor.active?.updatedAt === draft.updatedAt && !dirty} active={connected && Boolean(draft.analysisModel || draft.imageModel)} number="4" label="验证并启用" />
        </ol>

        <div className="lf-provider-presets" role="group" aria-label="Provider 预设"><button type="button" className={draft.kind === "biyuan" ? "is-active" : ""} onClick={() => selectPreset("biyuan")}>彼源</button><button type="button" className={draft.kind === "openai-compatible" ? "is-active" : ""} onClick={() => selectPreset("openai-compatible")}>OpenAI-compatible</button><button type="button" className={draft.kind === "comfyui" ? "is-active" : ""} onClick={() => selectPreset("comfyui")}>ComfyUI</button></div>
        <div className="lf-model-grid"><label className="lf-field"><span>名称</span><input value={draft.name} onChange={(event) => patch({ name: event.target.value }, "none")} /></label>{draft.kind !== "comfyui" && <label className="lf-field"><span>协议模式</span><select value={draft.protocolMode} onChange={(event) => patch({ protocolMode: event.target.value as ProviderProfile["protocolMode"] })}><option value="responses">Responses</option><option value="chat-completions">Chat Completions</option><option value="images">Images only</option></select></label>}</div>
        <label className="lf-field"><span>API Base URL</span><input value={draft.baseUrl} onChange={(event) => patch({ baseUrl: event.target.value })} spellCheck={false} /></label>
        <div className="lf-endpoint-preview"><Settings2 size={14} /><span>最终请求</span><code>{modelEndpoint}</code></div>

        {draft.kind !== "comfyui" ? <div className="lf-credential-section"><div className="lf-credential-heading"><div><KeyRound size={17} /><span><strong>API Key</strong><small>{providerCredentialStateLabel(credentialState)}</small></span></div><div className="lf-credential-actions">{credentialState !== "missing" && <button className={credential.action === "keep" ? "is-active" : ""} onClick={() => changeCredential({ action: "keep" })}>保留</button>}<button className={credential.action === "replace" ? "is-active" : ""} onClick={() => changeCredential({ action: "replace", secret: "" })}>替换</button><button className={credential.action === "clear" ? "is-danger" : ""} onClick={() => changeCredential({ action: "clear" })}>清除</button></div></div>
          {credential.action === "replace" && <label className="lf-field"><span>新密钥</span><div className="lf-secret-input"><input type={showSecret ? "text" : "password"} value={credential.secret} onChange={(event) => changeCredential({ action: "replace", secret: event.target.value })} autoComplete="off" placeholder="输入后才会替换已有密钥" /><button type="button" onClick={() => setShowSecret((value) => !value)} aria-label={showSecret ? "隐藏密钥" : "显示密钥"}>{showSecret ? <EyeOff size={16} /> : <Eye size={16} />}</button></div></label>}
          {credential.action === "clear" && <p className="lf-credential-warning"><AlertTriangle size={15} />清除只会写入草稿；需要密钥的 Provider 无法以此状态启用。</p>}
          <label className="lf-check"><input type="checkbox" checked={draft.rememberSecret} onChange={(event) => patch({ rememberSecret: event.target.checked })} /><span>在此设备记住密钥；否则关闭浏览器后清除</span></label></div>
          : <div className="lf-workflow-import"><FileJson size={19} /><div><strong>API-workflow JSON</strong><small>{draft.comfyWorkflow ? `${Object.keys(draft.comfyWorkflow).length} 个节点已载入` : "在 ComfyUI 中以 API 格式导出，并用 {{LENSFLOW_PROMPT}} 标记提示词输入。"}</small></div><button className="lf-button" onClick={() => workflowInputRef.current?.click()}>导入</button><input ref={workflowInputRef} type="file" accept="application/json,.json" hidden onChange={(event) => { const file = event.target.files?.[0]; if (file) void importWorkflow(file); event.currentTarget.value = ""; }} /></div>}

        <div className="lf-model-grid"><ModelSelect label="分析模型" value={draft.analysisModel} models={analysisModels} onChange={(analysisModel) => patch({ analysisModel }, "capability")} /><ModelSelect label="图片模型" value={draft.imageModel} models={imageModels} onChange={(imageModel) => patch({ imageModel }, "capability")} /></div>
        {capabilities && <div className="lf-probe-results">{Object.entries(capabilities).map(([name, value]) => <div key={name}><span>{capabilityLabel(name)}</span><em className={`state-${value}`}>{value}</em></div>)}</div>}
        {failure && <FailurePanel failure={failure} onRetry={baseValid && usableCredential ? () => void testConnection() : undefined} onSaveDraft={baseValid ? () => void saveDraft() : undefined} retryLabel="重新测试" />}
        {status && <p className="lf-inline-status is-success" aria-live="polite"><CheckCircle2 size={15} />{status}</p>}
        <div className="lf-dialog-actions lf-provider-dialog-actions"><button className="lf-button" type="button" onClick={() => void saveDraft()} disabled={Boolean(busy) || !baseValid}>{busy === "draft" ? <Loader2 className="is-spinning" size={16} /> : <Save size={16} />}保存草稿</button><button className="lf-button is-primary" type="button" onClick={() => void testConnection()} disabled={Boolean(busy) || !baseValid || !usableCredential}>{busy === "test" ? <Loader2 className="is-spinning" size={16} /> : <CheckCircle2 size={16} />}测试并读取模型</button><button className="lf-button" type="button" onClick={() => void testConnection(true)} disabled={Boolean(busy) || !connected}>{busy === "refresh" ? <Loader2 className="is-spinning" size={16} /> : <RefreshCw size={16} />}刷新目录</button><button className="lf-button" type="button" onClick={() => setProbeConfirmationOpen(true)} disabled={Boolean(busy) || !connected}>{busy === "probe" ? <Loader2 className="is-spinning" size={16} /> : <FlaskConical size={16} />}检测能力</button><button className="lf-button is-primary" type="button" onClick={() => void activate()} disabled={Boolean(busy) || !connected || (!draft.analysisModel && !draft.imageModel)}>{busy === "activate" ? <Loader2 className="is-spinning" size={16} /> : <CheckCircle2 size={16} />}验证并启用</button></div>
      </Dialog.Content>
    </Dialog.Portal>

    <AlertDialog.Root open={probeConfirmationOpen} onOpenChange={setProbeConfirmationOpen}><AlertDialog.Portal><AlertDialog.Overlay className="lf-dialog-overlay lf-alert-overlay" /><AlertDialog.Content className="lf-dialog-content lf-alert-content"><div className="lf-dialog-titlebar"><div><span className="lf-kicker">主动能力检测</span><AlertDialog.Title>确认发送最多 {requestCount} 次请求</AlertDialog.Title></div></div><AlertDialog.Description>检测会依次验证鉴权、图像输入、Structured Outputs、图片生成、图片编辑与后台任务。</AlertDialog.Description><div className="lf-probe-warning"><AlertTriangle size={18} /><div><strong>{billableCategories.length ? `可能计费：${billableCategories.join("、")}` : "当前仅检测鉴权"}</strong><span>每项最多发送一次；超时、429、5xx 或 Schema 失败均不自动重试。</span></div></div><div className="lf-dialog-actions"><AlertDialog.Cancel className="lf-button">返回修改</AlertDialog.Cancel><AlertDialog.Action className="lf-button is-primary" onClick={() => void probe()}>确认并开始检测</AlertDialog.Action></div></AlertDialog.Content></AlertDialog.Portal></AlertDialog.Root>
    <AlertDialog.Root open={discardConfirmationOpen} onOpenChange={setDiscardConfirmationOpen}><AlertDialog.Portal><AlertDialog.Overlay className="lf-dialog-overlay lf-alert-overlay" /><AlertDialog.Content className="lf-dialog-content lf-alert-content"><div className="lf-dialog-titlebar"><div><span className="lf-kicker">尚未保存</span><AlertDialog.Title>保留这次 Provider 修改吗？</AlertDialog.Title></div></div><AlertDialog.Description>保存草稿不会切换当前活动 Provider，也不会影响正在使用的密钥。</AlertDialog.Description><div className="lf-dialog-actions"><AlertDialog.Cancel className="lf-button">继续编辑</AlertDialog.Cancel><AlertDialog.Action className="lf-button" onClick={() => onOpenChange(false)}>放弃修改</AlertDialog.Action><button className="lf-button is-primary" onClick={() => void saveDraft(true)} disabled={Boolean(busy)}>保存草稿并关闭</button></div></AlertDialog.Content></AlertDialog.Portal></AlertDialog.Root>
  </Dialog.Root>;
}

function ProviderStep({ complete, active, number, label }: { complete: boolean; active: boolean; number: string; label: string }) {
  return <li className={complete ? "is-complete" : active ? "is-active" : ""}><span>{complete ? <CheckCircle2 size={14} /> : number}</span>{label}</li>;
}

function ModelSelect({ label, value, models, onChange }: { label: string; value: string; models: ModelDescriptor[]; onChange: (value: string) => void }) {
  const options = [...new Map([{ id: value, modalities: [] as ModelDescriptor["modalities"] }, ...models].filter((model) => model.id).map((model) => [model.id, model])).values()];
  return <label className="lf-field"><span>{label}</span>{models.length ? <select value={value} onChange={(event) => onChange(event.target.value)}><option value="">请选择</option>{options.map((model) => <option key={model.id} value={model.id}>{model.id}{model.modalities.length ? ` · ${model.modalities.join("/")}` : " · 能力未知"}</option>)}</select> : <input value={value} onChange={(event) => onChange(event.target.value)} placeholder="测试连接后选择，或手动输入" />}</label>;
}

function freshProfile(source: ProviderProfile | null | undefined): ProviderProfile {
  const now = new Date().toISOString();
  return source ? { ...source } : { ...DEFAULT_BIYUAN_PROFILE, createdAt: now, updatedAt: now };
}

function capabilityLabel(name: string) {
  return ({ authentication: "鉴权", visionInput: "图像输入", structuredOutputs: "结构化输出", imageGeneration: "图片生成", imageEditing: "图片编辑", backgroundTasks: "后台任务", cancellation: "取消任务" } as Record<string, string>)[name] ?? name;
}
