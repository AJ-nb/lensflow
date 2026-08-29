import { z } from "zod";
import { assetRecordSchema, generationBatchSchema } from "./studio";

export const LENSFLOW_BRIDGE_VERSION = 1 as const;
export const LENSFLOW_SITE_ORIGIN = "https://aj-nb.github.io";
export const MAX_BRIDGE_PAYLOAD_BYTES = 2_000_000;

export const bridgeMethodSchema = z.enum([
  "handshake",
  "version.get",
  "snapshot.get",
  "asset.put",
  "asset.delete",
  "task.create",
  "task.cancel",
  "task.retryFailed",
  "task.subscribe",
  "download",
  "backup.open",
  "capture.open"
]);
export type BridgeMethod = z.infer<typeof bridgeMethodSchema>;

export const bridgeRequestSchema = z.object({
  version: z.literal(LENSFLOW_BRIDGE_VERSION),
  id: z.string().uuid(),
  nonce: z.string().min(16).max(128),
  method: bridgeMethodSchema,
  payload: z.unknown().optional(),
  timestamp: z.number().int().positive()
});
export type BridgeRequest = z.infer<typeof bridgeRequestSchema>;

export const bridgeResponseSchema = z.object({
  version: z.literal(LENSFLOW_BRIDGE_VERSION),
  id: z.string().uuid(),
  ok: z.boolean(),
  data: z.unknown().optional(),
  error: z.string().optional()
});
export type BridgeResponse = z.infer<typeof bridgeResponseSchema>;

export const bridgeAssetPayloadSchema = assetRecordSchema.omit({ createdAt: true, updatedAt: true }).partial({ id: true });
export const bridgeTaskPayloadSchema = generationBatchSchema.pick({ prompt: true, settings: true, referenceIds: true });
const emptyPayloadSchema = z.union([z.undefined(), z.null(), z.object({}).strict()]);
const batchIdPayloadSchema = z.object({ batchId: z.string().min(1) }).strict();
const bridgePayloadSchemas: Record<BridgeMethod, z.ZodType> = {
  handshake: emptyPayloadSchema,
  "version.get": emptyPayloadSchema,
  "snapshot.get": emptyPayloadSchema,
  "asset.put": bridgeAssetPayloadSchema,
  "asset.delete": z.object({ id: z.string().min(1) }).strict(),
  "task.create": bridgeTaskPayloadSchema,
  "task.cancel": batchIdPayloadSchema,
  "task.retryFailed": batchIdPayloadSchema,
  "task.subscribe": emptyPayloadSchema,
  download: z.object({ batchId: z.string().min(1), childId: z.string().min(1).optional() }).strict(),
  "backup.open": emptyPayloadSchema,
  "capture.open": emptyPayloadSchema
};

export function parseBridgePayload(request: BridgeRequest): unknown {
  assertNoSensitiveBridgeFields(request.payload);
  return bridgePayloadSchemas[request.method].parse(request.payload);
}

export function assertNoSensitiveBridgeFields(value: unknown): void {
  const visit = (item: unknown): void => {
    if (Array.isArray(item)) {
      item.forEach(visit);
      return;
    }
    if (!item || typeof item !== "object") return;
    for (const [key, child] of Object.entries(item)) {
      if (/^(?:api.?key|secret|authorization|access.?token|token)$/i.test(key)) {
        throw new Error(`桥接负载包含禁止字段：${key}`);
      }
      visit(child);
    }
  };
  visit(value);
}

export function isAllowedLensflowBridgeOrigin(origin: string, pathname: string, development = false): boolean {
  if (origin === LENSFLOW_SITE_ORIGIN && (pathname === "/lensflow" || pathname.startsWith("/lensflow/"))) return true;
  if (!development) return false;
  return /^http:\/\/(?:localhost|127\.0\.0\.1)(?::\d+)?$/.test(origin);
}

export function estimateBridgePayloadBytes(value: unknown): number {
  return new TextEncoder().encode(JSON.stringify(value ?? null)).byteLength;
}

export function assertBridgePayloadSize(value: unknown): void {
  if (estimateBridgePayloadBytes(value) > MAX_BRIDGE_PAYLOAD_BYTES) {
    throw new Error("桥接负载超过 2 MB 限制。");
  }
}
