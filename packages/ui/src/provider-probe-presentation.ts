import {
  CAPABILITY_KEYS,
  type CapabilityKey,
  type CapabilityStatus,
  type ModelDescriptor,
  type OperationFailure,
  type ProviderCapabilityProbeResult,
  type ProviderEditorState,
  type ProviderProfile
} from "@lensflow/contracts";

const capabilityLabels: Record<CapabilityKey, string> = {
  authentication: "鉴权",
  visionInput: "图像输入",
  structuredOutputs: "结构化输出",
  imageGeneration: "图片生成",
  imageEditing: "图片编辑",
  backgroundTasks: "后台任务",
  cancellation: "取消任务"
};

const capabilityStatusLabels: Record<CapabilityStatus, string> = {
  supported: "已验证",
  unsupported: "不支持",
  unknown: "未验证",
  error: "检测失败"
};

export interface ProbeFailureSummary {
  key: CapabilityKey;
  label: string;
  failure: OperationFailure;
}

export function capabilityLabel(key: CapabilityKey): string {
  return capabilityLabels[key];
}

export function capabilityStatusLabel(status: CapabilityStatus): string {
  return capabilityStatusLabels[status];
}

export function probeFailureSummaries(result: ProviderCapabilityProbeResult): ProbeFailureSummary[] {
  return CAPABILITY_KEYS.flatMap((key) => {
    const failure = result.failures[key];
    return failure ? [{ key, label: capabilityLabel(key), failure }] : [];
  });
}

export interface ActivationStatus {
  tone: "success" | "warning";
  message: string;
}

export function activationStatus(result: ProviderCapabilityProbeResult | undefined): ActivationStatus {
  if (!result) return { tone: "warning", message: "连接已验证并启用，能力尚未验证。" };
  const incomplete = CAPABILITY_KEYS.some((key) => result.capabilities[key] === "unknown" || result.capabilities[key] === "error")
    || Object.keys(result.failures).length > 0;
  return incomplete
    ? { tone: "warning", message: "连接已验证并启用，能力未完全验证。" }
    : { tone: "success", message: "已验证并启用 Provider。" };
}

export function modelAssignmentWarning(profile: ProviderProfile, models: ModelDescriptor[]): string | null {
  if (!profile.analysisModel || profile.analysisModel !== profile.imageModel) return null;
  const descriptor = models.find((model) => model.id === profile.analysisModel);
  if (!descriptor) return `目录中未找到「${profile.analysisModel}」；它同时用于分析和图片任务。此处不作能力结论，请先检测能力或刷新目录。`;
  if (descriptor.modalities.length > 0) return null;
  return `目录未声明「${descriptor.id}」的能力；它同时用于分析和图片任务。此处不作能力结论，请先检测能力或改选不同模型。`;
}
