import { afterEach, describe, expect, it, vi } from "vitest";
import { connectToEagle, importArchiveToEagle, importGeneratedWorkToEagle } from "./eagle";
import type { AnalysisArchiveRecord } from "../shared/types";

afterEach(() => vi.unstubAllGlobals());

describe("Eagle bridge", () => {
  it("reads Eagle library state and enables the official write API", async () => {
    vi.stubGlobal("fetch", vi.fn(async (input: string) => {
      if (input.includes("application/info")) return json({ status: "success", data: { version: "4.0.0", build: "20260401" } });
      if (input.includes("library/info")) return json({ status: "success", data: { library: { name: "设计参考", path: "E:/library" } } });
      if (input.includes("folder/list")) return json({ status: "success", data: [{ id: "folder", name: "项圈参考" }] });
      if (input.includes("offset=0")) return json({ status: "success", data: Array.from({ length: 200 }, (_, index) => ({ id: `item-${index}` })) });
      if (input.includes("offset=1")) return json({ status: "success", data: Array.from({ length: 200 }, (_, index) => ({ id: `item-${index + 200}` })) });
      if (input.includes("offset=2")) return json({ status: "success", data: Array.from({ length: 200 }, (_, index) => ({ id: `item-${index + 400}` })) });
      return json({ status: "success", data: Array.from({ length: 122 }, (_, index) => ({ id: `item-${index + 600}` })) });
    }));
    await expect(connectToEagle()).resolves.toMatchObject({
      version: "4.0.0",
      build: "20260401",
      libraryName: "设计参考",
      itemCount: 722,
      writable: true
    });
  });

  it("imports and verifies an Eagle item", async () => {
    let listCalls = 0;
    const fetchMock = vi.fn(async (input: string, init?: RequestInit) => {
      if (input.includes("/api/item/list")) {
        listCalls += 1;
        if (listCalls === 1) return json({ status: "success", data: [{ id: "existing", name: "旧条目" }] });
        return json({ status: "success", data: [{ id: "item-1", name: "测试", tags: ["同步/视觉透镜"], folders: ["folder"], url: "https://example.com/source", annotation: "分析" }] });
      }
      expect(JSON.parse(String(init?.body))).toMatchObject({
        name: "测试",
        website: "https://example.com/source",
        folderIds: ["folder"]
      });
      return json({ status: "success", data: {} });
    });
    vi.stubGlobal("fetch", fetchMock);
    const record = { id: "record", title: "测试", result: { source: {} } } as AnalysisArchiveRecord;
    const output = await importArchiveToEagle({
      record,
      dataUrl: "data:image/png;base64,AA==",
      folderId: "folder",
      tags: ["同步/视觉透镜"],
      annotation: "分析",
      website: "https://example.com/source"
    });
    expect(output).toEqual({ itemId: "item-1", name: "测试", tags: ["同步/视觉透镜"], folders: ["folder"], website: "https://example.com/source" });
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("fails verification when Eagle does not persist the source website", async () => {
    let listCalls = 0;
    vi.stubGlobal("fetch", vi.fn(async (input: string) => {
      if (input.includes("/api/item/list")) {
        listCalls += 1;
        return json({ status: "success", data: listCalls === 1 ? [] : [{ id: "item-1", name: "测试", url: "", annotation: "分析" }] });
      }
      return json({ status: "success", data: {} });
    }));
    const record = { id: "record", title: "测试", result: { source: {} } } as AnalysisArchiveRecord;
    await expect(importArchiveToEagle({
      record,
      dataUrl: "data:image/png;base64,AA==",
      tags: [],
      annotation: "分析",
      website: "https://example.com/source"
    })).rejects.toThrow("来源网站回读不一致");
  });

  it("imports a generated work and verifies tags, folder and metadata", async () => {
    let listCalls = 0;
    vi.stubGlobal("fetch", vi.fn(async (input: string, init?: RequestInit) => {
      if (input.includes("/api/item/list")) {
        listCalls += 1;
        return json({ status: "success", data: listCalls === 1 ? [] : [{
          id: "generated-1",
          name: "Lensflow 结果",
          tags: ["同步/Lensflow", "模型/image"],
          folders: ["works"],
          annotation: "提示词：测试"
        }] });
      }
      expect(JSON.parse(String(init?.body))).toMatchObject({
        name: "Lensflow 结果",
        tags: ["同步/Lensflow", "模型/image"],
        folderIds: ["works"],
        annotation: "提示词：测试"
      });
      return json({ status: "success", data: {} });
    }));
    await expect(importGeneratedWorkToEagle({
      name: "Lensflow 结果",
      sourceUrl: "data:image/png;base64,AA==",
      folderId: "works",
      tags: ["同步/Lensflow", "模型/image"],
      annotation: "提示词：测试"
    })).resolves.toMatchObject({ itemId: "generated-1", folders: ["works"] });
  });
});

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}
