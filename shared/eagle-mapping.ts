import type { AnalysisArchiveRecord } from "./types";

export type EagleMappingEvidence = "确定" | "像素实测" | "分析候选" | "知识候选";

export interface EagleTagMapping {
  id: string;
  source: string;
  target: string;
  evidence: EagleMappingEvidence;
  selectedByDefault: boolean;
  detail: string;
}

const compact = (value: string): string => value.replace(/[\r\n]+/g, " ").replace(/\s+/g, " ").trim();
const tagSegment = (value: string): string => compact(value).replace(/[/\\]+/g, "-");

export function createArchiveEagleMappings(record: AnalysisArchiveRecord): EagleTagMapping[] {
  const { result } = record;
  const mappings: EagleTagMapping[] = [
    mapping("sync", "砚台档案", "同步/砚台", "确定", true, "标记该条目由砚台发送"),
    mapping("evidence-analysis", "结构化分析 JSON", "证据/视觉分析", "确定", true, "分析结果随 Eagle 注释保存")
  ];

  const extension = mimeExtension(result.measured.mimeType, result.source.fileName);
  if (extension) {
    mappings.push(mapping("file", result.measured.mimeType, `文件/${extension}`, "确定", true, "来自文件 MIME 类型"));
  }

  const sourceTag = result.source.kind === "web" || result.source.pageUrl || result.source.url
    ? "来源/网页"
    : "来源/本地导入";
  mappings.push(mapping("source", record.sourceLabel, sourceTag, "确定", true, "来自档案的导入方式"));

  result.measured.palette.slice(0, 3).forEach((color, index) => {
    mappings.push(mapping(
      `color-${index}`,
      `${color.hex} · ${Math.round(color.proportion * 100)}%`,
      `CMF/颜色/${color.hex.toUpperCase()}`,
      "像素实测",
      true,
      "来自图像像素聚类，不等同于实体色卡"
    ));
  });

  const category = compact(result.analysis.formStructure.category);
  if (category) {
    mappings.push(mapping("category", category, `产品/${tagSegment(category)}`, "分析候选", false, "模型对产品类别的推断，需人工勾选"));
  }

  (result.analysis.designIntelligence?.designLanguage ?? [])
    .slice(0, 4)
    .forEach((language, index) => mappings.push(mapping(
      `design-language-${index}`,
      `${language.term} · ${language.visualEvidence.join("；")}`,
      `设计语言/${tagSegment(language.term)}`,
      "分析候选",
      false,
      "由可见机制推断的设计语言，需人工确认"
    )));

  (result.analysis.designIntelligence?.designTechniques ?? [])
    .slice(0, 5)
    .forEach((technique, index) => mappings.push(mapping(
      `design-technique-${index}`,
      `${technique.technique} · ${technique.implementation}`,
      `设计手法/${tagSegment(technique.technique)}`,
      "分析候选",
      false,
      "由图片结构推断的设计手法，需人工确认"
    )));

  (result.analysis.designIntelligence?.recommendedDirections ?? [])
    .slice(0, 4)
    .forEach((direction, index) => mappings.push(mapping(
      `recommendation-${index}`,
      `${direction.name} · ${direction.rationale}`,
      `设计建议/${direction.directionType}/${tagSegment(direction.name)}`,
      "知识候选",
      false,
      "探索建议不是当前产品事实，仅在需要保留研究方向时勾选"
    )));

  uniqueValues((result.analysis.cmfAnalysis?.materialZones ?? []).flatMap((zone) => zone.likelyMaterialFamilies))
    .slice(0, 4)
    .forEach((material, index) => mappings.push(mapping(
      `material-${index}`,
      material,
      `CMF/材料/${tagSegment(material)}`,
      "分析候选",
      false,
      "单图无法确认真实材料，需人工勾选"
    )));

  uniqueValues((result.analysis.cmfAnalysis?.finishZones ?? []).map((zone) => zone.glossLevel))
    .slice(0, 3)
    .forEach((finish, index) => mappings.push(mapping(
      `finish-${index}`,
      finish,
      `CMF/表面/${tagSegment(finish)}`,
      "分析候选",
      false,
      "表面状态来自视觉推断，需人工勾选"
    )));

  return uniqueMappings(mappings);
}

