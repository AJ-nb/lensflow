export const LENSFLOW_BACKUP_FORMAT = "lensflow-local-backup" as const;
export const LENSFLOW_BACKUP_SCHEMA_VERSION = 1 as const;

export type BackupImportMode = "merge" | "replace";
export type HistoryRetentionDays = 30 | 90 | 180 | 365 | null;

export interface BackupExport {
  fileName: string;
  mimeType: "application/json";
  text: string;
  exportedAt: string;
}

export interface BackupImportSummary {
  sourceFormat: "lensflow" | "visual-lens";
  imported: Record<string, number>;
  discardedSecrets: boolean;
}

export interface DuplicateAssetGroup {
  fingerprint: string;
  assetIds: string[];
  names: string[];
}

export interface MaintenanceSummary {
  historyRetentionDays: HistoryRetentionDays;
  duplicateGroups: DuplicateAssetGroup[];
  historyEventCount: number;
  completedBatchCount: number;
}
