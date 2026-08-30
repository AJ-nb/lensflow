import type { AnalysisRecord, BridgeRequest } from "@lensflow/contracts";

export function analysisRecordForBridge(record: AnalysisRecord): AnalysisRecord {
  const { rawResponse: _rawResponse, ...safe } = record;
  return safe;
}

export class BridgeReplayGuard {
  private readonly seen = new Map<string, number>();

  constructor(
    private readonly requestMaxAgeMs = 120_000,
    private readonly replayRetentionMs = 300_000
  ) {}

  assertFresh(request: BridgeRequest, now = Date.now()): void {
    if (Math.abs(now - request.timestamp) > this.requestMaxAgeMs) throw new Error("桥接请求已过期。");
    this.prune(now);
    const key = `${request.nonce}:${request.id}`;
    if (this.seen.has(key)) throw new Error("拒绝重复桥接请求。");
    this.seen.set(key, now);
  }

  private prune(now: number) {
    for (const [key, time] of this.seen) if (now - time > this.replayRetentionMs) this.seen.delete(key);
  }
}
