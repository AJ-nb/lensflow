import { z } from "zod";

export const capabilityStatusSchema = z.enum(["supported", "unsupported", "unknown", "error"]);
export type CapabilityStatus = z.infer<typeof capabilityStatusSchema>;

export const providerKindSchema = z.enum(["biyuan", "openai-compatible", "comfyui"]);
export type ProviderKind = z.infer<typeof providerKindSchema>;

export const protocolModeSchema = z.enum(["chat-completions", "responses", "images", "comfyui"]);
export type ProtocolMode = z.infer<typeof protocolModeSchema>;

export const providerProfileSchema = z.object({
  id: z.string().min(1),
  credentialRef: z.string().min(1).max(160).optional(),
  name: z.string().min(1).max(80),
  kind: providerKindSchema,
  baseUrl: z.string().url(),
  protocolMode: protocolModeSchema,
  analysisModel: z.string().max(160).default(""),
  imageModel: z.string().max(160).default(""),
  rememberSecret: z.boolean().default(false),
  comfyWorkflow: z.record(z.string(), z.unknown()).optional(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime()
});
export type ProviderProfile = z.infer<typeof providerProfileSchema>;

export const providerCredentialMutationSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("keep") }),
  z.object({ action: z.literal("replace"), secret: z.string().trim().min(1).max(8192) }),
  z.object({ action: z.literal("clear") })
]);
export type ProviderCredentialMutation = z.infer<typeof providerCredentialMutationSchema>;

export const providerCandidateInputSchema = z.object({
  profile: providerProfileSchema,
  credential: providerCredentialMutationSchema
});
export type ProviderCandidateInput = z.infer<typeof providerCandidateInputSchema>;

export const providerCredentialStateSchema = z.enum(["missing", "session", "device"]);
export type ProviderCredentialState = z.infer<typeof providerCredentialStateSchema>;

export const providerEditorStateSchema = z.object({
  active: providerProfileSchema.nullable(),
  draft: providerProfileSchema.nullable(),
  activeCredentialState: providerCredentialStateSchema,
  draftCredentialState: providerCredentialStateSchema
});
export type ProviderEditorState = z.infer<typeof providerEditorStateSchema>;

export const DEFAULT_BIYUAN_PROFILE: ProviderProfile = {
  id: "biyuan",
  name: "彼源",
  kind: "biyuan",
  baseUrl: "https://api.biyuan.ai/v1",
  protocolMode: "responses",
  analysisModel: "",
  imageModel: "",
  rememberSecret: false,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z"
};

export const modelDescriptorSchema = z.object({
  id: z.string().min(1),
  ownedBy: z.string().optional(),
  created: z.number().optional(),
  modalities: z.array(z.enum(["text", "image", "video", "audio"])).default([]),
  raw: z.record(z.string(), z.unknown()).optional()
});
export type ModelDescriptor = z.infer<typeof modelDescriptorSchema>;

export const providerCapabilitiesSchema = z.object({
  authentication: capabilityStatusSchema,
  visionInput: capabilityStatusSchema,
  structuredOutputs: capabilityStatusSchema,
  imageGeneration: capabilityStatusSchema,
  imageEditing: capabilityStatusSchema,
  backgroundTasks: capabilityStatusSchema,
  cancellation: capabilityStatusSchema
});
export type ProviderCapabilities = z.infer<typeof providerCapabilitiesSchema>;

export const UNKNOWN_CAPABILITIES: ProviderCapabilities = {
  authentication: "unknown",
  visionInput: "unknown",
  structuredOutputs: "unknown",
  imageGeneration: "unknown",
  imageEditing: "unknown",
  backgroundTasks: "unknown",
  cancellation: "unknown"
};

export interface ProviderConnectionResult {
  reachable: true;
  endpoint: string;
  latencyMs: number;
  models: ModelDescriptor[];
  warnings: string[];
}

export interface AnalyzeInput {
  prompt: string;
  imageDataUrl?: string;
  schema?: Record<string, unknown>;
  signal?: AbortSignal;
}

export interface AnalyzeResult {
  text: string;
  structured?: unknown;
  model: string;
  raw?: unknown;
}

export interface GenerateInput {
  prompt: string;
  model: string;
  size: string;
  quality: string;
  count: number;
  references?: Array<{ kind: "palette" | "pose" | "face" | "image"; dataUrl: string }>;
  async?: boolean;
  signal?: AbortSignal;
}

export interface EditInput extends Omit<GenerateInput, "count"> {
  image: Blob;
  mask?: Blob;
  additionalImages?: Array<{ kind: "palette" | "pose" | "face" | "image"; image: Blob }>;
}

export interface ProviderImage {
  dataUrl?: string;
  url?: string;
  revisedPrompt?: string;
}

export interface ProviderTaskResult {
  remoteId?: string;
  remoteClientId?: string;
  state: "queued" | "running" | "succeeded" | "failed";
  images: ProviderImage[];
  error?: string;
  raw?: unknown;
}

export interface ProviderAdapter {
  listModels(profile: ProviderProfile, secret: string, signal?: AbortSignal): Promise<ModelDescriptor[]>;
  testConnection(profile: ProviderProfile, secret: string, signal?: AbortSignal): Promise<ProviderConnectionResult>;
  probeCapabilities(profile: ProviderProfile, secret: string, signal?: AbortSignal): Promise<ProviderCapabilities>;
  analyze(profile: ProviderProfile, secret: string, input: AnalyzeInput): Promise<AnalyzeResult>;
  generate(profile: ProviderProfile, secret: string, input: GenerateInput): Promise<ProviderTaskResult>;
  edit(profile: ProviderProfile, secret: string, input: EditInput): Promise<ProviderTaskResult>;
  retrieve(profile: ProviderProfile, secret: string, remoteId: string, signal?: AbortSignal): Promise<ProviderTaskResult>;
  cancel(profile: ProviderProfile, secret: string, remoteId: string, signal?: AbortSignal): Promise<boolean>;
  capabilities(profile: ProviderProfile): ProviderCapabilities;
}

export interface ProviderSecretStore {
  get(providerId: string): Promise<string | undefined>;
  state(providerId: string): Promise<ProviderCredentialState>;
  set(providerId: string, secret: string, persist: boolean): Promise<void>;
  remove(providerId: string): Promise<void>;
}
