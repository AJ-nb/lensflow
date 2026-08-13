import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import ReactCrop, { centerCrop, makeAspectCrop, type PercentCrop } from "react-image-crop";
import "react-image-crop/dist/ReactCrop.css";
import { Check, Crop, Image as ImageIcon, Layers3, Plus, RotateCcw, Save, Trash2 } from "lucide-react";
import type { MaterialRegion, NormalizedRect } from "../../shared/types";
import { normalizedRectFromPoints, normalizedRectStyle } from "../../lib/workbench";

type WorkbenchMode = "crop" | "materials";

const EMPTY_CROP: PercentCrop = { unit: "%", x: 10, y: 10, width: 80, height: 80 };
const REGION_COLORS = ["#E4572E", "#0F766E", "#2563EB", "#A16207", "#7C3AED", "#DB2777"];
const CROP_ARIA_LABELS = {
  cropArea: "使用方向键移动主体裁切区域",
  nwDragHandle: "调整裁切区域左上角",
  nDragHandle: "调整裁切区域上边缘",
  neDragHandle: "调整裁切区域右上角",
  eDragHandle: "调整裁切区域右边缘",
  seDragHandle: "调整裁切区域右下角",
  sDragHandle: "调整裁切区域下边缘",
  swDragHandle: "调整裁切区域左下角",
  wDragHandle: "调整裁切区域左边缘"
};

