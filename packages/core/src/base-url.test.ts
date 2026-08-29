import { describe, expect, it } from "vitest";
import { endpointUrl, normalizeBaseUrl, originPattern } from "./base-url";

describe("Base URL", () => {
  it("treats the configured URL as the complete API prefix", () => {
    expect(normalizeBaseUrl("https://api.biyuan.ai/v1/")).toBe("https://api.biyuan.ai/v1");
    expect(endpointUrl("https://api.biyuan.ai/v1", "/models")).toBe("https://api.biyuan.ai/v1/models");
  });

  it("rejects duplicate v1 paths and unsafe remote HTTP", () => {
    expect(() => normalizeBaseUrl("https://api.example.com/v1/v1")).toThrow("重复");
    expect(() => normalizeBaseUrl("http://api.example.com/v1")).toThrow("HTTPS");
    expect(normalizeBaseUrl("http://127.0.0.1:8188")).toBe("http://127.0.0.1:8188");
  });

  it("derives an origin permission without leaking the path", () => {
    expect(originPattern("https://api.biyuan.ai/v1")).toBe("https://api.biyuan.ai/*");
  });
});
