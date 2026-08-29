import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Check, ChevronRight, Database, LoaderCircle, PlugZap, RefreshCw, Send } from "lucide-react";
import { createArchiveEagleMappings, createEagleAnnotation, getEagleWebsite, selectedEagleTags } from "../../shared/eagle-mapping";
import type { AnalysisArchiveRecord } from "../../shared/types";
import type { EagleConnectionInfo } from "../../lib/eagle";
import type { FeedbackHandler } from "./InteractionFeedback";
import { requestUrlAccess } from "../../shared/permissions";

export function EagleBridge({ records, selectedRecordId, onSelectedRecordChange, onSynced, onFeedback }: {
  records: AnalysisArchiveRecord[];
  selectedRecordId: string;
  onSelectedRecordChange: (id: string) => void;
  onSynced: () => Promise<void> | void;
  onFeedback: FeedbackHandler;
}) {
  const [connection, setConnection] = useState<EagleConnectionInfo | null>(null);
  const [connectionError, setConnectionError] = useState("");
  const [connecting, setConnecting] = useState(false);
  const [folderId, setFolderId] = useState("");
  const [selectedMappingIds, setSelectedMappingIds] = useState<string[]>([]);
  const [importing, setImporting] = useState(false);
  const [notice, setNotice] = useState("");
  const [expanded, setExpanded] = useState(true);

  const selectedRecord = records.find((record) => record.id === selectedRecordId) ?? records[0];
  const mappings = useMemo(
    () => selectedRecord ? createArchiveEagleMappings(selectedRecord) : [],
    [selectedRecord]
  );

  useEffect(() => {
    setSelectedMappingIds(mappings.filter((item) => item.selectedByDefault).map((item) => item.id));
    setNotice("");
  }, [selectedRecord?.id]);

  async function connect() {
    setConnecting(true);
    setConnectionError("");
    setNotice("");
    try {
      await requestUrlAccess("http://localhost:41595");
      const { connectToEagle } = await import("../../lib/eagle");
      const next = await connectToEagle();
      setConnection(next);
      if (!folderId && next.folders[0]) setFolderId(next.folders[0].id);
      onFeedback("success", "Eagle 已连接", `${next.libraryName} · ${next.itemCount} 项`);
    } catch (error) {
      setConnection(null);
      const message = error instanceof Error ? error.message : "Eagle 连接失败。";
      setConnectionError(`${message} 请确认 Eagle 已启动并允许本地 API。`);
      onFeedback("error", "Eagle 连接失败", "请启动 Eagle、确认本地 API 后重试。");
    } finally {
      setConnecting(false);
    }
  }

  async function importRecord() {
    if (!selectedRecord || !connection?.writable) return;
    setImporting(true);
    setNotice("");
    setConnectionError("");
    try {
      const { importArchiveToEagle } = await import("../../lib/eagle");
      const tags = selectedEagleTags(mappings, selectedMappingIds);
      const output = await importArchiveToEagle({
        record: selectedRecord,
        dataUrl: selectedRecord.result.previewDataUrl,
        folderId: folderId || undefined,
        tags,
        annotation: createEagleAnnotation(selectedRecord),
        website: getEagleWebsite(selectedRecord)
      });
      const { setAnalysisArchiveEagleSync } = await import("../../lib/archive");
      await setAnalysisArchiveEagleSync(selectedRecord.id, {
        itemId: output.itemId,
        folderId: folderId || undefined,
        tags: output.tags,
        syncedAt: new Date().toISOString(),
        verified: true
      });
      const selectedFolder = flattenFolders(connection.folders).find((folder) => folder.id === folderId)?.label.trim() || "未指定文件夹";
      const websiteState = getEagleWebsite(selectedRecord) ? "来源网站已写入" : "无来源网站";
      const detail = `${selectedRecord.title} · ${selectedFolder} · ${output.tags.length} 个标签 · ${websiteState}`;
      setNotice(detail);
      onFeedback("success", "已导入 Eagle 并验证", detail);
      await onSynced();
    } catch (error) {
      const message = error instanceof Error ? error.message : "单项导入失败。";
      setConnectionError(`${message} 请检查目标文件夹和 Eagle 写入状态后重试。`);
      onFeedback("error", "Eagle 导入失败", "请检查目标文件夹、来源网址和 Eagle 写入状态后重试。");
    } finally {
      setImporting(false);
    }
  }

  return <section className="eagle-bridge">
    <header className="eagle-bridge-heading">
      <button className="eagle-collapse" title={expanded ? "收起 Eagle 连接" : "展开 Eagle 连接"} onClick={() => setExpanded((value) => !value)}>
        <span className={`eagle-status-mark ${connection ? "online" : ""}`}><PlugZap size={15} /></span>
        <span><strong>Eagle 连接</strong><small>{connection ? `${connection.libraryName} · ${connection.itemCount} 项` : "标签映射与单项导入"}</small></span>
        <ChevronRight size={15} className={expanded ? "expanded" : ""} />
      </button>
      <button className="icon-button" title={connection ? "刷新 Eagle 连接" : "连接 Eagle"} aria-label={connection ? "刷新 Eagle 连接" : "连接 Eagle"} disabled={connecting} onClick={() => void connect()}>
        {connecting ? <LoaderCircle size={16} className="spin" /> : <RefreshCw size={16} />}
      </button>
    </header>

    {expanded && <div className="eagle-bridge-body">
      {!connection ? <button className="eagle-connect-action" disabled={connecting} onClick={() => void connect()}>
        <Database size={18} />
        <span><strong>{connecting ? "正在读取 Eagle" : "连接本机 Eagle"}</strong><small>读取图库、文件夹与写入桥状态</small></span>
      </button> : <dl className="eagle-connection-stats">
        <div><dt>版本</dt><dd>{connection.version}{connection.build !== "未知" ? ` · ${connection.build}` : ""}</dd></div>
        <div><dt>图库</dt><dd title={connection.libraryPath}>{connection.libraryName}</dd></div>
        <div><dt>条目</dt><dd>{connection.itemCount}</dd></div>
        <div><dt>单项写入</dt><dd className={connection.writable ? "good" : "warning"}>{connection.writable ? "官方 API 可用" : "不可用"}</dd></div>
      </dl>}

      {connectionError && <p className="inline-error"><AlertTriangle size={14} />{connectionError}</p>}

      {connection && <>
        <div className="eagle-import-controls">
          <label><span>设计档案</span><select name="eagle-archive" value={selectedRecord?.id ?? ""} onChange={(event) => onSelectedRecordChange(event.target.value)}>
            {records.map((record) => <option key={record.id} value={record.id}>{record.eagleSync ? "✓ " : ""}{record.title}</option>)}
          </select></label>
          <label><span>目标文件夹</span><select name="eagle-folder" value={folderId} onChange={(event) => setFolderId(event.target.value)}>
            <option value="">不指定文件夹</option>
            {flattenFolders(connection.folders).map((folder) => <option key={folder.id} value={folder.id}>{folder.label}</option>)}
          </select></label>
        </div>

        {selectedRecord ? <section className="eagle-mapping-preview">
          <header><span>标签映射预览</span><strong>{selectedMappingIds.length}/{mappings.length}</strong></header>
          <div className="eagle-pipeline-head"><span>Lensflow 字段</span><ChevronRight size={13} /><span>Eagle 标签</span></div>
          <div className="eagle-mapping-list">{mappings.map((item) => <label key={item.id} className={item.selectedByDefault ? "trusted" : "candidate"}>
            <input name={`eagle-tag-${item.id}`} type="checkbox" checked={selectedMappingIds.includes(item.id)} onChange={() => setSelectedMappingIds((current) => current.includes(item.id) ? current.filter((id) => id !== item.id) : [...current, item.id])} />
            <span title={item.detail}><small>{item.source}</small><ChevronRight size={12} /><strong>{item.target}</strong></span>
            <em>{item.evidence}</em>
          </label>)}</div>
          <p className="evidence-note">分析候选默认不选中。单图不能确认真实材料、工艺、零件或来源关系。</p>
          {getEagleWebsite(selectedRecord) && <p className="eagle-website"><strong>来源网站</strong><span>{getEagleWebsite(selectedRecord)}</span></p>}
        </section> : <p className="eagle-empty">先完成一次分析，档案才可发送到 Eagle。</p>}

        <button className="button primary eagle-import-button" disabled={!selectedRecord || !connection.writable || importing} onClick={() => void importRecord()}>
          {importing ? <LoaderCircle size={16} className="spin" /> : selectedRecord?.eagleSync ? <Check size={16} /> : <Send size={16} />}
          {importing ? "正在导入并回读" : selectedRecord?.eagleSync ? "再次导入为新条目" : "导入当前档案"}
        </button>
        {notice && <p className="eagle-success"><Check size={14} /><span><strong>导入成功</strong>{notice}</span></p>}
      </>}
    </div>}
  </section>;
}

function flattenFolders(folders: EagleConnectionInfo["folders"], depth = 0): Array<{ id: string; label: string }> {
  return folders.flatMap((folder) => [
    { id: folder.id, label: `${"　".repeat(depth)}${folder.name}` },
    ...flattenFolders(folder.children ?? [], depth + 1)
  ]);
}
