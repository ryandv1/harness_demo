// Flag-client abstraction shared by the mock and real-FME implementations.

export type FlagMode = "mock" | "fme";

export interface FlagEvaluation {
  flag: string;
  treatment: string;
  source: FlagMode;
  latencyMicros: number;
}

export interface FlagClient {
  readonly mode: FlagMode;
  /**
   * Synchronous, local/in-memory evaluation — no network round-trip per check.
   * This is FME's architecture differentiator, so we model the client as sync.
   */
  getTreatment(
    userKey: string,
    flag: string,
    attributes?: Record<string, unknown>
  ): string;
}
