import { describe, expect, it } from "vitest";
import { differenceHashFromLuminance, hashDistance, rankArchiveHashes } from "./similarity";
import type { AnalysisArchiveRecord } from "../shared/types";

describe("local visual similarity", () => {
  it("creates a deterministic 64-bit difference hash", () => {
    const row = [9, 8, 7, 6, 5, 4, 3, 2, 1];
    expect(differenceHashFromLuminance(Array.from({ length: 8 }, () => row).flat())).toBe("ffffffffffffffff");
  });

  it("counts hamming distance between hashes", () => {
    expect(hashDistance("0000000000000000", "000000000000000f")).toBe(4);
  });

  it("ranks local archive records by luminance-structure similarity", () => {
    const records = [
      { id: "far", generatedAt: "2026-01-01", perceptualHash: "ffffffffffffffff" },
      { id: "near", generatedAt: "2026-01-02", perceptualHash: "0000000000000001" }
    ] as AnalysisArchiveRecord[];
    const ranked = rankArchiveHashes("0000000000000000", records);
    expect(ranked.map((item) => item.record.id)).toEqual(["near", "far"]);
    expect(ranked[0]?.similarity).toBeCloseTo(63 / 64);
  });
});
