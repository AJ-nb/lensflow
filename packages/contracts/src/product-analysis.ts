import { z } from "zod";
import { operationFailureSchema } from "./failure";
import { AXIS_ORDER, evidenceSourceSchema } from "./studio";

export const analysisModeSchema = z.enum(["quick", "deep"]);
export type AnalysisMode = z.infer<typeof analysisModeSchema>;

export const analysisStateSchema = z.enum([
  "queued",
  "preparing",
  "analyzing",
  "ready",
  "partial",
  "failed",
  "interrupted"
]);
export type AnalysisState = z.infer<typeof analysisStateSchema>;

export const contentKindSchema = z.enum(["product", "person", "scene", "graphic", "other"]);
export type ContentKind = z.infer<typeof contentKindSchema>;

const evidenceNoteSchema = z.object({
  value: z.string().trim().max(4_000).nullable(),
  source: evidenceSourceSchema.exclude(["measured"]),
  confidence: z.number().min(0).max(1).optional(),
  note: z.string().trim().max(1_000).optional()
});

const measuredNumberSchema = z.object({
  value: z.number().nullable(),
  source: z.literal("measured"),
  note: z.string().trim().max(1_000).optional()
});

const measuredStringSchema = z.object({
  value: z.string().nullable(),
  source: z.literal("measured"),
  note: z.string().trim().max(1_000).optional()
});

export const analysisPaletteColorSchema = z.object({
  hex: z.string().regex(/^#[0-9a-f]{6}$/i),
  proportion: z.number().min(0).max(1)
});
export type AnalysisPaletteColor = z.infer<typeof analysisPaletteColorSchema>;

const measuredPaletteSchema = z.object({
  value: z.array(analysisPaletteColorSchema).max(12).nullable(),
  source: z.literal("measured"),
  note: z.string().trim().max(1_000).optional()
});

export const localAnalysisMeasurementsSchema = z.object({
  width: measuredNumberSchema,
  height: measuredNumberSchema,
  aspectRatio: measuredStringSchema,
  orientation: measuredStringSchema,
  palette: measuredPaletteSchema
});
export type LocalAnalysisMeasurements = z.infer<typeof localAnalysisMeasurementsSchema>;

export const promptPairSchema = z.object({
  positive: z.object({ zh: z.string().trim().min(1), en: z.string().trim().min(1) }),
  negative: z.object({ zh: z.string().trim(), en: z.string().trim() })
});
export type PromptPair = z.infer<typeof promptPairSchema>;

export const promptVariantKindSchema = z.enum(["faithful", "commercial", "exploratory"]);
export type PromptVariantKind = z.infer<typeof promptVariantKindSchema>;

export const analysisPromptVariantSchema = z.object({
  kind: promptVariantKindSchema,
  label: z.string().trim().min(1).max(80),
  prompts: promptPairSchema
});
export type AnalysisPromptVariant = z.infer<typeof analysisPromptVariantSchema>;

export const axisSuggestionsSchema = z.object(Object.fromEntries(
  AXIS_ORDER.map((axis) => [axis, z.array(z.string().trim().min(1).max(120)).max(8)])
) as Record<(typeof AXIS_ORDER)[number], z.ZodArray<z.ZodString>>);

export const productAnalysisModelOutputSchema = z.object({
  classification: z.object({
    kind: contentKindSchema,
    confidence: z.number().min(0).max(1),
    reason: z.string().trim().min(1).max(1_000)
  }),
  summary: evidenceNoteSchema,
  subject: evidenceNoteSchema,
  formStructure: z.array(evidenceNoteSchema).max(16),
  cmf: z.object({
    color: z.array(evidenceNoteSchema).max(12),
    material: z.array(evidenceNoteSchema).max(12),
    finish: z.array(evidenceNoteSchema).max(12)
  }),
  composition: evidenceNoteSchema,
  camera: evidenceNoteSchema,
  lighting: evidenceNoteSchema,
  style: evidenceNoteSchema,
  visibleText: z.array(evidenceNoteSchema).max(24),
  evidenceBoundary: z.object({
    observed: z.array(z.string().trim().min(1).max(500)).max(24),
    inferred: z.array(z.string().trim().min(1).max(500)).max(24),
    unknown: z.array(z.string().trim().min(1).max(500)).max(24)
  }),
  prompts: promptPairSchema,
  variants: z.array(analysisPromptVariantSchema).length(3),
  axisSuggestions: axisSuggestionsSchema
});
export type ProductAnalysisModelOutput = z.infer<typeof productAnalysisModelOutputSchema>;

export const productAnalysisResultSchema = productAnalysisModelOutputSchema.extend({
  schemaVersion: z.literal("2.0"),
  measurements: localAnalysisMeasurementsSchema,
  createdAt: z.string().datetime()
});
export type ProductAnalysisResult = z.infer<typeof productAnalysisResultSchema>;

export const analysisRecordSchema = z.object({
  id: z.string().min(1),
  assetId: z.string().min(1),
  captureId: z.string().min(1).optional(),
  mode: analysisModeSchema,
  state: analysisStateSchema,
  providerId: z.string(),
  model: z.string(),
  result: productAnalysisResultSchema.optional(),
  rawResponse: z.unknown().optional(),
  error: z.string().optional(),
  failure: operationFailureSchema.optional(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime()
});
export type AnalysisRecord = z.infer<typeof analysisRecordSchema>;

export const analysisSummarySchema = analysisRecordSchema.pick({
  id: true,
  assetId: true,
  mode: true,
  state: true,
  providerId: true,
  model: true,
  error: true,
  failure: true,
  createdAt: true,
  updatedAt: true
}).extend({
  contentKind: contentKindSchema.optional(),
  summary: z.string().optional(),
  promptZh: z.string().optional(),
  promptEn: z.string().optional()
});
export type AnalysisSummary = z.infer<typeof analysisSummarySchema>;

export const savedPromptSchema = z.object({
  id: z.string().min(1),
  text: z.string().trim().min(1),
  negativeText: z.string().default(""),
  language: z.enum(["zh", "en"]),
  sourceAssetId: z.string().optional(),
  sourceAnalysisId: z.string().optional(),
  variantKind: promptVariantKindSchema.optional(),
  model: z.string().optional(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime()
});
export type SavedPrompt = z.infer<typeof savedPromptSchema>;

export const savePromptInputSchema = savedPromptSchema.omit({ id: true, createdAt: true, updatedAt: true });
export type SavePromptInput = z.infer<typeof savePromptInputSchema>;
