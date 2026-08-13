const RESTRICTED_PAGE_PROTOCOLS = new Set([
  "about:",
  "chrome:",
  "chrome-extension:",
  "devtools:",
  "edge:",
  "view-source:"
]);

export function getPagePickerUrlError(value?: string): string | null {
  if (!value) return null;

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return "无法识别当前标签页地址。请切换到展示目标图片的普通网页后重试。";
  }

  if (["http:", "https:"].includes(url.protocol)) return null;
  if (url.protocol === "file:") {
    return "当前标签页是本地文件。请先在扩展详情中开启“允许访问文件网址”，再重新打开该文件。";
  }
  if (RESTRICTED_PAGE_PROTOCOLS.has(url.protocol)) {
    return "Chrome 不允许扩展在系统页、扩展页或新标签页中选图。请切换到展示目标图片的普通网页后重试。";
  }
  return "当前页面类型不支持网页选图。请切换到 http 或 https 网页后重试。";
}

export function getPagePickerInjectionError(error: unknown): string {
  const detail = error instanceof Error ? error.message : String(error);
  const normalized = detail.toLowerCase();

  if (
    normalized.includes("cannot access contents of url")
    || normalized.includes("cannot access a chrome")
    || normalized.includes("extensions gallery cannot be scripted")
  ) {
    return "Chrome 禁止在当前页面注入选图工具。请切换到展示目标图片的普通网页后重试。";
  }
  if (
    normalized.includes("missing host permission")
    || normalized.includes("cannot access the page")
    || normalized.includes("permission")
  ) {
    return "砚台尚未获得当前网站的临时访问权限。请在该网页点击一次砚台工具栏图标，再重试网页选图。";
  }
  if (normalized.includes("no tab with id") || normalized.includes("the tab was closed")) {
    return "目标标签页已关闭或发生切换。请回到目标网页后重试。";
  }
  return `无法在当前页面开启选图：${detail}`;
}