export function DesignWorkbench({ imageUrl, regions, disabled, canRestoreOriginal, onChooseImage, onApplyCrop, onRestoreOriginal, onSaveRegions }: {
  imageUrl: string;
  regions: MaterialRegion[];
  disabled: boolean;
  canRestoreOriginal: boolean;
  onChooseImage: () => void;
  onApplyCrop: (rect: NormalizedRect, aspect?: number) => void;
  onRestoreOriginal: () => void;
  onSaveRegions: (regions: MaterialRegion[]) => void;
}) {
  const [mode, setMode] = useState<WorkbenchMode>("crop");
  const [crop, setCrop] = useState<PercentCrop>(EMPTY_CROP);
  const [aspect, setAspect] = useState<number | undefined>();
  const [draftRect, setDraftRect] = useState<NormalizedRect | null>(null);
  const [dragStart, setDragStart] = useState<{ x: number; y: number } | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [materialFamily, setMaterialFamily] = useState("皮革");
  const [finish, setFinish] = useState("哑光");
  const [colorHex, setColorHex] = useState(REGION_COLORS[0]!);
  const [note, setNote] = useState("");
  const imageRef = useRef<HTMLImageElement>(null);

  useEffect(() => {
    if (!selectedId) return;
    const region = regions.find((item) => item.id === selectedId);
    if (!region) return;
    setDraftRect(region.rect);
    setName(region.name);
    setMaterialFamily(region.materialFamily);
    setFinish(region.finish);
    setColorHex(region.colorHex);
    setNote(region.note);
  }, [regions, selectedId]);

  function resetRegionDraft() {
    setSelectedId(null);
    setDraftRect(null);
    setName("");
    setMaterialFamily("皮革");
    setFinish("哑光");
    setColorHex(REGION_COLORS[regions.length % REGION_COLORS.length]!);
    setNote("");
  }

  function pointFromEvent(event: ReactPointerEvent<HTMLDivElement>) {
    const bounds = event.currentTarget.getBoundingClientRect();
    return {
      x: Math.min(1, Math.max(0, (event.clientX - bounds.left) / bounds.width)),
      y: Math.min(1, Math.max(0, (event.clientY - bounds.top) / bounds.height))
    };
  }

  function beginRegion(event: ReactPointerEvent<HTMLDivElement>) {
    if (event.button !== 0) return;
    const point = pointFromEvent(event);
    event.currentTarget.setPointerCapture(event.pointerId);
    setSelectedId(null);
    setDragStart(point);
    setDraftRect({ ...point, width: 0, height: 0 });
  }

  function moveRegion(event: ReactPointerEvent<HTMLDivElement>) {
    if (!dragStart) return;
    setDraftRect(normalizedRectFromPoints(dragStart, pointFromEvent(event)));
  }

  function finishRegion(event: ReactPointerEvent<HTMLDivElement>) {
    if (!dragStart) return;
    const rect = normalizedRectFromPoints(dragStart, pointFromEvent(event));
    setDragStart(null);
    if (rect.width < 0.015 || rect.height < 0.015) setDraftRect(null);
    else setDraftRect(rect);
  }

  function saveRegion() {
    if (!draftRect || !name.trim()) return;
    const next: MaterialRegion = {
      id: selectedId ?? crypto.randomUUID(),
      name: name.trim(),
      materialFamily,
      finish,
      colorHex,
      note: note.trim(),
      rect: draftRect,
      createdAt: selectedId ? regions.find((item) => item.id === selectedId)?.createdAt ?? new Date().toISOString() : new Date().toISOString()
    };
    onSaveRegions(selectedId
      ? regions.map((item) => item.id === selectedId ? next : item)
      : [...regions, next]);
    resetRegionDraft();
  }

  function deleteRegion(id: string) {
    onSaveRegions(regions.filter((item) => item.id !== id));
    if (selectedId === id) resetRegionDraft();
  }

  function changeAspect(next: number | undefined) {
    setAspect(next);
    const image = imageRef.current;
    if (!image || !next) return;
    setCrop(centerCrop(makeAspectCrop({ unit: "%", width: 80 }, next, image.width, image.height), image.width, image.height));
  }

  const normalizedCrop: NormalizedRect = {
    x: crop.x / 100,
    y: crop.y / 100,
    width: crop.width / 100,
    height: crop.height / 100
  };

  return <section className="workbench-shell">
    <header className="workbench-heading">
      <div><span>局部设计工作台</span><h2>主体裁切与材料标注</h2><p>所有区域均保存为可恢复的图片相对坐标</p></div>
      <div className="segmented" aria-label="标注工具">
        <button className={mode === "crop" ? "active" : ""} onClick={() => setMode("crop")}><Crop size={15} />裁切</button>
        <button className={mode === "materials" ? "active" : ""} onClick={() => setMode("materials")}><Layers3 size={15} />材料</button>
      </div>
    </header>

    {!imageUrl ? <button className="workbench-empty" onClick={onChooseImage}><ImageIcon size={30} /><strong>选择一张图片开始</strong></button> : <>
      {mode === "crop" ? <>
        <div className="crop-stage">
          <ReactCrop crop={crop} onChange={(_, percentCrop) => setCrop(percentCrop)} aspect={aspect} ariaLabels={CROP_ARIA_LABELS} keepSelection>
            <img ref={imageRef} src={imageUrl} alt="待裁切图片" width={1600} height={1200} />
          </ReactCrop>
        </div>
        <div className="workbench-controls">
          <div className="segmented wide crop-ratios">{([
            [undefined, "自由"],
            [1, "1:1"],
            [4 / 3, "4:3"],
            [3 / 4, "3:4"]
          ] as const).map(([value, label]) => <button key={label} className={aspect === value ? "active" : ""} onClick={() => changeAspect(value)}>{label}</button>)}</div>
          <div className="crop-actions">
            {canRestoreOriginal && <button className="button secondary" disabled={disabled} onClick={onRestoreOriginal}><RotateCcw size={16} />返回原图</button>}
            <button className="button primary" disabled={disabled || crop.width < 1 || crop.height < 1} onClick={() => onApplyCrop(normalizedCrop, aspect)}><Crop size={16} />应用主体裁切</button>
          </div>
          <p className="evidence-note">裁切会生成新的本地图片资产；返回原图会清除基于裁切几何生成的分析、OCR、主体分区与材料标注。</p>
        </div>
      </> : <>
        <div className="annotation-stage">
          <img src={imageUrl} alt="材料区域标注图片" width={1600} height={1200} draggable={false} />
          <div className="annotation-layer" onPointerDown={beginRegion} onPointerMove={moveRegion} onPointerUp={finishRegion}>
            {regions.map((region, index) => <button key={region.id} className={`material-region ${selectedId === region.id ? "active" : ""}`} style={{ ...normalizedRectStyle(region.rect), borderColor: region.colorHex, backgroundColor: `${region.colorHex}22` }} onPointerDown={(event) => event.stopPropagation()} onClick={() => setSelectedId(region.id)}>
              <span style={{ background: region.colorHex }}>{index + 1}</span><strong>{region.name}</strong>
            </button>)}
            {draftRect && !selectedId && <div className="material-region draft" style={{ ...normalizedRectStyle(draftRect), borderColor: colorHex, backgroundColor: `${colorHex}22` }} />}
          </div>
        </div>
        <p className="annotation-instruction">在图片上拖动框选材料区域，再填写区域信息。</p>
        <div className="region-editor">
          <div className="region-editor-heading"><strong>{selectedId ? "编辑材料区域" : "新材料区域"}</strong><button className="mini-icon-button" title="新增区域" aria-label="新增材料区域" onClick={resetRegionDraft}><Plus size={15} /></button></div>
          <label><span>区域名称</span><input name="material-region-name" autoComplete="off" value={name} onChange={(event) => setName(event.target.value)} placeholder="例如：主体皮面…" /></label>
          <div className="region-fields">
            <label><span>材料类别</span><select name="material-family" value={materialFamily} onChange={(event) => setMaterialFamily(event.target.value)}>{["皮革", "金属", "塑料", "织物", "木材", "玻璃/透明材质", "涂层/复合材料", "未知"].map((item) => <option key={item}>{item}</option>)}</select></label>
            <label><span>表面处理</span><select name="material-finish" value={finish} onChange={(event) => setFinish(event.target.value)}>{["哑光", "半哑光", "缎面", "亮光", "镜面", "拉丝", "纹理面", "未知"].map((item) => <option key={item}>{item}</option>)}</select></label>
          </div>
          <label><span>标注颜色</span><div className="region-color"><input name="material-color" aria-label="材料区域标注颜色" type="color" value={colorHex} onChange={(event) => setColorHex(event.target.value.toUpperCase())} /><code>{colorHex.toUpperCase()}</code></div></label>
          <label><span>备注</span><textarea name="material-region-note" autoComplete="off" rows={2} value={note} onChange={(event) => setNote(event.target.value)} placeholder="可见纹理、硬度或工艺线索…" /></label>
          <div className="region-actions">
            {selectedId && <button className="icon-button danger" title="删除区域" aria-label="删除材料区域" onClick={() => deleteRegion(selectedId)}><Trash2 size={16} /></button>}
            <button className="button primary" disabled={!draftRect || !name.trim()} onClick={saveRegion}>{selectedId ? <Save size={16} /> : <Check size={16} />}{selectedId ? "保存修改" : "添加标注"}</button>
          </div>
        </div>
        {regions.length > 0 && <div className="region-list">{regions.map((region, index) => <button key={region.id} className={selectedId === region.id ? "active" : ""} onClick={() => setSelectedId(region.id)}><i style={{ background: region.colorHex }} /><span><strong>{index + 1}. {region.name}</strong><small>{region.materialFamily} · {region.finish}</small></span></button>)}</div>}
      </>}
    </>}
  </section>;
}