export function createEagleAnnotation(record: AnalysisArchiveRecord): string {
  const result = record.result;
  const intelligence = result.analysis.designIntelligence;
  const category = compact(result.analysis.formStructure.category) || "未确认品类";
  const languages = uniqueValues((intelligence?.designLanguage ?? []).map((item) => item.term)).slice(0, 3);
  const techniques = uniqueValues((intelligence?.designTechniques ?? []).map((item) => item.technique)).slice(0, 4);
  const transferableRules = uniqueValues((intelligence?.designTechniques ?? []).map((item) => item.transferableRule)).slice(0, 3);
  const recommendations = uniqueValues((intelligence?.recommendedDirections ?? []).map((item) => (
    `${item.directionType}「${item.name}」：${item.rationale}`
  ))).slice(0, 3);
  const references = uniqueValues((intelligence?.referenceCandidates ?? []).map((item) => (
    `${item.referenceType}「${item.name}」：${item.relevance}（${item.evidenceType}）`
  ))).slice(0, 3);
  const colors = result.measured.palette.slice(0, 3).map((color) => formatColor(color));
  const pantones = uniqueValues((result.analysis.cmfAnalysis?.colorSystem?.roles ?? []).flatMap((role) => (
    role.pantoneCandidates.map((candidate) => `${candidate.name} ${candidate.coatedOrUncoated}`)
  ))).slice(0, 3);
  const materials = uniqueValues((result.analysis.cmfAnalysis?.materialZones ?? []).flatMap((zone) => zone.likelyMaterialFamilies)).slice(0, 4);
  const finishes = uniqueValues((result.analysis.cmfAnalysis?.finishZones ?? []).map((zone) => zone.glossLevel)).slice(0, 4);
  const observed = uniqueValues([
    ...(result.analysis.confidence.observedFacts ?? []),
    ...(intelligence?.evidenceBoundary?.observed ?? [])
  ]).slice(0, 3);
  const inferred = uniqueValues([
    ...(result.analysis.confidence.inferredDetails ?? []),
    ...(intelligence?.evidenceBoundary?.inferred ?? [])
  ]).slice(0, 3);
  const unknown = uniqueValues([
    ...(result.analysis.confidence.uncertainDetails ?? []),
    ...(intelligence?.evidenceBoundary?.unknown ?? [])
  ]).slice(0, 3);
  const sourceUrl = getEagleWebsite(record);
  return [
    "设计摘要",
    `产品：${record.title} / ${category}`,
    `核心设计语言：${languages.join("、") || "未形成有依据的判断"}`,
    `关键设计手法：${techniques.join("、") || "未形成有依据的判断"}`,
    "",
    bulletSection("可借鉴", transferableRules),
    [
      "CMF",
      `颜色：${colors.join("；") || "未提取"}`,
      `材料：${materials.join("、") || "待确认"}`,
      `表面：${finishes.join("、") || "待确认"}`,
      `潘通候选：${pantones.join("、") || "无可靠候选"}（需实体色样验证）`
    ].join("\n"),
    bulletSection("建议探索", recommendations),
    bulletSection("参考候选", references),
    [
      "证据边界",
      `观察：${observed.join("；") || "未记录"}`,
      `推断：${inferred.join("；") || "未记录"}`,
      `未知：${unknown.join("；") || "材料、工艺、不可见结构与真实设计来源"}`
    ].join("\n"),
    `来源：${sourceUrl || "未记录"}`,
    `砚台置信度：${formatConfidence(result.analysis.confidence.overall)}`
  ].filter(Boolean).join("\n");
}

export function getEagleWebsite(record: AnalysisArchiveRecord): string | undefined {
  const source = record.result.source;
  if (isHttpUrl(source.pageUrl)) return source.pageUrl;
  if (isHttpUrl(source.url)) return source.url;
  return undefined;
}

export function selectedEagleTags(mappings: EagleTagMapping[], selectedIds: Iterable<string>): string[] {
  const selected = new Set(selectedIds);
  return uniqueValues(mappings.filter((item) => selected.has(item.id)).map((item) => item.target));
}

function mapping(
  id: string,
  source: string,
  target: string,
  evidence: EagleMappingEvidence,
  selectedByDefault: boolean,
  detail: string
): EagleTagMapping {
  return { id, source, target: compact(target), evidence, selectedByDefault, detail };
}

function mimeExtension(mimeType: string, fileName?: string): string {
  const fromMime = mimeType.split("/")[1]?.split(/[;+]/)[0]?.toUpperCase();
  if (fromMime) return fromMime === "JPEG" ? "JPG" : fromMime;
  const fromName = fileName?.split(".").pop()?.toUpperCase();
  return fromName || "";
}

function uniqueMappings(mappings: EagleTagMapping[]): EagleTagMapping[] {
  const seen = new Set<string>();
  return mappings.filter((item) => {
    const key = item.target.toLocaleLowerCase("zh-CN");
    if (!item.target || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function uniqueValues(values: string[]): string[] {
  const seen = new Set<string>();
  return values.map(compact).filter((value) => {
    const key = value.toLocaleLowerCase("zh-CN");
    if (!value || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function isHttpUrl(value?: string): value is string {
  return Boolean(value && /^https?:\/\//i.test(value));
}

function bulletSection(title: string, values: string[]): string {
  return values.length ? `${title}\n${values.map((value, index) => `${index + 1}. ${value}`).join("\n")}` : "";
}

function formatColor(color: AnalysisArchiveRecord["result"]["measured"]["palette"][number]): string {
  const rgb = color.rgb ? `RGB ${color.rgb.r},${color.rgb.g},${color.rgb.b}` : "RGB 未记录";
  const cmyk = color.cmyk ? `CMYK ${color.cmyk.c},${color.cmyk.m},${color.cmyk.y},${color.cmyk.k}` : "CMYK 未记录";
  return `${color.hex.toUpperCase()} / ${rgb} / ${cmyk}`;
}

function formatConfidence(value?: number): string {
  return Number.isFinite(value) ? `${Math.round(value! * 100)}%` : "未记录";
}
