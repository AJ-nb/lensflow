import { describe, expect, it, vi } from "vitest";
import {
  DEFAULT_BIYUAN_PROFILE,
  type AssetRecord,
  type ProductAnalysisModelOutput,
  type ProviderAdapter
} from "@lensflow/contracts";
import { localMeasurementsFromAsset, parseProductAnalysisOutput, runProductAnalysisRequest } from "./product-analysis";

const observed = (value: string) => ({ value, source: "observed" as const, confidence: 0.9 });

function modelOutput(kind: ProductAnalysisModelOutput["classification"]["kind"]): ProductAnalysisModelOutput {
  const pair = { positive: { zh: "白色便携音箱，产品摄影", en: "white portable speaker, product photography" }, negative: { zh: "变形，文字错误", en: "deformation, broken text" } };
  return {
    classification: { kind, confidence: 0.92, reason: "可见独立实体与商业展示构图" },
    summary: observed("白色圆柱形便携音箱"),
    subject: observed("单一消费电子产品"),
    formStructure: [observed("圆柱主体与顶部控制面")],
    cmf: { color: [observed("低饱和白色")], material: [{ value: "塑料或涂层材质", source: "inferred" }], finish: [observed("哑光表面")] },
    composition: observed("居中构图"), camera: observed("平视近景"), lighting: observed("左上柔光"), style: observed("克制的商业产品摄影"), visibleText: [],
    evidenceBoundary: { observed: ["圆柱轮廓"], inferred: ["具体材质"], unknown: ["内部结构"] },
    prompts: pair,
    variants: [
      { kind: "faithful", label: "忠实复现", prompts: pair },
      { kind: "commercial", label: "商业呈现", prompts: pair },
      { kind: "exploratory", label: "概念变化", prompts: pair }
    ],
    axisSuggestions: { style: ["商业摄影"], subject: ["便携音箱"], composition: ["居中"], color: ["低饱和白"], motion: ["静态"] }
  };
}

function asset(): AssetRecord {
  return {
    id: "asset-1", kind: "capture", name: "speaker.png", dataUrl: "data:image/png;base64,AA==",
    metadata: {
      width: { value: 1200, source: "measured" }, height: { value: 800, source: "measured" },
      aspectRatio: { value: "3:2", source: "measured" }, palette: { value: [{ hex: "#ffffff", proportion: 0.75 }], source: "measured" }
    },
    createdAt: "2026-08-30T00:00:00.000Z", updatedAt: "2026-08-30T00:00:00.000Z"
  };
}

