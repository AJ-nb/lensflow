import Dexie, { type EntityTable } from "dexie";
import type { AssetRecord } from "@lensflow/contracts";
import type { AnalysisArchiveRecord, AnalysisResult, PromptVersionRecord, SimilarArchiveMatch } from "../shared/types";
import { computeDifferenceHash, rankArchiveHashes } from "./similarity";
import { LensflowDatabase, recordHistory } from "@lensflow/core";

const MAX_UNFAVORITED_RECORDS = 100;

class VisualLensDatabase extends Dexie {
  analyses!: EntityTable<AnalysisArchiveRecord, "id">;
  promptVersions!: EntityTable<PromptVersionRecord, "id">;

  constructor() {
    super("visual-lens-design-archive");
    this.version(1).stores({
      analyses: "id, generatedAt, updatedAt, favorite, sha256, title, model"
    });
    this.version(2).stores({
      analyses: "id, generatedAt, updatedAt, favorite, sha256, title, model",
      promptVersions: "id, sha256, createdAt, label"
    });
  }
}

const database = new VisualLensDatabase();
const lensflowDatabase = new LensflowDatabase();

export type ArchiveImportMode = "merge" | "replace";

export interface ArchiveData {
  analyses: AnalysisArchiveRecord[];
  promptVersions: PromptVersionRecord[];
}

export interface ArchiveImportSummary {
  mode: ArchiveImportMode;
  analysesAdded: number;
  analysesUpdated: number;
  analysesSkipped: number;
  promptVersionsAdded: number;
  promptVersionsSkipped: number;
}

export function archiveIdForResult(result: AnalysisResult): string {
  return `${result.measured.sha256}:${result.generatedAt}`;
}

export async function saveAnalysisArchive(result: AnalysisResult): Promise<AnalysisArchiveRecord> {
  const id = archiveIdForResult(result);
  const existing = await database.analyses.get(id);
  const record: AnalysisArchiveRecord = {
    id,
    generatedAt: result.generatedAt,
    updatedAt: new Date().toISOString(),
    title: result.analysis.title || "未命名分析",
    sha256: result.measured.sha256,
    model: result.model,
    sourceLabel: getSourceLabel(result),
    favorite: existing?.favorite ?? false,
    tags: existing?.tags ?? [],
    result,
    perceptualHash: existing?.perceptualHash,
    eagleSync: existing?.eagleSync
  };
  await Promise.all([database.analyses.put(record), syncAnalysisToLensflow(record)]);
  await pruneArchive();
  return record;
}

