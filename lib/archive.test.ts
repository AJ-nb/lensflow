import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import {
  archiveIdForResult,
  clearAnalysisArchives,
  clearPromptVersions,
  deleteAnalysisArchive,
  deletePromptVersion,
  exportArchiveData,
  importArchiveData,
  listAnalysisArchives,
  listPromptVersions,
  saveAnalysisArchive,
  savePromptVersion,
  setAnalysisArchiveEagleSync,
  setAnalysisArchiveFavorite
} from "./archive";
import type { AnalysisArchiveRecord, AnalysisResult, PromptVersionRecord } from "../shared/types";

const createdAt = "2026-08-13T08:00:00.000Z";

const result = {
  schemaVersion: "1.2",
  generatedAt: "2026-08-11T10:00:00.000Z",
  model: "test-model",
  source: { id: "source", kind: "upload", fileName: "sample.png" },
  measured: {
    width: 100,
    height: 100,
    aspectRatio: "1:1",
    sha256: "a".repeat(64),
    orientation: "square",
    mimeType: "image/png",
    palette: []
  },
  reconstructionDirective: "",
  analysis: { title: "测试档案" },
  previewDataUrl: "data:image/png;base64,AA=="
} as unknown as AnalysisResult;

function analysis(id: string, updatedAt: string, title = id): AnalysisArchiveRecord {
  return { id, updatedAt, generatedAt: createdAt, title } as AnalysisArchiveRecord;
}

function prompt(id: string): PromptVersionRecord {
  return {
    id,
    sha256: "a".repeat(64),
    createdAt,
    label: id,
    positivePrompt: "正向",
    negativePrompt: "负向",
    reconstructionDirective: "结构"
  };
}

beforeEach(async () => {
  await Promise.all([clearAnalysisArchives(), clearPromptVersions()]);
});

describe("local design archive", () => {
  it("saves, updates and restores the same stable record", async () => {
    const first = await saveAnalysisArchive(result);
    await setAnalysisArchiveFavorite(first.id, true);
    await saveAnalysisArchive({ ...result, reconstructionDirective: "保留扣件" });

    const records = await listAnalysisArchives();
    expect(records).toHaveLength(1);
    expect(records[0]?.favorite).toBe(true);
    expect(records[0]?.result.reconstructionDirective).toBe("保留扣件");
    expect(records[0]?.id).toBe(archiveIdForResult(result));
  });

  it("deletes a selected record", async () => {
    const saved = await saveAnalysisArchive(result);
    await deleteAnalysisArchive(saved.id);
    await expect(listAnalysisArchives()).resolves.toEqual([]);
  });

  it("preserves verified Eagle sync metadata when the analysis is saved again", async () => {
    const saved = await saveAnalysisArchive(result);
    await setAnalysisArchiveEagleSync(saved.id, {
      itemId: "eagle-item",
      folderId: "folder",
      tags: ["同步/视觉透镜"],
      syncedAt: "2026-08-12T12:00:00.000Z",
      verified: true
    });
    await saveAnalysisArchive({ ...result, reconstructionDirective: "再次保存" });
    await expect(listAnalysisArchives()).resolves.toMatchObject([{
      eagleSync: { itemId: "eagle-item", verified: true }
    }]);
  });

  it("keeps prompt versions separate from analysis snapshots", async () => {
    const first = await savePromptVersion({
      sha256: result.measured.sha256,
      label: "结构强化",
      positivePrompt: "保留主体比例",
      negativePrompt: "避免形变",
      reconstructionDirective: "保持扣件"
    });
    await savePromptVersion({
      sha256: result.measured.sha256,
      label: "CMF 调整",
      positivePrompt: "降低皮革光泽",
      negativePrompt: "避免塑料感",
      reconstructionDirective: ""
    });

    const versions = await listPromptVersions(result.measured.sha256);
    expect(versions).toHaveLength(2);
    expect(versions.map((item) => item.label)).toEqual(expect.arrayContaining(["结构强化", "CMF 调整"]));
    await deletePromptVersion(first.id);
    await expect(listPromptVersions(result.measured.sha256)).resolves.toHaveLength(1);
  });
});

describe("archive backup import", () => {
  it("merges by ID, updates only newer analyses and skips duplicate prompts", async () => {
    await importArchiveData({
      analyses: [analysis("same", "2026-08-13T09:00:00.000Z", "本地较新")],
      promptVersions: [prompt("prompt-same")]
    }, "replace");

    const summary = await importArchiveData({
      analyses: [
        analysis("same", "2026-08-13T08:30:00.000Z", "备份较旧"),
        analysis("new", "2026-08-13T10:00:00.000Z", "新增")
      ],
      promptVersions: [prompt("prompt-same"), prompt("prompt-new")]
    }, "merge");
    const data = await exportArchiveData();

    expect(summary).toMatchObject({
      analysesAdded: 1,
      analysesUpdated: 0,
      analysesSkipped: 1,
      promptVersionsAdded: 1,
      promptVersionsSkipped: 1
    });
    expect(data.analyses.find((record) => record.id === "same")?.title).toBe("本地较新");
    expect(data.analyses).toHaveLength(2);
    expect(data.promptVersions).toHaveLength(2);
  });

  it("replaces all prior archive data and deduplicates backup records", async () => {
    await importArchiveData({ analyses: [analysis("old", createdAt)], promptVersions: [prompt("old-prompt")] }, "replace");
    const summary = await importArchiveData({
      analyses: [
        analysis("new", "2026-08-13T08:00:00.000Z", "较旧副本"),
        analysis("new", "2026-08-13T09:00:00.000Z", "较新副本")
      ],
      promptVersions: [prompt("new-prompt"), prompt("new-prompt")]
    }, "replace");
    const data = await exportArchiveData();

    expect(summary.analysesAdded).toBe(1);
    expect(summary.promptVersionsAdded).toBe(1);
    expect(data.analyses.map((record) => record.id)).toEqual(["new"]);
    expect(data.analyses[0]?.title).toBe("较新副本");
    expect(data.promptVersions.map((record) => record.id)).toEqual(["new-prompt"]);
  });
});
