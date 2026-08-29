import type { ConnectionTestResult } from "./types";

export function classifyAvailableModels(modelIds: string[]): Pick<
  ConnectionTestResult,
  "availableModels" | "analysisModels" | "imageModels" | "warnings"
> {
  const availableModels = Array.from(new Set(modelIds.map((id) => id.trim()).filter(Boolean)))
    .sort((left, right) => left.localeCompare(right));
  const imageModels = availableModels.filter(isLikelyImageModel);
  const analysisModels = availableModels.filter((id) => !isLikelyImageModel(id) && !isKnownUtilityModel(id));
  const warnings = [
    analysisModels.length ? "" : "端点没有返回可识别的通用分析模型。",
    imageModels.length ? "" : "端点没有返回可识别的图片模型。",
    "模型分类依据模型 ID；/models 接口不提供完整能力声明，最终以端点实际响应为准。"
  ].filter(Boolean);
  return { availableModels, analysisModels, imageModels, warnings };
}

export function normalizeApiBaseUrl(value: string): string {
  const candidate = value.trim();
  if (!candidate) throw new Error("请先填写 API Base URL。");
  const parsed = new URL(candidate);
  if (!["http:", "https:"].includes(parsed.protocol)) {
    throw new Error("API Base URL 仅支持 http 或 https。");
  }
  const isLoopback = ["localhost", "127.0.0.1", "::1"].includes(parsed.hostname);
  if (parsed.protocol === "http:" && !isLoopback) {
    throw new Error("远程 API Base URL 必须使用 HTTPS；HTTP 仅允许本机地址。");
  }
  if (parsed.username || parsed.password) {
    throw new Error("API Base URL 不得包含用户名或密码。");
  }
  parsed.search = "";
  parsed.hash = "";
  parsed.pathname = parsed.pathname.replace(/\/+$/, "") || "/v1";
  return parsed.toString().replace(/\/$/, "");
}

function isLikelyImageModel(id: string): boolean {
  return /(?:gpt-image|chatgpt-image|dall-e|imagen|imagegen|(?:^|[-_/])image(?:$|[-_/])|flux|stable-diffusion|sdxl|recraft|ideogram|seedream|kolors)/i.test(id);
}

function isKnownUtilityModel(id: string): boolean {
  return /(?:embedding|moderation|whisper|transcri|text-to-speech|(?:^|[-_/])tts(?:$|[-_/])|audio|realtime|search|rerank|guard|safety)/i.test(id);
}
