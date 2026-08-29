import { beforeEach, describe, expect, it, vi } from "vitest";
import { prepareImage } from "./image";
import { analyzeOverviewWithOpenAI, analyzeWithOpenAI, editWithOpenAI } from "./openai";
import { runImageAnalysis, runImageEdit, runImageOverview } from "./operations";
import { DEFAULT_SETTINGS, type ImageSource, type MeasuredImageData } from "../shared/types";

vi.mock("./image", () => ({
  prepareImage: vi.fn()
}));

vi.mock("./openai", () => ({
  analyzeWithOpenAI: vi.fn(),
  analyzeOverviewWithOpenAI: vi.fn(),
  editWithOpenAI: vi.fn(),
  generateThreeViewWithOpenAI: vi.fn()
}));

const source: ImageSource = {
  id: "uploaded-image",
  kind: "upload",
  dataUrl: "data:image/png;base64,AA==",
  fileName: "source.png"
};
const measured: MeasuredImageData = {
  width: 1280,
  height: 960,
  aspectRatio: "4:3",
  sha256: "a".repeat(64),
  orientation: "landscape",
  mimeType: "image/png",
  palette: []
};
const blob = new Blob([new Uint8Array([0])], { type: "image/png" });

describe("side panel operations", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(prepareImage).mockResolvedValue({
      blob,
      dataUrl: "data:image/png;base64,AA==",
      measured
    });
  });

  it("在快速模式中缩放图片并组装可持久化分析结果", async () => {
    const analysis = { subject: { primary: "测试主体" } } as never;
    vi.mocked(analyzeWithOpenAI).mockResolvedValue(analysis);

    const result = await runImageAnalysis(DEFAULT_SETTINGS, source, "  保留金色扣件  ");

    expect(prepareImage).toHaveBeenCalledWith(source, { maxEdge: 1280 });
    expect(analyzeWithOpenAI).toHaveBeenCalledWith(
      DEFAULT_SETTINGS,
      "data:image/png;base64,AA==",
      source,
      measured,
      "保留金色扣件",
      {}
    );
    expect(result).toMatchObject({
      schemaVersion: "1.2",
      stage: "complete",
      model: DEFAULT_SETTINGS.analysisModel,
      measured,
      reconstructionDirective: "保留金色扣件",
      analysis
    });
    expect(result.source).not.toHaveProperty("dataUrl");
  });

  it("先生成轻量概览并复用其本地图像数据生成完整分析", async () => {
    const overview = { title: "快速概览" } as never;
    const analysis = { subject: { primary: "测试主体" } } as never;
    vi.mocked(analyzeOverviewWithOpenAI).mockResolvedValue(overview);
    vi.mocked(analyzeWithOpenAI).mockResolvedValue(analysis);

    const preview = await runImageOverview(DEFAULT_SETTINGS, source);
    const complete = await runImageAnalysis(DEFAULT_SETTINGS, source, "", preview);

    expect(preview).toMatchObject({ stage: "overview", overview, measured });
    expect(complete).toMatchObject({ stage: "complete", analysis, measured });
    expect(prepareImage).toHaveBeenCalledTimes(1);
    expect(analyzeWithOpenAI).toHaveBeenCalledWith(
      DEFAULT_SETTINGS,
      preview.previewDataUrl,
      source,
      measured,
      "",
      expect.objectContaining({ overview })
    );
  });

  it("平衡和深度模式重新准备高分辨率图片", async () => {
    const preview = { previewDataUrl: "data:image/png;base64,overview", measured } as never;
    vi.mocked(analyzeWithOpenAI).mockResolvedValue({ subject: { primary: "测试主体" } } as never);

    await runImageAnalysis({ ...DEFAULT_SETTINGS, analysisMode: "deep" }, source, "", preview);

    expect(prepareImage).toHaveBeenCalledWith(source, { maxEdge: 2048 });
  });

  it("在侧边栏内准备图片并执行编辑请求", async () => {
    const output = { dataUrl: "data:image/png;base64,edited" };
    vi.mocked(editWithOpenAI).mockResolvedValue(output);

    await expect(runImageEdit(DEFAULT_SETTINGS, source, "  改为红色  ")).resolves.toEqual(output);
    expect(editWithOpenAI).toHaveBeenCalledWith(DEFAULT_SETTINGS, blob, "改为红色");
  });
});
