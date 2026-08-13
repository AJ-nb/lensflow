import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS, type ImageSource, type MeasuredImageData } from "../shared/types";
import {
  buildAnalysisContext,
  classifyAvailableModels,
  formatOpenAIError,
  normalizeApiBaseUrl
} from "./openai";

const source: ImageSource = { id: "fixture", kind: "upload", fileName: "fixture.png" };
const measured: MeasuredImageData = {
  width: 1200,
  height: 800,
  aspectRatio: "3:2",
  sha256: "a".repeat(64),
  orientation: "landscape",
  mimeType: "image/png",
  palette: []
};

describe("formatOpenAIError", () => {
  it("explains browser network blocking", () => {
    expect(formatOpenAIError(new TypeError("Failed to fetch"), DEFAULT_SETTINGS, "图片分析"))
      .toContain("NETWORK_BLOCKED_OR_UNREACHABLE");
  });

  it("explains invalid credentials", () => {
    expect(formatOpenAIError({ status: 401, message: "Unauthorized" }, DEFAULT_SETTINGS, "连接测试"))
      .toContain("API Key 无效");
  });

  it("explains unavailable models", () => {
    const message = formatOpenAIError({ status: 404, message: "model_not_found" }, DEFAULT_SETTINGS, "图片分析");
    expect(message).toContain(DEFAULT_SETTINGS.analysisModel);
    expect(message).toContain(DEFAULT_SETTINGS.imageModel);
  });

  it("preserves useful unknown API errors", () => {
    expect(formatOpenAIError(new Error("upstream unavailable"), DEFAULT_SETTINGS, "图片编辑"))
      .toBe("图片编辑失败：upstream unavailable");
  });

  it("explains upstream gateway timeouts", () => {
    const message = formatOpenAIError(
      { status: 524, message: "524 status code (no body)" },
      DEFAULT_SETTINGS,
      "完整 CMF 分析"
    );

    expect(message).toContain("UPSTREAM_TIMEOUT");
    expect(message).toContain("配置的 API 端点");
  });

  it("normalizes custom API base URLs", () => {
    expect(normalizeApiBaseUrl("https://proxy.example.com/openai/v1///?ignored=true"))
      .toBe("https://proxy.example.com/openai/v1");
  });

  it("rejects clear-text remote API endpoints", () => {
    expect(() => normalizeApiBaseUrl("http://proxy.example.com/v1")).toThrow("HTTPS");
    expect(normalizeApiBaseUrl("http://127.0.0.1:8787/v1"))
      .toBe("http://127.0.0.1:8787/v1");
  });

  it("scopes the supplemental directive to reconstruction", () => {
    const context = buildAnalysisContext(DEFAULT_SETTINGS, source, measured, "保留红色扣件");
    expect(context).toContain("保留红色扣件");
    expect(context).toContain("只允许影响 reconstruction 字段");
    expect(context).toContain(measured.sha256);
    expect(context).toContain("分析模式：fast");
    expect(context).toContain("分析目标是主要可见主体");
    expect(context).toContain("跨品类通用设计分析");
    expect(context).toContain("不得把视觉相似写成真实来源或抄袭结论");
    expect(context).toContain("先判断图片主类型与主要设计对象");
    expect(context).toContain("不适用");
    expect(context).toContain("数字界面图不得强行生成实体材料");
  });

  it("classifies endpoint models for analysis and image editing", () => {
    const catalog = classifyAvailableModels([
      "text-embedding-3-large",
      "gpt-image-2",
      "gpt-image-1.5",
      "gpt-5.6-sol",
      "gpt-5.6-sol"
    ]);
    expect(catalog.availableModels).toHaveLength(4);
    expect(catalog.analysisModels).toEqual(["gpt-5.6-sol"]);
    expect(catalog.imageModels).toEqual(["gpt-image-1.5", "gpt-image-2"]);
    expect(catalog).not.toHaveProperty("transparentBackgroundModels");
  });
});
