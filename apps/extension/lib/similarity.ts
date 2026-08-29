import type { AnalysisArchiveRecord, SimilarArchiveMatch } from "../shared/types";
import { dataUrlToBlob } from "./data-url";

const HASH_WIDTH = 9;
const HASH_HEIGHT = 8;

export async function computeDifferenceHash(dataUrl: string): Promise<string> {
  const bitmap = await createImageBitmap(await dataUrlToBlob(dataUrl));
  const canvas = new OffscreenCanvas(HASH_WIDTH, HASH_HEIGHT);
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) {
    bitmap.close();
    throw new Error("无法创建相似图索引画布。");
  }
  context.drawImage(bitmap, 0, 0, HASH_WIDTH, HASH_HEIGHT);
  bitmap.close();
  const pixels = context.getImageData(0, 0, HASH_WIDTH, HASH_HEIGHT).data;
  const luminance: number[] = [];
  for (let index = 0; index < pixels.length; index += 4) {
    luminance.push((pixels[index] ?? 0) * 0.299 + (pixels[index + 1] ?? 0) * 0.587 + (pixels[index + 2] ?? 0) * 0.114);
  }
  return differenceHashFromLuminance(luminance);
}

export function differenceHashFromLuminance(values: number[]): string {
  if (values.length !== HASH_WIDTH * HASH_HEIGHT) {
    throw new Error(`差异哈希需要 ${HASH_WIDTH * HASH_HEIGHT} 个亮度值。`);
  }
  let hash = 0n;
  let bit = 0n;
  for (let y = 0; y < HASH_HEIGHT; y += 1) {
    for (let x = 0; x < HASH_WIDTH - 1; x += 1) {
      if ((values[y * HASH_WIDTH + x] ?? 0) > (values[y * HASH_WIDTH + x + 1] ?? 0)) {
        hash |= 1n << bit;
      }
      bit += 1n;
    }
  }
  return hash.toString(16).padStart(16, "0");
}

export function hashDistance(left: string, right: string): number {
  let difference = BigInt(`0x${left}`) ^ BigInt(`0x${right}`);
  let count = 0;
  while (difference) {
    difference &= difference - 1n;
    count += 1;
  }
  return count;
}

export function rankArchiveHashes(
  queryHash: string,
  records: AnalysisArchiveRecord[]
): SimilarArchiveMatch[] {
  return records
    .filter((record) => record.perceptualHash)
    .map((record) => {
      const distance = hashDistance(queryHash, record.perceptualHash!);
      return { record, distance, similarity: Math.max(0, 1 - distance / 64) };
    })
    .sort((left, right) => right.similarity - left.similarity || right.record.generatedAt.localeCompare(left.record.generatedAt));
}
