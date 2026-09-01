import type { OperationFailure } from "@lensflow/contracts";

const TECHNICAL_DETAILS_LIMIT = 2048;
const REQUEST_ID_LIMIT = 256;

export function sanitizeTechnicalDetails(input: unknown): string | undefined {
  const serialized = serializeDetail(input);
  if (!serialized) return undefined;
  const sanitized = serialized
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&(?:nbsp|#160);/gi, " ")
    .replace(/&(?:lt|#60);/gi, "<")
    .replace(/&(?:gt|#62);/gi, ">")
    .replace(/&(?:quot|#34);/gi, "\"")
    .replace(/&(?:amp|#38);/gi, "&")
    .replace(/\bBearer\s+[A-Za-z0-9._~+/=-]+/gi, "Bearer [REDACTED]")
    .replace(/\bsk-[A-Za-z0-9_-]{8,}\b/g, "[REDACTED]")
    .replace(/((?:api[-_ ]?key|authorization|access[-_ ]?token|secret)\s*[=:]\s*)[^\s,;"']+/gi, "$1[REDACTED]")
    .replace(/(["'](?:apiKey|api_key|authorization|accessToken|access_token|secret)["']\s*:\s*["'])[^"']+(["'])/gi, "$1[REDACTED]$2")
    .replace(/[\u0000-\u001f\u007f]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!sanitized) return undefined;
  return sanitized.slice(0, TECHNICAL_DETAILS_LIMIT);
}

export function sanitizeRequestId(input: unknown): string | undefined {
  const sanitized = sanitizeTechnicalDetails(input);
  return sanitized?.slice(0, REQUEST_ID_LIMIT) || undefined;
}

function sanitizeOperationFailure(failure: OperationFailure): OperationFailure {
  const requestId = sanitizeRequestId(failure.requestId);
  const { requestId: _requestId, ...rest } = failure;
  return requestId ? { ...rest, requestId } : rest;
}

export function failureFromHttpResponse(response: Response, body: unknown, providerName = "Provider"): OperationFailure {
  const status = response.status;
  const subject = providerSubject(providerName);
  const requestId = ["x-request-id", "request-id", "cf-ray"]
    .map((name) => sanitizeRequestId(response.headers.get(name)))
    .find(Boolean);
  const technicalDetails = sanitizeTechnicalDetails(extractDetail(body) ?? body);
  const shared = { status, requestId, technicalDetails };

  if (status === 401) return { ...shared, category: "authentication", retryable: false, summary: `${subject}拒绝了当前凭据`, guidance: "请替换 API Key 后重新测试。空白输入不会清除已有密钥。" };
  if (status === 403) return { ...shared, category: "permission", retryable: false, summary: `${subject}不允许执行此请求`, guidance: "请检查账号权限、模型访问权限和接口地址。" };
  if (status === 404) return { ...shared, category: "configuration", retryable: false, summary: `${subject}未找到请求接口`, guidance: "请检查 API Base URL 和协议模式，避免重复填写 /models 等路径。" };
  if (status === 408 || status === 504) return { ...shared, category: "timeout", retryable: true, summary: `${subject}响应超时`, guidance: "Lensflow 不会自动重发可能计费的请求；请稍后手动重试。" };
  if (status === 429) return { ...shared, category: "rate-limit", retryable: true, summary: `${subject}请求过于频繁`, guidance: "请等待 Provider 的限流窗口结束后手动重试。" };
  if (status >= 500) return { ...shared, category: "upstream", retryable: true, summary: `${subject}暂时不可用`, guidance: "这是上游服务错误。当前活动配置和密钥未更改；请稍后手动重试或切换 Provider。" };
  return { ...shared, category: "invalid-response", retryable: false, summary: `${subject}返回了无法处理的响应`, guidance: "请检查接口兼容性、协议模式和模型设置。" };
}

export function toOperationFailure(error: unknown, providerName = "Provider"): OperationFailure {
  if (isFailureCarrier(error)) return sanitizeOperationFailure(error.failure);
  if (error instanceof DOMException && error.name === "AbortError") return { category: "cancelled", retryable: false, summary: "操作已取消", guidance: "Lensflow 没有自动重发请求。" };
  const message = error instanceof Error ? error.message : String(error || "未知错误");
  if ((error instanceof DOMException && error.name === "TimeoutError") || /(?:timed?\s*out|timeout|超时)/i.test(message)) return {
    category: "timeout", retryable: true, summary: `${providerSubject(providerName)}响应超时`, guidance: "Lensflow 不会自动重发可能计费的请求；请稍后手动重试。", technicalDetails: sanitizeTechnicalDetails(message)
  };
  if (error instanceof TypeError || /failed to fetch|networkerror|network request/i.test(message)) return {
    category: "network", retryable: true, summary: `无法连接 ${providerName}`, guidance: "请检查网络、浏览器站点权限和 API Base URL 后手动重试。", technicalDetails: sanitizeTechnicalDetails(message)
  };
  if (/api key|密钥|模型|base url|配置|地址/i.test(message)) return {
    category: "configuration", retryable: false, summary: sanitizeTechnicalDetails(message)?.slice(0, 240) || "Provider 配置不完整", guidance: "请返回 Provider 设置检查密钥、模型、接口地址和协议模式。"
  };
  return { category: "unknown", retryable: false, summary: "操作未完成", guidance: "请查看诊断信息并确认配置后再试。", technicalDetails: sanitizeTechnicalDetails(message) };
}

export function normalizeLegacyFailure(value: string, providerName = "Provider"): OperationFailure {
  const status = Number(value.match(/(?:\(|code\s*|status\s*|错误\s*)(401|403|404|408|429|5\d\d)\b/i)?.[1]);
  if (Number.isInteger(status)) return failureFromHttpResponse(new Response(null, { status }), value, providerName);
  if (/<(?:!doctype|html|head|body)\b/i.test(value)) return {
    category: "invalid-response", retryable: false, summary: `${providerName} 返回了无法处理的网页响应`, guidance: "请检查接口地址；Lensflow 已移除旧记录中的网页源码。", technicalDetails: sanitizeTechnicalDetails(value)
  };
  return { category: "unknown", retryable: false, summary: sanitizeTechnicalDetails(value)?.slice(0, 240) || "操作未完成", guidance: "请检查 Provider 配置后手动重试。", technicalDetails: sanitizeTechnicalDetails(value) };
}

function serializeDetail(input: unknown): string {
  if (typeof input === "string") return input;
  if (input === null || input === undefined) return "";
  try { return JSON.stringify(input); } catch { return String(input); }
}

function extractDetail(body: unknown): unknown {
  if (!body || typeof body !== "object") return body;
  const value = body as Record<string, unknown>;
  const error = value.error;
  if (typeof error === "string") return error;
  if (error && typeof error === "object") {
    const nested = error as Record<string, unknown>;
    return nested.message ?? nested.detail ?? nested;
  }
  return value.message ?? value.detail ?? body;
}

function isFailureCarrier(value: unknown): value is { failure: OperationFailure } {
  return Boolean(value && typeof value === "object" && "failure" in value && (value as { failure?: unknown }).failure);
}

function providerSubject(providerName: string): string {
  return `${providerName}${/[\u3400-\u9fff]$/.test(providerName) ? "" : " "}`;
}
