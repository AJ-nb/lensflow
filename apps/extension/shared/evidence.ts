import type {
  AnalysisResult,
  EvidenceAnchor,
  EvidenceClaimLink,
  MaterialRegion,
  OcrResult,
  SubjectSegmentation
} from "./types";

export interface EvidenceInputs {
  materialRegions?: MaterialRegion[];
  ocrResult?: OcrResult;
  subjectSegmentation?: SubjectSegmentation;
}

export function buildEvidenceAnchors(input: EvidenceInputs): EvidenceAnchor[] {
  const materials = (input.materialRegions ?? []).map((region) => ({
    id: `material:${region.id}`,
    kind: "material-region" as const,
    label: region.name || region.materialFamily || "材料区域",
    rect: region.rect,
    provenance: "user-annotation" as const,
    confidence: 1
  }));
  const ocr = (input.ocrResult?.lines ?? []).map((line, index) => ({
    id: `ocr:${index}`,
    kind: "ocr-line" as const,
    label: line.text,
    rect: line.rect,
    provenance: "local-extraction" as const,
    confidence: clamp(line.confidence)
  }));
  const segmentation = input.subjectSegmentation ? [{
    id: "subject:mask",
    kind: "subject-mask" as const,
    label: "主体分区",
    provenance: "model-estimate" as const,
    confidence: clamp(input.subjectSegmentation.coverage)
  }] : [];
  return [...materials, ...ocr, ...segmentation];
}

export function buildEvidenceLinks(result: AnalysisResult, anchors: EvidenceAnchor[]): EvidenceClaimLink[] {
  const claims = [
    ...result.analysis.designIntelligence.designLanguage.map((item, index) => ({
      id: `design-language:${index}`,
      section: "design-language" as const,
      claimLabel: item.term,
      evidenceText: item.visualEvidence
    })),
    ...result.analysis.designIntelligence.designTechniques.map((item, index) => ({
      id: `design-technique:${index}`,
      section: "design-technique" as const,
      claimLabel: item.technique,
      evidenceText: item.evidence
    })),
    ...result.analysis.cmfAnalysis.materialZones.map((item, index) => ({
      id: `cmf:${index}`,
      section: "cmf" as const,
      claimLabel: item.element,
      evidenceText: [...item.locations, ...item.visibleCues]
    }))
  ];

  return claims.map((claim) => ({
    ...claim,
    evidenceAnchorIds: matchEvidenceAnchorIds(claim.claimLabel, claim.evidenceText, anchors)
  }));
}

export function matchEvidenceAnchorIds(
  claimLabel: string,
  evidenceText: string[],
  anchors: EvidenceAnchor[]
): string[] {
  const claim = { claimLabel, evidenceText };
  return anchors
    .filter((anchor) => anchor.kind !== "subject-mask" && claimMatchesAnchor(claim, anchor))
    .map((anchor) => anchor.id);
}

function claimMatchesAnchor(
  claim: Pick<EvidenceClaimLink, "claimLabel" | "evidenceText">,
  anchor: EvidenceAnchor
): boolean {
  const claimText = normalize([claim.claimLabel, ...claim.evidenceText].join(" "));
  const label = normalize(anchor.label);
  return label.length >= 2 && claimText.includes(label);
}

function normalize(value: string): string {
  return value.toLocaleLowerCase().replace(/[\s\p{P}\p{S}]+/gu, "");
}

function clamp(value: number): number {
  return Math.min(1, Math.max(0, Number.isFinite(value) ? value : 0));
}
