import { describe, expect, it } from "vitest";
import { getPagePickerInjectionError, getPagePickerUrlError } from "./page-picker";

describe("page picker diagnostics", () => {
  it("allows ordinary web pages and tolerates a hidden tab URL", () => {
    expect(getPagePickerUrlError("https://example.com/product")).toBeNull();
    expect(getPagePickerUrlError("http://localhost:4174/")).toBeNull();
    expect(getPagePickerUrlError(undefined)).toBeNull();
  });

  it("explains Chrome restricted pages without referring to API settings", () => {
    const message = getPagePickerUrlError("chrome://extensions/");
    expect(message).toContain("系统页");
    expect(message).not.toContain("API");
  });

  it("gives the file access recovery step", () => {
    expect(getPagePickerUrlError("file:///C:/design/reference.png")).toContain("允许访问文件网址");
  });

  it("normalizes injection permission failures", () => {
    const message = getPagePickerInjectionError(new Error("Missing host permission for the tab"));
    expect(message).toContain("临时访问权限");
  });
});
