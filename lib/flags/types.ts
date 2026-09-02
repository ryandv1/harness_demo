// Flag-client abstraction shared by the mock and real-FME implementations.

export type FlagMode = "mock" | "fme";

// Which FME environment the app is reading flag definitions from. In FME the
// SDK key is per-environment, so this reflects which env's flag versions are live
// on the page. "mock" = no real environment (local mock client).
export type FlagEnvironmentKind = "staging" | "production" | "mock" | "other";

export interface FlagEnvironmentInfo {
  /** Human label shown in the UI, e.g. "Staging", "Production", "Mock". */
  label: string;
  kind: FlagEnvironmentKind;
}

export interface FlagEvaluation {
  flag: string;
  treatment: string;
  source: FlagMode;
  latencyMicros: number;
  /** Dynamic Configuration: the treatment's JSON payload (string) or null if none. */
  config?: string | null;
}

/** Result of a config-aware evaluation: the chosen arm plus its dynamic-config payload. */
export interface TreatmentWithConfig {
  treatment: string;
  config: string | null;
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
  /**
   * Like getTreatment, but also returns the treatment's Dynamic Configuration
   * (FME treatment "configurations" JSON). Lets a single evaluation pick the arm
   * AND hand back its parameters — change them in FME with no redeploy.
   */
  getTreatmentWithConfig(
    userKey: string,
    flag: string,
    attributes?: Record<string, unknown>
  ): TreatmentWithConfig;
  /**
   * Subscribe to flag-definition changes: real FME streaming (SDK_UPDATE) in
   * live mode, or a local override flip in mock mode. Returns an unsubscribe
   * function.
   */
  onUpdate(callback: () => void): () => void;
  /**
   * Track a metric event (FME's Events API), attributed to whatever treatment
   * `userKey` was previously shown. Traffic type is fixed to "user" — the only
   * traffic type this app's flags use. Returns false on failure (mirrors the
   * real SDK's client.track() return value); mock mode always succeeds.
   */
  track(userKey: string, eventType: string, value?: number): boolean;
}
