import { describe, expect, it } from "vitest";
import { hasUrlAccesses, originPatternForUrl } from "./permissions";

describe("optional host permissions", () => {
  it("limits access to the configured origin", () => {
    expect(originPatternForUrl("https://api.example.com:8443/v1"))
      .toBe("https://api.example.com:8443/*");
  });

  it("supports loopback development endpoints", () => {
    expect(originPatternForUrl("http://127.0.0.1:8787/v1"))
      .toBe("http://127.0.0.1:8787/*");
  });

  it("rejects non-network protocols", () => {
    expect(() => originPatternForUrl("file:///tmp/key"))
      .toThrow("http 或 https");
  });

  it("rejects credentials embedded in URLs", () => {
    expect(() => originPatternForUrl("https://user:pass@example.com/v1"))
      .toThrow("用户名或密码");
  });

  it("treats preview and test environments as already authorized", async () => {
    await expect(hasUrlAccesses(["https://api.example.com/v1"])).resolves.toBe(true);
  });
});
