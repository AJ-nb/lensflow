import { describe, expect, it } from "vitest";
import {
  formatRuntimeMessageError,
  isExtensionContextInvalidatedError,
  isRetryableRuntimeRequest,
  RUNTIME_MESSAGE_RETRY_DELAYS_MS,
  shouldRetryRuntimeMessage
} from "./runtime-messaging";

describe("runtime messaging", () => {
  it("将 Chrome 异步响应通道错误转换为可执行的中文提示", () => {
    const error = new Error(
      "A listener indicated an asynchronous response by returning true, but the message channel closed before a response was received"
    );

    expect(formatRuntimeMessageError(error)).toContain("扩展后台响应中断");
    expect(formatRuntimeMessageError(error)).toContain("chrome://extensions");
  });

  it("允许只读初始化请求重试", () => {
    expect(isRetryableRuntimeRequest({ type: "GET_SETTINGS" })).toBe(true);
  });

  it("后台无返回值时重试只读初始化请求", () => {
    expect(shouldRetryRuntimeMessage({ type: "GET_SETTINGS" }, undefined)).toBe(true);
    expect(shouldRetryRuntimeMessage({ type: "GET_SELECTION" }, undefined)).toBe(true);
    expect(RUNTIME_MESSAGE_RETRY_DELAYS_MS).toEqual([100, 300, 700]);
  });

  it("后台无返回值时不重试写入和付费请求", () => {
    expect(shouldRetryRuntimeMessage({
      type: "SAVE_SETTINGS",
      settings: { apiBaseUrl: "https://api.example.com/v1" }
    }, undefined)).toBe(false);
    expect(shouldRetryRuntimeMessage({
      type: "ANALYZE_IMAGE",
      source: { id: "test-image", kind: "upload", dataUrl: "data:image/png;base64,AA==" }
    }, undefined)).toBe(false);
  });

  it("识别扩展重载后的失效内容脚本上下文", () => {
    const error = new Error("Extension context invalidated.");

    expect(isExtensionContextInvalidatedError(error)).toBe(true);
    expect(formatRuntimeMessageError(error)).toContain("上下文已失效");
  });

  it("不重试会产生模型调用费用的分析请求", () => {
    expect(isRetryableRuntimeRequest({
      type: "ANALYZE_IMAGE",
      source: { id: "test-image", kind: "upload", dataUrl: "data:image/png;base64,AA==" }
    })).toBe(false);
  });
});
