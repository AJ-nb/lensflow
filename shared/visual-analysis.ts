import { z } from "zod";

const confidence = z.number().min(0).max(1);
const stringList = z.array(z.string());

export const VisualAnalysisSchema = z.strictObject({
  title: z.string(),
  description: z.string(),
  visualIntent: z.string(),
  designIntelligence: z.strictObject({
    domain: z.string(),
    designLanguage: z.array(z.strictObject({
      term: z.string(),
      visualEvidence: stringList,
      effect: z.string(),
      confidence
    })),
    designTechniques: z.array(z.strictObject({
      technique: z.string(),
      implementation: z.string(),
      evidence: stringList,
      transferableRule: z.string(),
      misuseRisk: z.string(),
      confidence
    })),
    formLineageHypotheses: z.array(z.strictObject({
      hypothesis: z.string(),
      visualBasis: stringList,
      alternativeExplanation: z.string(),
      verificationQueries: stringList,
      confidence
    })),
    analogousStrategies: z.array(z.strictObject({
      strategy: z.string(),
      sharedMechanism: stringList,
      meaningfulDifference: stringList,
      applicableDomains: stringList,
      searchQueries: stringList,
      confidence
    })),
    transferablePrinciples: z.array(z.strictObject({
      principle: z.string(),
      preserve: stringList,
      adapt: stringList,
      avoidCopying: stringList,
      validationMethod: stringList
    })),
    recommendedDirections: z.array(z.strictObject({
      directionType: z.enum(["设计手法", "设计语言"]),
      name: z.string(),
      rationale: z.string(),
      transferableMechanisms: stringList,
      variablesToChange: stringList,
      misuseRisk: z.string(),
      searchQueries: stringList,
      confidence
    })),
    referenceCandidates: z.array(z.strictObject({
      referenceType: z.enum(["产品", "作品", "设计师", "工作室", "设计运动"]),
      name: z.string(),
      relevance: z.string(),
      sharedMechanisms: stringList,
      avoidCopying: stringList,
      verificationQueries: stringList,
      evidenceType: z.enum(["视觉类比", "知识候选"]),
      confidence
    })),
    learningBrief: z.strictObject({
      learningValue: z.string(),
      signatureMechanisms: z.array(z.strictObject({
        mechanism: z.string(),
        evidence: stringList,
        preserve: stringList,
        vary: stringList,
        avoidCopying: stringList,
        confidence
      })),
      decisionTradeoffs: z.array(z.strictObject({
        decision: z.string(),
        apparentBenefit: z.string(),
        likelyCost: z.string(),
        evidence: stringList,
        verification: stringList,
        confidence
      })),
      studyExercise: z.strictObject({
        brief: z.string(),
        constraintsToKeep: stringList,
        variablesToChange: stringList,
        successCriteria: stringList,
        evidenceToCollect: stringList
      }),
      recommendedDeepDives: stringList
    }),
    evidenceBoundary: z.strictObject({
      observed: stringList,
      inferred: stringList,
      unknown: stringList,
      overallConfidence: confidence
    })
  }),
  subject: z.strictObject({
    primary: z.string(),
    count: z.number().int().min(0),
    attributes: stringList,
    poseOrState: z.string(),
    expression: z.string(),
    wardrobeOrStyling: stringList,
    secondaryObjects: stringList,
    confidence
  }),
  sceneStructure: z.strictObject({
    sceneType: z.string(),
    foreground: stringList,
    midground: stringList,
    background: stringList,
    spatialRelationships: stringList,
    occlusions: stringList,
    focalPoints: stringList,
    negativeSpace: z.string(),
    geometricStructure: stringList,
    confidence
  }),
  formStructure: z.strictObject({
    category: z.string(),
    overallSilhouette: z.string(),
    primaryVolumes: stringList,
    secondaryVolumes: stringList,
    proportionRelationships: stringList,
    axesAndSymmetry: z.string(),
    edgesAndTransitions: stringList,
    openingsAndCutouts: stringList,
    jointsAndConnections: stringList,
    surfaceContinuity: stringList,
    frontViewCues: stringList,
    sideViewCues: stringList,
    topViewCues: stringList,
    hiddenGeometryAssumptions: stringList,
    manufacturabilityNotes: stringList,
    confidence
  }),
  orthographicPlan: z.strictObject({
    canonicalOrientation: z.string(),
    frontDefinition: z.string(),
    leftDefinition: z.string(),
    topDefinition: z.string(),
    coordinateAxes: z.strictObject({
      widthAxis: z.string(),
      heightAxis: z.string(),
      depthAxis: z.string()
    }),
    sharedScaleBasis: z.string(),
    estimatedDimensionRatios: stringList,
    crossViewLandmarks: stringList,
    alignmentConstraints: stringList,
    inferredSurfaceTreatment: z.string(),
    viewConfidence: z.strictObject({
      front: confidence,
      left: confidence,
      top: confidence
    })
  }),
  composition: z.strictObject({
    layout: z.string(),
    subjectPlacement: z.string(),
    crop: z.string(),
    balance: z.string(),
    symmetry: z.string(),
    leadingLines: z.string(),
    perspective: z.string(),
    depth: z.string(),
    confidence
  }),
  colorAnalysis: z.strictObject({
    harmony: z.string(),
    temperature: z.string(),
    saturation: z.string(),
    contrast: z.string(),
    distribution: z.string(),
    backgroundColorRole: z.string(),
    accentColorRole: z.string(),
    skinToneHandling: z.string(),
    grading: z.string(),
    confidence
  }),
  cmfAnalysis: z.strictObject({
    summary: z.string(),
    colorSystem: z.strictObject({
      roles: z.array(z.strictObject({
        role: z.string(),
        description: z.string(),
        measuredHexCandidates: stringList,
        pantoneCandidates: z.array(z.strictObject({
          name: z.string(),
          coatedOrUncoated: z.string(),
          rationale: z.string(),
          confidence
        })),
        estimatedImageProportion: z.number().min(0).max(1),
        locations: stringList,
        confidence
      })),
      hierarchy: z.string(),
      harmony: z.string(),
      temperature: z.string(),
      saturation: z.string(),
      contrast: z.string(),
      distribution: z.string(),
      interaction: z.string(),
      backgroundInfluence: z.string(),
      reproductionRisks: stringList,
      confidence
    }),
    materialZones: z.array(z.strictObject({
      element: z.string(),
      locations: stringList,
      visibleCues: stringList,
      likelyMaterialFamilies: stringList,
      texture: z.string(),
      apparentHardness: z.string(),
      translucency: z.string(),
      reflectance: z.string(),
      constructionClues: stringList,
      unknowns: stringList,
      confidence
    })),
    finishZones: z.array(z.strictObject({
      element: z.string(),
      glossLevel: z.string(),
      apparentRoughness: z.string(),
      textureScale: z.string(),
      coatingOrPlatingClues: stringList,
      edgeTreatment: z.string(),
      patternDirection: z.string(),
      visibleWearState: z.string(),
      unknowns: stringList,
      confidence
    })),
    interfaces: z.array(z.strictObject({
      fromElement: z.string(),
      toElement: z.string(),
      boundaryType: z.string(),
      transitionDescription: z.string(),
      hardwareRelationship: z.string(),
      confidence
    })),
    durabilityAndAging: z.array(z.strictObject({
      category: z.string(),
      affectedElements: stringList,
      visibleEvidence: stringList,
      risk: z.string(),
      unknowns: stringList,
      confidence
    })),
    relatedReferences: z.strictObject({
      sourcePageUrl: z.string(),
      productSearches: z.array(z.strictObject({
        label: z.string(),
        query: z.string(),
        searchUrl: z.string(),
        matchedCmfFeatures: stringList,
        relevance: z.string(),
        confidence
      })),
      componentSearches: z.array(z.strictObject({
        label: z.string(),
        query: z.string(),
        searchUrl: z.string(),
        matchedCmfFeatures: stringList,
        relevance: z.string(),
        confidence
      }))
    }),
    evidenceBoundary: z.strictObject({
      observed: stringList,
      inferred: stringList,
      unknown: stringList,
      overallConfidence: confidence
    })
  }),
  lighting: z.strictObject({
    sourceCount: z.number().int().min(0),
    direction: z.string(),
    quality: z.string(),
    colorTemperature: z.string(),
    exposure: z.string(),
    shadows: z.string(),
    highlights: z.string(),
    atmosphere: z.string(),
    timeOfDay: z.string(),
    confidence
  }),
  camera: z.strictObject({
    shotType: z.string(),
    angle: z.string(),
    estimatedFocalLength: z.string(),
    estimatedAperture: z.string(),
    depthOfField: z.string(),
    focus: z.string(),
    distortion: z.string(),
    motion: z.string(),
    confidence
  }),
  style: z.strictObject({
    medium: z.string(),
    genre: z.string(),
    era: z.string(),
    mood: z.string(),
    references: stringList,
    postProcessing: stringList,
    confidence
  }),
  materials: z.array(
    z.strictObject({
      element: z.string(),
      material: z.string(),
      surface: z.string(),
      microTexture: z.string(),
      opticalProperties: stringList,
      confidence
    })
  ),
  typography: z.strictObject({
    present: z.boolean(),
    text: stringList,
    typeStyle: z.string(),
    placement: z.string(),
    confidence
  }),
  reconstruction: z.strictObject({
    positivePrompt: z.string(),
    negativePrompt: z.string(),
    aspectRatio: z.string(),
    mustPreserve: stringList,
    flexibleElements: stringList,
    unknowns: stringList,
    fidelityNotes: stringList
  }),
  confidence: z.strictObject({
    overall: confidence,
    observedFacts: stringList,
    inferredDetails: stringList,
    uncertainDetails: stringList
  })
});

export const VisualAnalysisCoreSchema = VisualAnalysisSchema.pick({
  title: true,
  description: true,
  visualIntent: true,
  subject: true,
  sceneStructure: true,
  formStructure: true,
  orthographicPlan: true,
  composition: true,
  lighting: true,
  camera: true,
  style: true,
  typography: true,
  reconstruction: true,
  confidence: true
});

export const VisualAnalysisDesignSchema = VisualAnalysisSchema.pick({
  designIntelligence: true
});

export const VisualAnalysisCmfSchema = VisualAnalysisSchema.pick({
  colorAnalysis: true,
  cmfAnalysis: true,
  materials: true
});

export type VisualAnalysis = z.infer<typeof VisualAnalysisSchema>;
