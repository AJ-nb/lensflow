import { describe, expect, it } from "vitest";
import { createBinaryMask } from "./segmentation";

describe("subject segmentation mask", () => {
  it("thresholds model confidence without pretending it is a physical boundary", () => {
    const mask = createBinaryMask([0.1, 0.5, 0.8, 0.49], 0.5);
    expect(Array.from(mask.alpha)).toEqual([0, 255, 255, 0]);
    expect(mask.coverage).toBe(0.5);
  });
});