describe("product analysis core", () => {
  it("preserves product/general classification and never lets model output replace measured fields", () => {
    const measurements = localMeasurementsFromAsset(asset());
    const product = parseProductAnalysisOutput({ ...modelOutput("product"), measurements: { width: 1 } }, measurements, "2026-08-30T00:00:00.000Z");
    expect(product.result.classification.kind).toBe("product");
    expect(product.result.measurements.width).toEqual({ value: 1200, source: "measured" });
    expect(product.result.measurements.palette.value?.[0]?.hex).toBe("#ffffff");
    expect(parseProductAnalysisOutput(modelOutput("person"), measurements).result.classification.kind).toBe("person");
  });

  it("salvages malformed structured output as partial while keeping bilingual prompts and three variants", () => {
    const parsed = parseProductAnalysisOutput({ classification: { kind: "product" }, prompts: { positive: { zh: "产品" } } }, localMeasurementsFromAsset(asset()));
    expect(parsed.partial).toBe(true);
    expect(parsed.result.prompts.positive.zh).toBe("产品");
    expect(parsed.result.prompts.positive.en).toBeTruthy();
    expect(parsed.result.variants.map((item) => item.kind)).toEqual(["faithful", "commercial", "exploratory"]);
  });

  it("performs exactly one Provider call and never retries a failure", async () => {
    const analyze = vi.fn().mockResolvedValue({ text: "", structured: modelOutput("product"), model: "vision", raw: { id: "one" } });
    const adapter = { analyze } as unknown as ProviderAdapter;
    const result = await runProductAnalysisRequest({ adapter, profile: { ...DEFAULT_BIYUAN_PROFILE, analysisModel: "vision" }, secret: "local-test", asset: asset(), mode: "quick" });
    expect(analyze).toHaveBeenCalledTimes(1);
    expect(result.partial).toBe(false);

    const failedAnalyze = vi.fn().mockRejectedValue(new Error("429"));
    await expect(runProductAnalysisRequest({ adapter: { analyze: failedAnalyze } as unknown as ProviderAdapter, profile: { ...DEFAULT_BIYUAN_PROFILE, analysisModel: "vision" }, secret: "local-test", asset: asset(), mode: "quick" })).rejects.toThrow("429");
    expect(failedAnalyze).toHaveBeenCalledTimes(1);
  });

  it("runs deep analysis as exactly three independent segments and merges the quick result", async () => {
    const quick = parseProductAnalysisOutput(modelOutput("product"), localMeasurementsFromAsset(asset())).result;
    const deep = modelOutput("product");
    const analyze = vi.fn()
      .mockResolvedValueOnce({ text: "", structured: {
        classification: deep.classification,
        summary: observed("深入摘要"),
        subject: deep.subject,
        formStructure: [observed("深入结构")],
        evidenceBoundary: deep.evidenceBoundary
      }, model: "vision", raw: { id: "form" } })
      .mockResolvedValueOnce({ text: "", structured: { cmf: deep.cmf, visibleText: deep.visibleText }, model: "vision", raw: { id: "cmf" } })
      .mockResolvedValueOnce({ text: "", structured: {
        composition: deep.composition,
        camera: deep.camera,
        lighting: deep.lighting,
        style: deep.style,
        prompts: deep.prompts,
        variants: deep.variants,
        axisSuggestions: deep.axisSuggestions
      }, model: "vision", raw: { id: "presentation" } });

    const result = await runProductAnalysisRequest({
      adapter: { analyze } as unknown as ProviderAdapter,
      profile: { ...DEFAULT_BIYUAN_PROFILE, analysisModel: "vision" },
      secret: "local-test",
      asset: asset(),
      mode: "deep",
      baseResult: quick
    });

    expect(analyze).toHaveBeenCalledTimes(3);
    expect(result.partial).toBe(false);
    expect(result.result.summary.value).toBe("深入摘要");
    expect(result.result.formStructure[0]?.value).toBe("深入结构");
    expect(result.rawResponse).toEqual({ form: { id: "form" }, cmf: { id: "cmf" }, presentation: { id: "presentation" } });
  });

  it("keeps valid deep-analysis segments when one segment fails and does not retry", async () => {
    const quick = parseProductAnalysisOutput(modelOutput("product"), localMeasurementsFromAsset(asset())).result;
    const deep = modelOutput("product");
    const analyze = vi.fn()
      .mockResolvedValueOnce({ text: "", structured: {
        classification: deep.classification,
        summary: observed("保留的深入摘要"),
        subject: deep.subject,
        formStructure: deep.formStructure,
        evidenceBoundary: deep.evidenceBoundary
      }, model: "vision", raw: { id: "form" } })
      .mockRejectedValueOnce(new Error("CMF timeout"))
      .mockResolvedValueOnce({ text: "", structured: {
        composition: deep.composition,
        camera: deep.camera,
        lighting: deep.lighting,
        style: deep.style,
        prompts: deep.prompts,
        variants: deep.variants,
        axisSuggestions: deep.axisSuggestions
      }, model: "vision", raw: { id: "presentation" } });

    const result = await runProductAnalysisRequest({
      adapter: { analyze } as unknown as ProviderAdapter,
      profile: { ...DEFAULT_BIYUAN_PROFILE, analysisModel: "vision" },
      secret: "local-test",
      asset: asset(),
      mode: "deep",
      baseResult: quick
    });

    expect(analyze).toHaveBeenCalledTimes(3);
    expect(result.partial).toBe(true);
    expect(result.result.summary.value).toBe("保留的深入摘要");
    expect(result.result.cmf.color[0]?.value).toBe("低饱和白色");
    expect(result.segmentErrors).toEqual(["cmf: CMF timeout"]);
  });
});
