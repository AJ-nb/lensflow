import { describe, expect, it } from "vitest";
import { DEFAULT_BIYUAN_PROFILE, type ProviderCapabilityProbeResult } from "@lensflow/contracts";
import { activationStatus, capabilityStatusLabel, modelAssignmentWarning, probeFailureSummaries } from "./provider-probe-presentation";

const probeResult: ProviderCapabilityProbeResult = {
  capabilities: {
    authentication: "supported",
    visionInput: "error",
    structuredOutputs: "unsupported",
    imageGeneration: "unknown",
    imageEditing: "unknown",
    backgroundTasks: "unknown",
    cancellation: "unsupported"
  },
  failures: {
    visionInput: {
      category: "upstream",
      retryable: true,
      summary: "图像输入探测失败",
      guidance: "稍后重试或检查服务日志。",
      status: 502,
      requestId: "req_probe_123",
      technicalDetails: "upstream response\nrequest failed"
    }
  }
};

describe("Provider probe presentation", () => {
  it("translates capability statuses for the provider dialog", () => {
    expect(capabilityStatusLabel("supported")).toBe("已验证");
    expect(capabilityStatusLabel("unsupported")).toBe("不支持");
    expect(capabilityStatusLabel("unknown")).toBe("未验证");
    expect(capabilityStatusLabel("error")).toBe("检测失败");
  });

  it("preserves probe failure details in capability order", () => {
    expect(probeFailureSummaries(probeResult)).toEqual([
      expect.objectContaining({
        key: "visionInput",
        label: "图像输入",
        failure: expect.objectContaining({ status: 502, requestId: "req_probe_123", technicalDetails: "upstream response\nrequest failed" })
      })
    ]);
  });

  it("warns about an undeclared dual-purpose model without claiming it is unsupported", () => {
    const profile = { ...DEFAULT_BIYUAN_PROFILE, analysisModel: "model-unknown", imageModel: "model-unknown" };
    expect(modelAssignmentWarning(profile, [{ id: "model-unknown", modalities: [] }])).toContain("目录未声明");
    expect(modelAssignmentWarning(profile, [])).toContain("目录中未找到");
    expect(modelAssignmentWarning(profile, [{ id: "model-unknown", modalities: [] }])).not.toContain("不支持");
    expect(modelAssignmentWarning(profile, [{ id: "model-unknown", modalities: ["text", "image"] }])).toBeNull();
  });

  it("only reports a green activation after every probed capability is conclusive", () => {
    expect(activationStatus(undefined)).toMatchObject({ tone: "warning", message: "连接已验证并启用，能力尚未验证。" });
    expect(activationStatus(probeResult)).toMatchObject({ tone: "warning", message: "连接已验证并启用，能力未完全验证。" });
    expect(activationStatus({
      capabilities: { ...probeResult.capabilities, visionInput: "supported", structuredOutputs: "unsupported", imageGeneration: "supported", imageEditing: "unsupported", backgroundTasks: "unsupported" },
      failures: {}
    })).toMatchObject({ tone: "success", message: "已验证并启用 Provider。" });
    expect(activationStatus({
      capabilities: { ...probeResult.capabilities, visionInput: "supported", structuredOutputs: "supported", imageGeneration: "supported", imageEditing: "supported", backgroundTasks: "supported" },
      failures: probeResult.failures
    })).toMatchObject({ tone: "warning", message: "连接已验证并启用，能力未完全验证。" });
  });
});
