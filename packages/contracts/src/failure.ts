import { z } from "zod";

export const operationFailureCategorySchema = z.enum([
  "authentication",
  "permission",
  "rate-limit",
  "upstream",
  "network",
  "timeout",
  "invalid-response",
  "configuration",
  "cancelled",
  "unknown"
]);
export type OperationFailureCategory = z.infer<typeof operationFailureCategorySchema>;

export const operationFailureSchema = z.object({
  category: operationFailureCategorySchema,
  status: z.number().int().min(100).max(599).optional(),
  retryable: z.boolean(),
  summary: z.string().trim().min(1).max(240),
  guidance: z.string().trim().min(1).max(500),
  requestId: z.string().trim().min(1).max(256).optional(),
  technicalDetails: z.string().max(2048).optional()
});
export type OperationFailure = z.infer<typeof operationFailureSchema>;
