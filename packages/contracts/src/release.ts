import { z } from "zod";

const versionSchema = z.string().regex(/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/);
const chromeVersionSchema = z.string().regex(/^\d+$/);
const sha256Schema = z.string().regex(/^[a-f0-9]{64}$/);

export const releaseArtifactSchema = z.object({
  browser: z.literal("chrome"),
  distribution: z.enum(["github-zip", "chrome-web-store"]),
  url: z.string().url(),
  sizeBytes: z.number().int().positive().optional(),
  sha256: sha256Schema.optional()
}).superRefine((artifact, context) => {
  if (artifact.distribution === "github-zip" && (!artifact.sizeBytes || !artifact.sha256)) {
    context.addIssue({ code: "custom", message: "GitHub ZIP artifacts require sizeBytes and sha256." });
  }
});
export type ReleaseArtifact = z.infer<typeof releaseArtifactSchema>;

export const releaseMigrationSchema = z.object({
  required: z.boolean(),
  backupRecommended: z.boolean(),
  notes: z.string().max(300).optional()
});

export const publishedReleaseManifestV2Schema = z.object({
  schemaVersion: z.literal(2),
  status: z.literal("published"),
  version: versionSchema,
  channel: z.enum(["stable", "beta"]),
  publishedAt: z.string().datetime(),
  minimumChrome: chromeVersionSchema,
  bridgeProtocol: z.number().int().positive(),
  dataVersion: z.number().int().positive(),
  minimumDataVersion: z.number().int().positive(),
  migration: releaseMigrationSchema,
  artifacts: z.array(releaseArtifactSchema).min(1),
  notesUrl: z.string().url()
}).refine((manifest) => manifest.minimumDataVersion <= manifest.dataVersion, {
  message: "minimumDataVersion cannot exceed dataVersion",
  path: ["minimumDataVersion"]
});

export const unreleasedManifestV2Schema = z.object({
  schemaVersion: z.literal(2),
  status: z.literal("unreleased"),
  plannedVersion: versionSchema,
  channel: z.enum(["stable", "beta"]),
  minimumChrome: chromeVersionSchema,
  bridgeProtocol: z.number().int().positive(),
  dataVersion: z.number().int().positive(),
  minimumDataVersion: z.number().int().positive()
});

export const publishedReleaseManifestSchema = z.object({
  status: z.literal("published"),
  version: versionSchema,
  channel: z.enum(["stable", "beta"]),
  publishedAt: z.string().datetime(),
  minimumChrome: chromeVersionSchema,
  bridgeProtocol: z.number().int().positive(),
  downloadUrl: z.string().url(),
  sha256: sha256Schema,
  notesUrl: z.string().url(),
  storeUrl: z.string().url().optional()
});

export const unreleasedManifestSchema = z.object({
  status: z.literal("unreleased"),
  plannedVersion: versionSchema,
  minimumChrome: chromeVersionSchema,
  bridgeProtocol: z.number().int().positive()
});

export const releaseManifestV2Schema = z.discriminatedUnion("status", [unreleasedManifestV2Schema, publishedReleaseManifestV2Schema]);
export const legacyReleaseManifestSchema = z.discriminatedUnion("status", [unreleasedManifestSchema, publishedReleaseManifestSchema]);
export const releaseManifestSchema = z.union([releaseManifestV2Schema, legacyReleaseManifestSchema]);

export type PublishedReleaseManifestV2 = z.infer<typeof publishedReleaseManifestV2Schema>;
export type ReleaseManifestV2 = z.infer<typeof releaseManifestV2Schema>;
export type PublishedReleaseManifest = z.infer<typeof publishedReleaseManifestSchema>;
export type ReleaseManifest = z.infer<typeof releaseManifestSchema>;

export interface NormalizedReleaseManifest {
  schemaVersion: 1 | 2;
  status: "published" | "unreleased";
  version: string;
  channel: "stable" | "beta";
  publishedAt?: string;
  minimumChrome: string;
  bridgeProtocol: number;
  dataVersion: number;
  minimumDataVersion: number;
  migration: { required: boolean; backupRecommended: boolean; notes?: string };
  artifacts: ReleaseArtifact[];
  notesUrl?: string;
}

export function normalizeReleaseManifest(input: unknown): NormalizedReleaseManifest {
  const manifest = releaseManifestSchema.parse(input);
  if ("schemaVersion" in manifest) {
    return {
      schemaVersion: 2,
      status: manifest.status,
      version: manifest.status === "published" ? manifest.version : manifest.plannedVersion,
      channel: manifest.channel,
      publishedAt: manifest.status === "published" ? manifest.publishedAt : undefined,
      minimumChrome: manifest.minimumChrome,
      bridgeProtocol: manifest.bridgeProtocol,
      dataVersion: manifest.dataVersion,
      minimumDataVersion: manifest.minimumDataVersion,
      migration: manifest.status === "published" ? manifest.migration : { required: false, backupRecommended: true },
      artifacts: manifest.status === "published" ? manifest.artifacts : [],
      notesUrl: manifest.status === "published" ? manifest.notesUrl : undefined
    };
  }
  const artifacts: ReleaseArtifact[] = manifest.status === "published"
    ? [{ browser: "chrome", distribution: "github-zip", url: manifest.downloadUrl, sha256: manifest.sha256, sizeBytes: 1 }]
    : [];
  if (manifest.status === "published" && manifest.storeUrl) {
    artifacts.push({ browser: "chrome", distribution: "chrome-web-store", url: manifest.storeUrl });
  }
  return {
    schemaVersion: 1,
    status: manifest.status,
    version: manifest.status === "published" ? manifest.version : manifest.plannedVersion,
    channel: manifest.status === "published" ? manifest.channel : "stable",
    publishedAt: manifest.status === "published" ? manifest.publishedAt : undefined,
    minimumChrome: manifest.minimumChrome,
    bridgeProtocol: manifest.bridgeProtocol,
    dataVersion: 1,
    minimumDataVersion: 1,
    migration: { required: false, backupRecommended: true },
    artifacts,
    notesUrl: manifest.status === "published" ? manifest.notesUrl : undefined
  };
}

export function findReleaseArtifact(manifest: NormalizedReleaseManifest, distribution: ReleaseArtifact["distribution"]): ReleaseArtifact | undefined {
  return manifest.artifacts.find((artifact) => artifact.distribution === distribution);
}

export const releaseUpdateNoticeSchema = z.object({
  status: z.enum(["current", "available", "offline"]),
  checkedAt: z.string().datetime(),
  currentVersion: versionSchema,
  latestVersion: versionSchema.optional(),
  url: z.string().url().optional()
});
export type ReleaseUpdateNotice = z.infer<typeof releaseUpdateNoticeSchema>;
