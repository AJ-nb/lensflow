const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

export function normalizeBaseUrl(input: string): string {
  const raw = input.trim();
  if (!raw) throw new Error("API Base URL 不能为空。");
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error("API Base URL 不是有效地址。");
  }
  if (url.username || url.password) throw new Error("API Base URL 不能包含用户名或密码。");
  if (url.protocol !== "https:" && !(url.protocol === "http:" && LOCAL_HOSTS.has(url.hostname))) {
    throw new Error("远程 API 必须使用 HTTPS；HTTP 仅允许本机地址。");
  }
  if (/\/v1\/v1(?:\/|$)/i.test(url.pathname)) throw new Error("API Base URL 包含重复的 /v1 路径。");
  url.hash = "";
  url.search = "";
  return url.toString().replace(/\/$/, "");
}

export function endpointUrl(baseUrl: string, path: string): string {
  const base = normalizeBaseUrl(baseUrl);
  const suffix = path.replace(/^\/+/, "");
  return `${base}/${suffix}`;
}

export function originPattern(baseUrl: string): string {
  const url = new URL(normalizeBaseUrl(baseUrl));
  return `${url.origin}/*`;
}
