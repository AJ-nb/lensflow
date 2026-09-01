import { describe, expect, it } from "vitest";
import { failureFromHttpResponse, normalizeLegacyFailure, sanitizeTechnicalDetails, toOperationFailure } from "./operation-failure";

describe("operation failures", () => {
  it("redacts common credential forms and caps diagnostic detail", () => {
    const value = sanitizeTechnicalDetails(`<html>Authorization: Bearer secret-token api_key=private ${"x".repeat(3000)}</html>`)!;
    expect(value).not.toContain("secret-token");
    expect(value).not.toContain("private");
    expect(value).not.toContain("<html>");
    expect(value.length).toBeLessThanOrEqual(2048);
  });

  it("maps legacy HTML failures to a bounded safe record", () => {
    const failure = normalizeLegacyFailure("Provider 请求失败 (502)：<!DOCTYPE html><body>Bad gateway</body>", "彼源");
    expect(failure).toMatchObject({ category: "upstream", status: 502, summary: "彼源暂时不可用" });
    expect(failure.technicalDetails).not.toContain("<!DOCTYPE");
  });

  it("preserves a structured failure carried across the runtime boundary", () => {
    const failure = { category: "rate-limit" as const, status: 429, retryable: true, summary: "请求过于频繁", guidance: "稍后重试" };
    expect(toOperationFailure({ failure })).toEqual(failure);
  });

  it("classifies browser and adapter timeout errors separately", () => {
    expect(toOperationFailure(new DOMException("request timed out", "TimeoutError"), "彼源"))
      .toMatchObject({ category: "timeout", retryable: true, summary: "彼源响应超时" });
    expect(toOperationFailure(new Error("ComfyUI WebSocket 等待超时。"), "ComfyUI"))
      .toMatchObject({ category: "timeout", retryable: true, summary: "ComfyUI 响应超时" });
  });

  it("sanitizes request IDs from response headers before exposing them", () => {
    const requestId = `Bearer api-key-secret\u0000\r\n${"x".repeat(400)}`;
    const response = { status: 502, headers: { get: (name: string) => name === "x-request-id" ? requestId : null } } as unknown as Response;
    const failure = failureFromHttpResponse(response, "upstream");

    expect(failure.requestId).not.toContain("api-key-secret");
    expect(failure.requestId).not.toMatch(/[\u0000-\u001f\u007f]/);
    expect(failure.requestId?.length).toBeLessThanOrEqual(256);
  });

  it("sanitizes request IDs on structured failures crossing the runtime boundary", () => {
    const failure = toOperationFailure({ failure: {
      category: "upstream" as const,
      retryable: true,
      summary: "上游错误",
      guidance: "稍后重试",
      requestId: "Authorization: Bearer runtime-secret\u0000"
    } });

    expect(failure.requestId).not.toContain("runtime-secret");
    expect(failure.requestId).not.toMatch(/[\u0000-\u001f\u007f]/);
  });
});
