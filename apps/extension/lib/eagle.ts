import type { AnalysisArchiveRecord } from "../shared/types";

const EAGLE_API = "http://localhost:41595";
const REQUEST_TIMEOUT_MS = 8_000;
const IMPORT_VERIFY_ATTEMPTS = 16;
const IMPORT_VERIFY_DELAY_MS = 250;
const EAGLE_PAGE_SIZE = 200;

export interface EagleFolder {
  id: string;
  name: string;
  children?: EagleFolder[];
}

export interface EagleConnectionInfo {
  connected: true;
  version: string;
  build: string;
  libraryName: string;
  libraryPath: string;
  itemCount: number;
  writable: boolean;
  folders: EagleFolder[];
}

export interface EagleImportInput {
  record: AnalysisArchiveRecord;
  dataUrl: string;
  folderId?: string;
  tags: string[];
  annotation: string;
  website?: string;
}

export interface EagleImportResult {
  itemId: string;
  name: string;
  tags: string[];
  folders: string[];
  website?: string;
}

export interface EagleWorkImportInput {
  name: string;
  sourceUrl: string;
  folderId?: string;
  tags: string[];
  annotation: string;
}

interface EagleEnvelope<T> {
  status?: string;
  success?: boolean;
  data: T;
  error?: string;
  message?: string;
  totalCount?: number;
}

export async function connectToEagle(): Promise<EagleConnectionInfo> {
  try {
    const [application, library, folders, items] = await Promise.all([
      eagleGet<Record<string, unknown>>("/api/application/info"),
      eagleGet<Record<string, unknown>>("/api/library/info"),
      eagleGet<EagleFolder[]>("/api/folder/list"),
      listAllEagleItems()
    ]);
    const appData = unwrapObject(application.data);
    const libraryData = unwrapObject(library.data);
    const nestedLibrary = unwrapObject(libraryData.library);
    return {
      connected: true,
      version: stringValue(appData.version || appData.applicationVersion || libraryData.applicationVersion),
      build: stringValue(appData.build || appData.buildVersion),
      libraryName: stringValue(libraryData.name || nestedLibrary.name),
      libraryPath: stringValue(libraryData.path || nestedLibrary.path),
      itemCount: items.length,
      writable: true,
      folders: Array.isArray(folders.data) ? folders.data : []
    };
  } catch (error) {
    throw new Error(`无法连接 Eagle。请确认 Eagle 已启动且本地 API 为 ${EAGLE_API}。${errorMessage(error)}`);
  }
}

export async function importArchiveToEagle(input: EagleImportInput): Promise<EagleImportResult> {
  if (!input.dataUrl.startsWith("data:image/")) throw new Error("当前档案没有可导入的图片数据。");
  const name = input.record.title || input.record.result.source.fileName || "Lensflow 分析";
  const existing = await listAllEagleItems();
  const existingIds = new Set(existing.map((item) => item.id));

  await eaglePost("/api/item/addFromURL", {
    url: input.dataUrl,
    name,
    website: input.website,
    tags: input.tags,
    annotation: input.annotation,
    folderIds: input.folderId ? [input.folderId] : []
  });

  const saved = await waitForImportedItem(existingIds, name);
  if (input.website && saved.url !== input.website) {
    throw new Error(`Eagle 条目已创建，但来源网站回读不一致。预期 ${input.website}，实际 ${saved.url || "空"}。`);
  }
  if (saved.annotation !== input.annotation) throw new Error("Eagle 条目已创建，但设计分析注释回读不一致。");
  const missingTags = input.tags.filter((tag) => !saved.tags?.includes(tag));
  if (missingTags.length) throw new Error(`Eagle 条目已创建，但缺少标签：${missingTags.join("、")}。`);
  if (input.folderId && !saved.folders?.includes(input.folderId)) throw new Error("Eagle 条目已创建，但目标文件夹回读不一致。");
  return {
    itemId: saved.id,
    name: saved.name,
    tags: saved.tags ?? [],
    folders: saved.folders ?? [],
    website: saved.url
  };
}