async function syncAnalysisToLensflow(record: AnalysisArchiveRecord): Promise<void> {
  const result = record.result;
  const captureId = result.source.id;
  const captureAssetId = `capture:${captureId}`;
  const promptId = `prompt:${record.id}`;
  // Legacy archives can predate reconstruction prompts. Their measured image
  // and analysis remain useful, so mirror those records without inventing an
  // empty prompt asset.
  const reconstruction = result.analysis.reconstruction;
  const promptText = reconstruction?.positivePrompt?.trim() ?? "";
  const now = record.updatedAt;
  await lensflowDatabase.transaction("rw", [
    lensflowDatabase.captures,
    lensflowDatabase.analyses,
    lensflowDatabase.prompts,
    lensflowDatabase.references,
    lensflowDatabase.assets,
    lensflowDatabase.historyEvents
  ], async () => {
    await lensflowDatabase.captures.put({
      id: captureId,
      sourceUrl: result.source.url,
      pageUrl: result.source.pageUrl,
      dataUrl: result.previewDataUrl,
      width: result.measured.width,
      height: result.measured.height,
      sha256: result.measured.sha256,
      createdAt: result.generatedAt
    });
    await lensflowDatabase.analyses.put({
      id: record.id,
      assetId: captureAssetId,
      captureId,
      mode: "deep",
      state: "partial",
      providerId: "legacy",
      model: result.model,
      rawResponse: result.analysis,
      error: "旧高级分析已保留；运行 Lensflow 快速分析可生成 v2 双语提示词与证据字段。",
      createdAt: result.generatedAt,
      updatedAt: now
    });
    const assets: AssetRecord[] = [{
      id: captureAssetId,
      kind: "capture" as const,
      name: record.title,
      dataUrl: result.previewDataUrl,
      metadata: {
        captureId,
        sha256: result.measured.sha256,
        width: { value: result.measured.width, source: "measured" },
        height: { value: result.measured.height, source: "measured" },
        aspectRatio: { value: result.measured.aspectRatio, source: "measured" },
        palette: { value: result.measured.palette.map((color) => ({ hex: color.hex, proportion: color.proportion })), source: "measured" },
        analysisId: record.id
      },
      createdAt: result.generatedAt,
      updatedAt: now
    }];
    if (promptText) {
      assets.push({
        id: promptId,
        kind: "prompt" as const,
        name: `${record.title} 提示词`,
        prompt: promptText,
        metadata: { captureId, analysisId: record.id, negativePrompt: reconstruction?.negativePrompt ?? "" },
        createdAt: result.generatedAt,
        updatedAt: now
      });
    }
    await lensflowDatabase.assets.bulkPut(assets);
    if (promptText) {
      await lensflowDatabase.prompts.put({
        id: promptId,
        text: promptText,
        negativeText: reconstruction?.negativePrompt ?? "",
        language: "zh",
        sourceAssetId: captureAssetId,
        sourceAnalysisId: record.id,
        model: result.model,
        kind: "prompt",
        createdAt: result.generatedAt,
        updatedAt: now
      });
    }
    if (result.references?.length) {
      await lensflowDatabase.references.bulkPut(result.references.map((reference) => ({
        id: reference.id,
        kind: "image" as const,
        name: `${record.title} · ${reference.viewKind}`,
        previewUrl: reference.source.url,
        dataUrl: reference.source.dataUrl,
        enabled: true,
        createdAt: reference.createdAt
      })));
    }
    await recordHistory(lensflowDatabase, "analysis.completed", `已完成“${record.title}”的本地测量与结构化解构`, record.id);
  });
  const channel = new BroadcastChannel("lensflow-local-events");
  channel.postMessage({ type: "changed" });
  channel.close();
}

export async function listAnalysisArchives(): Promise<AnalysisArchiveRecord[]> {
  const records = await database.analyses.orderBy("generatedAt").reverse().toArray();
  return records.sort((left, right) => Number(right.favorite) - Number(left.favorite));
}

export async function deleteAnalysisArchive(id: string): Promise<void> {
  await database.analyses.delete(id);
}

export async function setAnalysisArchiveFavorite(id: string, favorite: boolean): Promise<void> {
  await database.analyses.update(id, { favorite, updatedAt: new Date().toISOString() });
}

export async function setAnalysisArchiveEagleSync(
  id: string,
  eagleSync: NonNullable<AnalysisArchiveRecord["eagleSync"]>
): Promise<void> {
  await database.analyses.update(id, { eagleSync, updatedAt: new Date().toISOString() });
}

export async function clearAnalysisArchives(): Promise<void> {
  await database.analyses.clear();
}

export async function listPromptVersions(sha256: string): Promise<PromptVersionRecord[]> {
  const records = await database.promptVersions.where("sha256").equals(sha256).toArray();
  return records.sort((left, right) => right.createdAt.localeCompare(left.createdAt));
}

export async function listAllPromptVersions(): Promise<PromptVersionRecord[]> {
  const records = await database.promptVersions.toArray();
  return records.sort((left, right) => right.createdAt.localeCompare(left.createdAt));
}

export async function exportArchiveData(): Promise<ArchiveData> {
  const [analyses, promptVersions] = await Promise.all([
    database.analyses.toArray(),
    database.promptVersions.toArray()
  ]);
  return { analyses, promptVersions };
}

