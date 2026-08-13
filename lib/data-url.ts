export function dataUrlToBlob(dataUrl: string): Promise<Blob> {
  const commaIndex = dataUrl.indexOf(",");
  if (!dataUrl.startsWith("data:") || commaIndex < 0) {
    return Promise.reject(new Error("无效的图片 Data URL。"));
  }
  const metadata = dataUrl.slice(5, commaIndex);
  const encoded = dataUrl.slice(commaIndex + 1);
  const mimeType = metadata.split(";")[0] || "application/octet-stream";
  const raw = metadata.includes(";base64") ? atob(encoded) : decodeURIComponent(encoded);
  const bytes = Uint8Array.from(raw, (character) => character.charCodeAt(0));
  return Promise.resolve(new Blob([bytes], { type: mimeType }));
}
