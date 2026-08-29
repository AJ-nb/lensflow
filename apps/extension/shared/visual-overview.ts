import { z } from "zod";

const confidence = z.number().min(0).max(1);
const stringList = z.array(z.string());

export const VisualOverviewSchema = z.strictObject({
  title: z.string(),
  summary: z.string(),
  domain: z.string(),
  primarySubject: z.string(),
  visualIntent: z.string(),
  learningValue: z.string(),
  formSnapshot: z.strictObject({
    silhouette: z.string(),
    primaryVolumes: stringList,
    structureCues: stringList
  }),
  designLanguage: z.array(z.strictObject({
    term: z.string(),
    evidence: stringList,
    effect: z.string(),
    confidence
  })),
  designTechniques: z.array(z.strictObject({
    technique: z.string(),
    evidence: stringList,
    transferableRule: z.string(),
    confidence
  })),
  cmfSnapshot: z.strictObject({
    colorRoles: stringList,
    materialCues: stringList,
    finishCues: stringList
  }),
  designDna: z.array(z.strictObject({
    mechanism: z.string(),
    evidence: stringList,
    variableToExplore: z.string(),
    confidence
  })),
  recommendedDeepDives: stringList,
  biggestUnknown: z.string(),
  confidence: z.strictObject({
    overall: confidence,
    observed: stringList,
    inferred: stringList,
    unknown: stringList
  })
});

export type VisualOverview = z.infer<typeof VisualOverviewSchema>;
