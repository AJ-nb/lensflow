import { describe, expect, it } from "vitest";
import { readEmbeddedImageMetadata } from "./metadata";

describe("embedded image metadata", () => {
  it("never exposes location fields when metadata is absent", async () => {
    const metadata = await readEmbeddedImageMetadata(new Blob([new Uint8Array([0, 1, 2])], { type: "image/jpeg" }));
    expect(metadata.locationDataExcluded).toBe(true);
    expect(Object.keys(metadata).some((key) => /gps|latitude|longitude/i.test(key))).toBe(false);
  });
});
