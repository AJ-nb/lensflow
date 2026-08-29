import { z } from "zod";

export const publishedReleaseManifestSchema = z.object({
  status: z.literal("published"),
  version: z.string().regex(/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/),
  channel: z.enum(["stable", "beta"]),
  publishedAt: z.string().datetime(),
  minimumChrome: z.string().regex(/^\d+$/),
  bridgeProtocol: z.number().int().positive(),
  downloadUrl: z.string().url(),
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
  notesUrl: z.string().url(),
  storeUrl: z.string().url().optional()
});
export const unreleasedManifestSchema = z.object({
  status: z.literal("unreleased"),
  plannedVersion: z.string().regex(/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/),
  minimumChrome: z.string().regex(/^\d+$/),
  bridgeProtocol: z.number().int().positive()
});
export const releaseManifestSchema = z.discriminatedUnion("status", [unreleasedManifestSchema, publishedReleaseManifestSchema]);
export type PublishedReleaseManifest = z.infer<typeof publishedReleaseManifestSchema>;
export type ReleaseManifest = z.infer<typeof releaseManifestSchema>;
