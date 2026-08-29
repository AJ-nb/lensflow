export function originPatternForUrl(value: string): string {
  const parsed = new URL(value.trim());
  if (!["http:", "https:"].includes(parsed.protocol)) {
    throw new Error("仅支持为 http 或 https 地址授权。");
  }
  if (parsed.username || parsed.password) throw new Error("地址不得包含用户名或密码。");
  return `${parsed.protocol}//${parsed.host}/*`;
}

export async function requestUrlAccess(value: string): Promise<void> {
  return requestUrlAccesses([value]);
}

export async function hasUrlAccesses(values: string[]): Promise<boolean> {
  const origins = Array.from(new Set(values.map(originPatternForUrl)));
  if (typeof browser === "undefined" || !browser.permissions) return true;
  return browser.permissions.contains({ origins });
}

export async function requestUrlAccesses(values: string[]): Promise<void> {
  const origins = Array.from(new Set(values.map(originPatternForUrl)));
  if (typeof browser === "undefined" || !browser.permissions) return;
  if (await browser.permissions.contains({ origins })) return;
  const granted = await browser.permissions.request({ origins });
  if (!granted) {
    const hosts = values.map((value) => new URL(value).host).join("、");
    throw new Error(`未获得 ${hosts} 的访问权限，未发送任何数据。`);
  }
}