export async function importArchiveData(data: ArchiveData, mode: ArchiveImportMode): Promise<ArchiveImportSummary> {
  return database.transaction("rw", database.analyses, database.promptVersions, async () => {
    const uniqueAnalyses = uniqueNewestAnalyses(data.analyses);
    const uniquePrompts = Array.from(new Map(data.promptVersions.map((record) => [record.id, record])).values());
    if (mode === "replace") {
      await Promise.all([database.analyses.clear(), database.promptVersions.clear()]);
      if (uniqueAnalyses.length) await database.analyses.bulkPut(uniqueAnalyses);
      if (uniquePrompts.length) await database.promptVersions.bulkPut(uniquePrompts);
      return {
        mode,
        analysesAdded: uniqueAnalyses.length,
        analysesUpdated: 0,
        analysesSkipped: 0,
        promptVersionsAdded: uniquePrompts.length,
        promptVersionsSkipped: 0
      };
    }

    const existingAnalyses = new Map(
      (await database.analyses.bulkGet(data.analyses.map((record) => record.id)))
        .filter((record): record is AnalysisArchiveRecord => Boolean(record))
        .map((record) => [record.id, record])
    );
    const analysesToPut: AnalysisArchiveRecord[] = [];
    let analysesAdded = 0;
    let analysesUpdated = 0;
    let analysesSkipped = 0;
    for (const record of uniqueAnalyses) {
      const existing = existingAnalyses.get(record.id);
      if (!existing) {
        analysesAdded += 1;
        analysesToPut.push(record);
      } else if (record.updatedAt > existing.updatedAt) {
        analysesUpdated += 1;
        analysesToPut.push(record);
      } else {
        analysesSkipped += 1;
      }
    }
    if (analysesToPut.length) await database.analyses.bulkPut(analysesToPut);

    const existingPrompts = await database.promptVersions.bulkGet(uniquePrompts.map((record) => record.id));
    const promptsToAdd = uniquePrompts.filter((_, index) => !existingPrompts[index]);
    if (promptsToAdd.length) await database.promptVersions.bulkAdd(promptsToAdd);

    return {
      mode,
      analysesAdded,
      analysesUpdated,
      analysesSkipped,
      promptVersionsAdded: promptsToAdd.length,
      promptVersionsSkipped: uniquePrompts.length - promptsToAdd.length
    };
  });
}

export async function savePromptVersion(input: Omit<PromptVersionRecord, "id" | "createdAt">): Promise<PromptVersionRecord> {
  const createdAt = new Date().toISOString();
  const record: PromptVersionRecord = {
    ...input,
    id: `${input.sha256}:${createdAt}:${crypto.randomUUID()}`,
    createdAt
  };
  await database.promptVersions.add(record);
  return record;
}

export async function deletePromptVersion(id: string): Promise<void> {
  await database.promptVersions.delete(id);
}

export async function clearPromptVersions(): Promise<void> {
  await database.promptVersions.clear();
}

export async function findSimilarAnalysisArchives(imageDataUrl: string, limit = 12): Promise<SimilarArchiveMatch[]> {
  const queryHash = await computeDifferenceHash(imageDataUrl);
  const records = await database.analyses.toArray();
  await Promise.all(records.map(async (record) => {
    if (record.perceptualHash) return;
    try {
      record.perceptualHash = await computeDifferenceHash(record.result.previewDataUrl);
      await database.analyses.update(record.id, { perceptualHash: record.perceptualHash });
    } catch {
      // A damaged legacy preview should not block other local matches.
    }
  }));
  return rankArchiveHashes(queryHash, records).slice(0, Math.max(1, limit));
}

async function pruneArchive(): Promise<void> {
  const records = await database.analyses.orderBy("generatedAt").reverse().toArray();
  const removable = records.filter((record) => !record.favorite).slice(MAX_UNFAVORITED_RECORDS);
  if (removable.length) await database.analyses.bulkDelete(removable.map((record) => record.id));
}

function uniqueNewestAnalyses(records: AnalysisArchiveRecord[]): AnalysisArchiveRecord[] {
  const newest = new Map<string, AnalysisArchiveRecord>();
  for (const record of records) {
    const current = newest.get(record.id);
    if (!current || record.updatedAt > current.updatedAt) newest.set(record.id, record);
  }
  return Array.from(newest.values());
}

function getSourceLabel(result: AnalysisResult): string {
  return result.source.pageTitle
    || result.source.fileName
    || result.source.url
    || result.source.pageUrl
    || (result.source.kind === "upload" ? "本地图片" : "网页图片");
}
