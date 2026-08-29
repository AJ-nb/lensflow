import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as Tabs from "@radix-ui/react-tabs";
import {
  AlertTriangle,
  Archive,
  BookOpenText,
  Boxes,
  Check,
  ChevronRight,
  CircleDot,
  CloudOff,
  DatabaseBackup,
  Download,
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
  type BackupImportMode,
  type GenerationBatch,
  type GenerationSettings,
  type KeywordCard,
  type MaintenanceSummary,
  type ReferenceKind,
  type StudioRuntime,
  type StudioSnapshot
} from "@lensflow/contracts";
import { compilePrompt, drawAxis, drawHand, normalizeReferences } from "@lensflow/core";
import { FanGallery } from "./FanGallery";
import { ProviderDialog } from "./ProviderDialog";

export interface StudioAppProps {
  runtime: StudioRuntime;
  surface?: "page" | "sidepanel" | "site";
  title?: string;
  logoUrl?: string;
  initialView?: "create" | "collection" | "history" | "backup";
}

const EMPTY_HAND: AxisHand = { style: null, subject: null, composition: null, color: null, motion: null };
const EMPTY_SNAPSHOT: StudioSnapshot = {
  connected: false,
  readOnly: true,
  protocolVersion: 1,
  provider: null,
  capabilities: { ...UNKNOWN_CAPABILITIES },
  keywords: [],
  assets: [],
  references: [],
  batches: [],
  historyEvents: [],
  storage: null
};