export async function importGeneratedWorkToEagle(input: EagleWorkImportInput): Promise<EagleImportResult> {
  if (!/^(?:data:image\/|https?:\/\/)/i.test(input.sourceUrl)) throw new Error("当前结果没有可导入的图片数据。");
  const existing = await listAllEagleItems();
  const existingIds = new Set(existing.map((item) => item.id));
  await eaglePost("/api/item/addFromURL", {
    url: input.sourceUrl,
    name: input.name,
    tags: input.tags,
    annotation: input.annotation,
    folderIds: input.folderId ? [input.folderId] : []
  });
  const saved = await waitForImportedItem(existingIds, input.name);
  if (saved.annotation !== input.annotation) throw new Error("Eagle 条目已创建，但创作元数据回读不一致。");
  const missingTags = input.tags.filter((tag) => !saved.tags?.includes(tag));
  if (missingTags.length) throw new Error(`Eagle 条目已创建，但缺少标签：${missingTags.join("、")}。`);
  if (input.folderId && !saved.folders?.includes(input.folderId)) throw new Error("Eagle 条目已创建，但目标文件夹回读不一致。");
  return {
    itemId: saved.id,
    name: saved.name,
    tags: saved.tags ?? [],
    folders: saved.folders ?? [],
    website: saved.url
  };
}

interface EagleSavedItem {
  id: string;
  name: string;
  tags?: string[];
  folders?: string[];
  url?: string;
  annotation?: string;
}

async function waitForImportedItem(existingIds: Set<string>, expectedName: string): Promise<EagleSavedItem> {
  for (let attempt = 0; attempt < IMPORT_VERIFY_ATTEMPTS; attempt += 1) {
    const items = await listAllEagleItems();
    const saved = items.find((item) => !existingIds.has(item.id) && item.name === expectedName);
    if (saved) return saved;
    if (attempt < IMPORT_VERIFY_ATTEMPTS - 1) await delay(IMPORT_VERIFY_DELAY_MS);
  }
  throw new Error("Eagle 已接收导入请求，但未在时限内找到新条目，无法完成回读验证。");
}

async function listAllEagleItems(): Promise<EagleSavedItem[]> {
  const items: EagleSavedItem[] = [];
  for (let offset = 0; ; offset += 1) {
    const page = await eagleGet<EagleSavedItem[]>(`/api/item/list?limit=${EAGLE_PAGE_SIZE}&offset=${offset}`);
    items.push(...page.data);
    if (page.data.length < EAGLE_PAGE_SIZE) return items;
  }
}

async function eaglePost<T>(path: string, payload: unknown): Promise<EagleEnvelope<T>> {
  const response = await fetchWithTimeout(`${EAGLE_API}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  if (!response.ok) throw new Error(`Eagle HTTP ${response.status}`);
  const body = await response.json() as EagleEnvelope<T>;
  if (body.status && body.status !== "success") throw new Error(body.error || body.message || "Eagle 请求失败。");
  return body;
}

async function eagleGet<T>(path: string): Promise<EagleEnvelope<T>> {
  const response = await fetchWithTimeout(`${EAGLE_API}${path}`);
  if (!response.ok) throw new Error(`Eagle HTTP ${response.status}`);
  const body = await response.json() as EagleEnvelope<T>;
  if (body.status && body.status !== "success") throw new Error(body.error || body.message || "Eagle 请求失败。");
  return body;
}

function fetchWithTimeout(input: string, init: RequestInit = {}): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  return fetch(input, { ...init, signal: controller.signal }).finally(() => clearTimeout(timer));
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function unwrapObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function stringValue(value: unknown): string {
  return typeof value === "string" || typeof value === "number" ? String(value) : "未知";
}

function errorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error || "");
  return message ? ` 详情：${message}` : "";
}
