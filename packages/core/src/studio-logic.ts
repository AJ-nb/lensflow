import {
  AXIS_ORDER,
  type AxisHand,
  type AxisName,
  type GenerationBatch,
  type GenerationBatchState,
  type GenerationChild,
  type KeywordCard,
  type ReferenceKind,
  type StudioReference
} from "@lensflow/contracts";

export function drawAxis(
  axis: AxisName,
  library: KeywordCard[],
  current: KeywordCard | null,
  random: () => number = Math.random
): KeywordCard | null {
  if (current?.locked) return current;
  const candidates = library.filter((card) => card.axis === axis && card.id !== current?.id);
  if (!candidates.length) return current ?? null;
  return candidates[Math.min(candidates.length - 1, Math.floor(random() * candidates.length))] ?? null;
}

export function drawHand(library: KeywordCard[], hand: AxisHand, random: () => number = Math.random): AxisHand {
  return Object.fromEntries(
    AXIS_ORDER.map((axis) => [axis, drawAxis(axis, library, hand[axis], random)])
  ) as AxisHand;
}

export function dedupeTray(cards: KeywordCard[]): KeywordCard[] {
  return [...new Map(cards.map((card) => [card.id, card])).values()];
}

export function compilePrompt(hand: AxisHand, body: string): string {
  const axes = AXIS_ORDER.map((axis) => hand[axis]?.text.trim()).filter((value): value is string => Boolean(value));
  const tail = body.trim();
  return [...axes, tail].filter(Boolean).join("，");
}

export function aggregateBatchState(children: GenerationChild[]): GenerationBatchState {
  if (!children.length || children.every((child) => child.state === "failed")) return "failed";
  if (children.every((child) => child.state === "ready")) return "ready";
  if (children.some((child) => child.state === "retrying")) return "retrying";
  if (children.some((child) => child.state === "generating" || child.state === "queued")) return "generating";
  if (children.some((child) => child.state === "ready") && children.some((child) => child.state === "failed")) return "partial";
  return "generating";
}

export function retryFailedChildren(batch: GenerationBatch, now = new Date().toISOString()): GenerationBatch {
  const children = batch.children.map((child) => child.state === "failed"
    ? { ...child, state: "retrying" as const, error: undefined, attempt: child.attempt + 1, updatedAt: now }
    : child);
  return { ...batch, children, state: aggregateBatchState(children), updatedAt: now };
}

export const REFERENCE_PRIORITY: Record<ReferenceKind, number> = {
  image: 4,
  face: 3,
  pose: 2,
  palette: 1
};

export function normalizeReferences(references: StudioReference[]): StudioReference[] {
  const enabled = references.filter((reference) => reference.enabled);
  const palette = enabled.filter((reference) => reference.kind === "palette").slice(0, 1);
  return [...enabled.filter((reference) => reference.kind !== "palette"), ...palette]
    .sort((a, b) => REFERENCE_PRIORITY[b.kind] - REFERENCE_PRIORITY[a.kind]);
}

export interface FanCardLayout {
  angle: number;
  offsetX: number;
  offsetY: number;
  zIndex: number;
}

export function getFanLayout(count: number, focusedIndex: number): FanCardLayout[] {
  const safeCount = Math.max(1, Math.min(10, count));
  const span = safeCount === 1 ? 0 : Math.min(48, 10 + safeCount * 4.25);
  const step = safeCount === 1 ? 0 : span / (safeCount - 1);
  return Array.from({ length: safeCount }, (_, index) => {
    const angle = -span / 2 + step * index;
    const centered = index - (safeCount - 1) / 2;
    return {
      angle,
      offsetX: centered * Math.max(42, 92 - safeCount * 4),
      offsetY: Math.abs(centered) * 7,
      zIndex: index === focusedIndex ? 100 : 10 + index
    };
  });
}

export function nextFanIndex(current: number, count: number, direction: -1 | 1): number {
  if (count <= 0) return 0;
  return (current + direction + count) % count;
}