export function StudioApp({ runtime, surface = "page", title = "镜序 Lensflow", logoUrl, initialView = "create" }: StudioAppProps) {
  const [snapshot, setSnapshot] = useState<StudioSnapshot>(EMPTY_SNAPSHOT);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [providerOpen, setProviderOpen] = useState(false);
  const [hand, setHand] = useState<AxisHand>(EMPTY_HAND);
  const [tray, setTray] = useState<KeywordCard[]>([]);
  const [body, setBody] = useState("");
  const [newKeyword, setNewKeyword] = useState("");
  const [newAxis, setNewAxis] = useState<AxisName>("style");
  const [showKeywordForm, setShowKeywordForm] = useState(false);
  const [activeStep, setActiveStep] = useState(1);
  const [settings, setSettings] = useState<GenerationSettings>({ model: "", size: "1024x1024", quality: "medium", count: 4, concurrency: 2 });
  const [submitting, setSubmitting] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);
  const [activeSection, setActiveSection] = useState(initialView);
  const [selectedAssetId, setSelectedAssetId] = useState<string | null>(null);
  const uploadInputRef = useRef<HTMLInputElement>(null);
  const providerButtonRef = useRef<HTMLButtonElement>(null);

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
      if (stored?.activeStep && stored.activeStep >= 1 && stored.activeStep <= 4) setActiveStep(stored.activeStep);
      if (stored?.selectedAssetId) setSelectedAssetId(stored.selectedAssetId);
      if (typeof handoff?.body === "string") setBody(handoff.body);
      if (handoff?.activeStep && handoff.activeStep >= 1 && handoff.activeStep <= 4) setActiveStep(handoff.activeStep);
      if (handoff?.selectedAssetId) setSelectedAssetId(handoff.selectedAssetId);
      if (!sessionStorage.getItem("lensflow-session-id")) sessionStorage.setItem("lensflow-session-id", crypto.randomUUID());
    } catch { /* Ignore damaged per-tab session state. */ }
  }, []);

  useEffect(() => {
    sessionStorage.setItem("lensflow-composer-session", JSON.stringify({ hand, tray, body, activeStep, selectedAssetId }));
  }, [activeStep, body, hand, selectedAssetId, tray]);

  const compiledPrompt = useMemo(() => compilePrompt(hand, [tray.map((card) => card.text).join("，"), body].filter(Boolean).join("，")), [body, hand, tray]);
  const latestBatch = snapshot.batches[0] ?? null;

  const drawOne = (axis: AxisName) => setHand((current) => ({ ...current, [axis]: drawAxis(axis, snapshot.keywords, current[axis]) }));
  const toggleLock = (axis: AxisName) => setHand((current) => current[axis] ? ({ ...current, [axis]: { ...current[axis]!, locked: !current[axis]!.locked } }) : current);
  const addHandToTray = () => setTray((current) => [...new Map([...current, ...AXIS_ORDER.map((axis) => hand[axis]).filter((card): card is KeywordCard => Boolean(card))].map((card) => [card.id, card])).values()]);

  const createKeyword = async () => {
    if (!newKeyword.trim()) return;
    await runtime.createKeyword({ axis: newAxis, text: newKeyword.trim() });
    setNewKeyword("");
    setShowKeywordForm(false);
    await reload();
  };

  const createBatch = async () => {
    if (!compiledPrompt || !settings.model || snapshot.readOnly) return;
    setSubmitting(true);
    setError("");
    try {
      await runtime.createBatch({ prompt: compiledPrompt, settings, referenceIds: snapshot.references.filter((item) => item.enabled).map((item) => item.id) });
      setActiveStep(4);
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
      await runtime.importCapture({ name: file.name, dataUrl: await fileToDataUrl(file), mimeType: file.type, size: file.size });
      setActiveSection("create");
      setActiveStep(1);
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
        {surface !== "sidepanel" && <div className="lf-project"><span>人像创作</span><small>本地工作区</small></div>}
        <div className={`lf-connection ${snapshot.connected ? "is-online" : ""}`}><CircleDot size={14} />{snapshot.connected ? "本机插件在线" : "等待本机插件"}</div>
        <nav className="lf-topnav" aria-label="工作区">
          <button className={activeSection === "create" ? "is-active" : ""} onClick={() => setActiveSection("create")}>创作</button>
          <button className={activeSection === "collection" ? "is-active" : ""} onClick={() => setActiveSection("collection")}>收藏</button>
          <button className={activeSection === "history" ? "is-active" : ""} onClick={() => setActiveSection("history")}>历史</button>
        </nav>
        <button ref={providerButtonRef} className="lf-icon-button" type="button" onClick={() => setProviderOpen(true)} aria-label="Provider 设置"><Settings size={19} /></button>
      </header>

      {!snapshot.connected && surface === "site" && (
        <div className="lf-bridge-notice"><CloudOff size={17} /><span>浏览模式：安装并连接 Lensflow 插件后才能生成、写入资产和同步任务。</span><a href="/lensflow/download">安装插件</a></div>
      )}
      {surface === "site" && <div className="lf-mobile-readonly"><AlertTriangle size={16} /><span>移动端仅提供只读预览；完整创作请使用桌面 Chrome 与 Lensflow 插件。</span></div>}

      <div className="lf-workspace">
        <aside className="lf-library" aria-label="资产库">
          <Tabs.Root defaultValue="assets">
            <Tabs.List className="lf-tabs" aria-label="资产类型"><Tabs.Trigger value="assets">素材</Tabs.Trigger><Tabs.Trigger value="prompts">提示词</Tabs.Trigger><Tabs.Trigger value="references">参考</Tabs.Trigger><Tabs.Trigger value="works">作品</Tabs.Trigger></Tabs.List>
            <div className="lf-library-tools"><label className="lf-search"><Search size={15} /><input placeholder="搜索本地资产" /></label><button className="lf-icon-button" aria-label="筛选"><PanelRight size={16} /></button></div>
            <Tabs.Content value="assets">
              <div className="lf-quick-actions">
                <button onClick={() => void runtime.openCapture()}><FileImage size={18} /><span>网页捕捉</span></button>
                <button onClick={() => uploadInputRef.current?.click()}><Upload size={18} /><span>上传图片</span></button>
                <button><WandSparkles size={18} /><span>图像解构</span></button>
                <button onClick={() => void runtime.openLegacyWorkbench?.()}><Sparkles size={18} /><span>深度分析</span></button>
              </div>
              <AssetList snapshot={snapshot} kind="capture" selectedId={selectedAssetId} onSelect={setSelectedAssetId} />
            </Tabs.Content>
            <Tabs.Content value="prompts"><KeywordLibrary keywords={snapshot.keywords} onDelete={async (id) => { await runtime.deleteKeyword(id); await reload(); }} /></Tabs.Content>
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
          <div className="lf-flow-title"><span>捕捉与解构</span><ChevronRight size={16} /><span>组合与生成</span><ChevronRight size={16} /><span>资产与复用</span></div>
          <div className="lf-stepper" aria-label="创作步骤">
            {["素材", "组合", "预检", "结果"].map((label, index) => <button key={label} className={activeStep === index + 1 ? "is-active" : activeStep > index + 1 ? "is-complete" : ""} onClick={() => setActiveStep(index + 1)}><span>{activeStep > index + 1 ? <Check size={14} /> : index + 1}</span>{label}</button>)}
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
                  <div><button className="lf-button is-primary" onClick={() => void runtime.openCapture()}><FileImage size={16} />去网页捕捉</button><button className="lf-button" onClick={() => uploadInputRef.current?.click()}><Upload size={16} />上传并解构</button><button className="lf-button" onClick={() => setShowKeywordForm(true)}><Plus size={16} />创建关键词</button></div>
                </div>
              ) : <AssetList snapshot={snapshot} selectedId={selectedAssetId} onSelect={setSelectedAssetId} />}
              <div className="lf-stage-footer"><span>选择素材后进入组合，也可以直接从文字开始。</span><button className="lf-button is-primary" onClick={() => setActiveStep(2)}>进入组合<ChevronRight size={16} /></button></div>
            </section>
          )}

          {!loading && activeStep === 2 && (
            <section className="lf-stage lf-composer">
              <div className="lf-section-heading"><div><span className="lf-kicker">五轴抽卡</span><h1>把灵感组合成可控提示词</h1></div><button className="lf-button" disabled={!snapshot.keywords.length} onClick={() => setHand((current) => drawHand(snapshot.keywords, current))}><Shuffle size={16} />全部重抽</button></div>
              {snapshot.keywords.length === 0 ? (
                <div className="lf-inline-empty"><Library size={20} /><span>关键词库为空。先从网页收藏文字、图片解构结果或手动输入创建。</span><button onClick={() => setShowKeywordForm(true)}>创建第一个关键词</button></div>
              ) : (
                <div className="lf-axis-grid">{AXIS_ORDER.map((axis) => <AxisCard key={axis} axis={axis} card={hand[axis]} onDraw={() => drawOne(axis)} onLock={() => toggleLock(axis)} />)}</div>
              )}
              <button className="lf-tray-add" onClick={addHandToTray} disabled={!AXIS_ORDER.some((axis) => hand[axis])}><Plus size={16} />整手送入词卡托盘</button>
              <div className="lf-tray"><div className="lf-tray-heading"><strong>词卡托盘</strong><button onClick={() => setTray([])}>清空</button></div><div>{tray.length ? tray.map((card) => <button key={card.id} onClick={() => setTray((current) => current.filter((item) => item.id !== card.id))}>{card.text}<X size={13} /></button>) : <span>抽取或创建关键词后放入这里</span>}</div></div>
              <label className="lf-prompt-field"><span>正文与补充要求</span><textarea value={body} onChange={(event) => setBody(event.target.value)} placeholder="描述主体、环境、镜头和需要保留的细节……" /></label>
              <div className="lf-prompt-preview"><span>最终提示词</span><p>{compiledPrompt || "提示词将在这里按风格、主体、构图、色彩、动态的顺序预览。"}</p></div>
              <ReferenceComposer snapshot={snapshot} selectedAssetId={selectedAssetId} onAdd={(kind) => void addReference(kind)} onToggle={async (id, enabled) => { await runtime.setReferenceEnabled?.(id, enabled); await reload(); }} onDelete={async (id) => { await runtime.deleteReference?.(id); await reload(); }} />
              <div className="lf-stage-footer"><button className="lf-button" onClick={() => setActiveStep(1)}>返回素材</button><button className="lf-button is-primary" disabled={!compiledPrompt} onClick={() => setActiveStep(3)}>检查并提交<ChevronRight size={16} /></button></div>
            </section>
          )}

          {!loading && activeStep === 3 && (
            <Preflight snapshot={snapshot} settings={settings} setSettings={setSettings} prompt={compiledPrompt} onConfigure={() => setProviderOpen(true)} onBack={() => setActiveStep(2)} onSubmit={() => void createBatch()} submitting={submitting} />
          )}

          {!loading && activeStep === 4 && (
            latestBatch ? <FanGallery
              batch={latestBatch}
              reducedMotion={reducedMotion}
              onRetryFailed={async () => { await runtime.retryFailed(latestBatch.id); await reload(); }}
              onSave={async (child) => { await runtime.saveWork(latestBatch.id, child.id); await reload(); }}
              onDownload={(child) => runtime.download(latestBatch.id, child?.id)}
              onEagle={runtime.exportToEagle ? async (child) => { const result = await runtime.exportToEagle!(latestBatch.id, child.id); return `${result.libraryName} · ${result.itemCount} 项 · ${result.tags.length} 个标签已回读`; } : undefined}
              onCancel={async () => { await runtime.cancelBatch(latestBatch.id); await reload(); }}
              canCancel={snapshot.capabilities.cancellation === "supported"}
            />
              : <div className="lf-empty-state"><FolderHeart size={28} /><h2>还没有生成结果</h2><p>完成组合和预检后，结果会以卡池形式保存在本次会话画架。</p><button className="lf-button is-primary" onClick={() => setActiveStep(2)}>开始组合</button></div>
          )}
          </>}
          {activeSection === "collection" && <CollectionView snapshot={snapshot} />}
          {activeSection === "history" && <HistoryView snapshot={snapshot} onOpenBatch={() => { setActiveSection("create"); setActiveStep(4); }} />}
          {activeSection === "backup" && <BackupCenter runtime={runtime} onChanged={reload} />}
          {error && <div className="lf-error" role="alert">{error}</div>}
        </main>

        <aside className="lf-inspector" aria-label="上下文检查器">
          <Tabs.Root defaultValue="provider">
            <Tabs.List className="lf-tabs"><Tabs.Trigger value="work">作品</Tabs.Trigger><Tabs.Trigger value="tasks">任务</Tabs.Trigger><Tabs.Trigger value="provider">Provider</Tabs.Trigger><Tabs.Trigger value="sync">同步</Tabs.Trigger></Tabs.List>
            <Tabs.Content value="provider"><InspectorProvider snapshot={snapshot} onConfigure={() => setProviderOpen(true)} /></Tabs.Content>
            <Tabs.Content value="tasks"><InspectorTasks batches={snapshot.batches} /></Tabs.Content>
            <Tabs.Content value="work"><InspectorWorks snapshot={snapshot} /></Tabs.Content>
            <Tabs.Content value="sync"><InspectorSync snapshot={snapshot} /></Tabs.Content>
          </Tabs.Root>
        </aside>
      </div>

      {showKeywordForm && <div className="lf-popover-form"><div><strong>创建关键词</strong><button className="lf-icon-button" onClick={() => setShowKeywordForm(false)}><X size={16} /></button></div><select value={newAxis} onChange={(event) => setNewAxis(event.target.value as AxisName)}>{AXIS_ORDER.map((axis) => <option value={axis} key={axis}>{AXIS_LABELS[axis]}</option>)}</select><input autoFocus value={newKeyword} onChange={(event) => setNewKeyword(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") void createKeyword(); }} placeholder="输入自己的关键词" /><button className="lf-button is-primary" onClick={() => void createKeyword()}>保存到关键词库</button></div>}
      <input ref={uploadInputRef} type="file" accept="image/*" hidden onChange={(event) => { const file = event.target.files?.[0]; if (file) void importCapture(file); event.currentTarget.value = ""; }} />
      <ProviderDialog runtime={runtime} provider={snapshot.provider} open={providerOpen} onOpenChange={setProviderOpen} onSaved={reload} returnFocusRef={providerButtonRef} />
    </div>
  );
}

function CollectionView({ snapshot }: { snapshot: StudioSnapshot }) {
  const works = snapshot.assets.filter((asset) => asset.kind === "work");
  return <section className="lf-secondary-view">
    <div className="lf-section-heading"><div><span className="lf-kicker">本地作品集</span><h1>收藏与作品</h1></div><span>{works.length} 项</span></div>
    {works.length ? <div className="lf-work-grid">{works.map((asset) => <article key={asset.id}>
      <div>{asset.previewUrl || asset.dataUrl ? <img src={asset.previewUrl || asset.dataUrl} alt={asset.name} /> : <FolderHeart size={28} />}</div>
      <strong>{asset.name}</strong><small>{asset.prompt || "未保存提示词"}</small>
    </article>)}</div> : <div className="lf-empty-state"><FolderHeart size={28} /><h2>作品集还是空的</h2><p>生成结果会先进入历史。只有主动执行“收入作品集”后才会出现在这里。</p></div>}
  </section>;
}

function HistoryView({ snapshot, onOpenBatch }: { snapshot: StudioSnapshot; onOpenBatch: () => void }) {
  return <section className="lf-secondary-view">
    <div className="lf-section-heading"><div><span className="lf-kicker">可恢复的本地记录</span><h1>历史与任务</h1></div><span>{snapshot.batches.length} 个批次</span></div>
    <div className="lf-history-layout">
      <div><h2>生成批次</h2>{snapshot.batches.length ? snapshot.batches.map((batch) => <button className="lf-history-row" key={batch.id} onClick={onOpenBatch}>
        <span className={`state-${batch.state}`}><History size={17} /></span><div><strong>{batch.prompt}</strong><small>{batch.settings.model} · {batch.children.filter((child) => child.state === "ready").length}/{batch.children.length} 完成</small></div><em>{batch.state}</em>
      </button>) : <p className="lf-muted-copy">暂无生成任务。</p>}</div>
      <div><h2>最近事件</h2>{snapshot.historyEvents.length ? snapshot.historyEvents.map((event) => <div className="lf-event-row" key={event.id}><span /><div><strong>{event.message}</strong><small>{new Date(event.createdAt).toLocaleString("zh-CN")}</small></div></div>) : <p className="lf-muted-copy">暂无历史事件。</p>}</div>
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

function StorageMeter({ snapshot }: { snapshot: StudioSnapshot }) {
  const storage = snapshot.storage;
  const percent = storage?.quota ? Math.min(100, storage.usage / storage.quota * 100) : 0;
  return <div className="lf-storage"><div><Archive size={16} /><strong>本地存储</strong><small>{storage ? `${formatBytes(storage.usage)} / ${formatBytes(storage.quota)}` : "正在估算"}</small></div><span><i style={{ width: `${percent}%` }} /></span></div>;
}

function formatBytes(bytes: number) { return bytes >= 1024 ** 3 ? `${(bytes / 1024 ** 3).toFixed(1)} GB` : `${(bytes / 1024 ** 2).toFixed(1)} MB`; }

function Preflight({ snapshot, settings, setSettings, prompt, onConfigure, onBack, onSubmit, submitting }: { snapshot: StudioSnapshot; settings: GenerationSettings; setSettings: React.Dispatch<React.SetStateAction<GenerationSettings>>; prompt: string; onConfigure: () => void; onBack: () => void; onSubmit: () => void; submitting: boolean }) {
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
      <div className="lf-capabilities"><strong>能力状态</strong>{Object.entries({ "鉴权": caps.authentication, "图像输入": caps.visionInput, "结构化输出": caps.structuredOutputs, "图片生成": caps.imageGeneration, "图片编辑": caps.imageEditing, "后台任务": caps.backgroundTasks }).map(([label, state]) => <div key={label}><span>{label}</span><em className={`state-${state}`}>{state}</em></div>)}<button onClick={onConfigure}>打开 Provider 设置</button></div>
    </div>
    {referencesBlocked && <div className="lf-request-summary is-blocked"><AlertTriangle size={15} /><span>参考图片需要已验证的图片编辑能力；当前提交已阻断。</span></div>}
    <div className="lf-request-summary"><Lock size={15} /><span>将产生最多 {settings.count} 次{references.length ? "编辑" : "生成"}请求；超时、429、5xx 或 Schema 失败均不会自动重新付费请求。</span></div>
    <div className="lf-stage-footer"><button className="lf-button" onClick={onBack}>返回修改</button><button className="lf-button is-primary" disabled={blocked || !prompt || submitting} onClick={onSubmit}><Sparkles size={16} />{submitting ? "正在提交" : `生成 ${settings.count} 张`}</button></div>
  </section>;
}

function InspectorProvider({ snapshot, onConfigure }: { snapshot: StudioSnapshot; onConfigure: () => void }) {
  return <div className="lf-inspector-content"><div className="lf-inspector-status"><span className={snapshot.provider ? "is-ok" : ""}><CircleDot size={18} /></span><div><strong>{snapshot.provider ? snapshot.provider.name : "尚未配置 Provider"}</strong><small>{snapshot.provider?.baseUrl || "密钥由插件隔离保存"}</small></div></div><dl><div><dt>协议版本</dt><dd>v{snapshot.protocolVersion}</dd></div><div><dt>分析模型</dt><dd>{snapshot.provider?.analysisModel || "未选择"}</dd></div><div><dt>图片模型</dt><dd>{snapshot.provider?.imageModel || "未选择"}</dd></div><div><dt>写入状态</dt><dd>{snapshot.readOnly ? "只读" : "可写"}</dd></div></dl><button className="lf-button is-primary" onClick={onConfigure}><Settings size={16} />配置 Provider</button></div>;
}

function InspectorTasks({ batches }: { batches: GenerationBatch[] }) { return <div className="lf-inspector-content"><div className="lf-panel-heading"><strong>最近任务</strong><small>{batches.length} 个批次</small></div><div className="lf-event-list">{batches.length ? batches.slice(0, 8).map((batch) => { const progress = Math.round(batch.children.reduce((total, child) => total + (child.state === "ready" ? 1 : child.progress ?? 0), 0) / Math.max(1, batch.children.length) * 100); return <div key={batch.id}><span className={`state-${batch.state}`} /><div><strong>{batch.state}</strong><small>{batch.children.filter((child) => child.state === "ready").length}/{batch.children.length} 已完成 · {progress}%</small><span className="lf-task-progress"><i style={{ width: `${progress}%` }} /></span></div></div>; }) : <p>暂无生成任务</p>}</div></div>; }
function InspectorWorks({ snapshot }: { snapshot: StudioSnapshot }) { const count = snapshot.assets.filter((asset) => asset.kind === "work").length; return <div className="lf-inspector-content"><div className="lf-metric"><FolderHeart size={20} /><strong>{count}</strong><span>已收入作品</span></div><p className="lf-inspector-note">生成结果先进入历史，只有主动保存后才会成为作品资产。</p></div>; }
function InspectorSync({ snapshot }: { snapshot: StudioSnapshot }) { return <div className="lf-inspector-content"><div className="lf-inspector-status"><span className={snapshot.connected ? "is-ok" : ""}>{snapshot.connected ? <Check size={18} /> : <CloudOff size={18} />}</span><div><strong>{snapshot.connected ? "网页与插件已连接" : "未连接本机插件"}</strong><small>数据只在本机处理与传输</small></div></div><dl><div><dt>协议</dt><dd>v{snapshot.protocolVersion}</dd></div><div><dt>云端同步</dt><dd>未启用</dd></div><div><dt>密钥桥接</dt><dd>禁止</dd></div></dl></div>; }
