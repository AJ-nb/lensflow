import type { RuntimeRequest } from "./types";

export function isRetryableRuntimeRequest(request: RuntimeRequest): boolean {
  return request.type === "GET_SETTINGS" || request.type === "GET_SELECTION" || request.type === "PREPARE_IMAGE";
}

export function isTransientMessageChannelError(error: unknown): boolean {
  const normalized = getErrorMessage(error).toLowerCase();
  return normalized.includes("message channel closed")
    || normalized.includes("message port closed")
    || normalized.includes("receiving end does not exist");
}

export function isExtensionContextInvalidatedError(error: unknown): boolean {
  return getErrorMessage(error).toLowerCase().includes("extension context invalidated");
}

export function formatRuntimeMessageError(error: unknown): string {
  const message = getErrorMessage(error) || "未知错误";
  const normalized = message.toLowerCase();
  if (isExtensionContextInvalidatedError(error)) {
    return "扩展已更新，当前侧边栏上下文已失效。请关闭侧边栏并重新打开。";
  }
  if (isTransientMessageChannelError(error)) {
    return "扩展后台响应中断，自动重试后仍未恢复。请在 chrome://extensions 重新加载“砚台”，再关闭并重新打开侧边栏。";
  }
  if (normalized.includes("failed to fetch")) {
    return "EXTENSION_REQUEST_FAILED：扩展后台没有完成网络请求。请重新加载扩展；若问题仍存在，请分别检查图片源和 API 端点的诊断信息。";
  }
  return message;
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error || "");
}
