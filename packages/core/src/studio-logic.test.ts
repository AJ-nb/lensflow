import { describe, expect, it } from "vitest";
import type { AxisHand, GenerationBatch, KeywordCard, StudioReference } from "@lensflow/contracts";
import {
  aggregateBatchState,
  compilePrompt,
  dedupeTray,
  drawAxis,
  getFanLayout,
  nextFanIndex,
  normalizeReferences,
  retryFailedChildren
} from "./studio-logic";

const now = "2026-08-29T00:00:00.000Z";
const card = (id: string, axis: KeywordCard["axis"], text: string, locked = false): KeywordCard => ({ id, axis, text, locked, createdAt: now });

describe("five-axis composition", () => {
  it("keeps locked cards and only draws from the selected axis", () => {
    const locked = card("a", "style", "纸本", true);
    expect(drawAxis("style", [locked, card("b", "style", "胶片")], locked, () => 0)?.id).toBe("a");
    expect(drawAxis("color", [locked], null, () => 0)).toBeNull();
  });

  it("deduplicates by ID and compiles in stable axis order", () => {
    const style = card("s", "style", "胶片感");
    expect(dedupeTray([style, style])).toHaveLength(1);
    const hand: AxisHand = {
      style,
      subject: card("u", "subject", "静物"),
      composition: null,
      color: card("c", "color", "低饱和"),
      motion: null
    };
    expect(compilePrompt(hand, "窗边光影")).toBe("胶片感，静物，低饱和，窗边光影");
  });
});

describe("batch aggregation", () => {
  const batch: GenerationBatch = {
    id: "batch",
    providerId: "biyuan",
    prompt: "test",
    settings: { model: "image", size: "1024x1024", quality: "medium", count: 2, concurrency: 2 },
    referenceIds: [],
    state: "partial",
    createdAt: now,
    updatedAt: now,
    children: [
      { id: "1", batchId: "batch", index: 0, state: "ready", attempt: 0, updatedAt: now },
      { id: "2", batchId: "batch", index: 1, state: "failed", error: "timeout", attempt: 0, updatedAt: now }
    ]
  };

  it("preserves successes when retrying failed positions", () => {
    expect(aggregateBatchState(batch.children)).toBe("partial");
    const retried = retryFailedChildren(batch);
    expect(retried.children[0]?.state).toBe("ready");
    expect(retried.children[1]?.state).toBe("retrying");
    expect(retried.children[1]?.attempt).toBe(1);
  });
});

describe("references and fan", () => {
  it("keeps one palette and applies reference priority", () => {
    const ref = (id: string, kind: StudioReference["kind"]): StudioReference => ({ id, kind, name: id, enabled: true, createdAt: now });
    const normalized = normalizeReferences([ref("p1", "palette"), ref("p2", "palette"), ref("pose", "pose"), ref("face", "face")]);
    expect(normalized.map((item) => item.id)).toEqual(["face", "pose", "p1"]);
  });

  it("fans up to ten cards and wraps keyboard focus", () => {
    const layout = getFanLayout(10, 4);
    expect(layout).toHaveLength(10);
    expect(layout[0]?.angle).toBeCloseTo(-24);
    expect(layout[9]?.angle).toBeCloseTo(24);
    expect(layout[4]?.zIndex).toBe(100);
    expect(nextFanIndex(0, 5, -1)).toBe(4);
  });
});
