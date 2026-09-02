import type { FlagClient, FlagMode, TreatmentWithConfig } from "./types";
import { SplitFactory } from "@splitsoftware/splitio";

// Real Harness FME (Split) server-side SDK wrapper. Only instantiated when an
// FME_SDK_KEY is present. After the factory is ready, getTreatment() evaluates
// locally/in-memory — no per-check network call (the architecture differentiator).
//
// Types are loosened to `any` in a couple of spots to stay resilient across SDK
// minor versions; the behavior is the documented Node server-side API.
export class FmeFlagClient implements FlagClient {
  readonly mode: FlagMode = "fme";

  private constructor(private client: any) {}

  static async create(sdkKey: string): Promise<FmeFlagClient> {
    const factory = (SplitFactory as any)({
      core: { authorizationKey: sdkKey },
      // Streaming is on by default → flag changes in the FME UI propagate in ~real time.
      startup: { readyTimeout: 10 },
    });
    const client = factory.client();
    await client.ready();
    return new FmeFlagClient(client);
  }

  getTreatment(
    userKey: string,
    flag: string,
    attributes?: Record<string, unknown>
  ): string {
    return this.client.getTreatment(userKey, flag, attributes as any);
  }

  getTreatmentWithConfig(
    userKey: string,
    flag: string,
    attributes?: Record<string, unknown>
  ): TreatmentWithConfig {
    // SDK returns { treatment, config } where config is a JSON string or null.
    const r = this.client.getTreatmentWithConfig(userKey, flag, attributes as any);
    return { treatment: r.treatment, config: r.config ?? null };
  }

  // Fires whenever streaming delivers new targeting rules from the FME backend —
  // this is what lets a flag change in the Harness UI reach a running app with
  // no redeploy AND no polling.
  onUpdate(callback: () => void): () => void {
    this.client.on(this.client.Event.SDK_UPDATE, callback);
    return () => this.client.removeListener(this.client.Event.SDK_UPDATE, callback);
  }

  // Real FME metric capture: client.track(key, trafficType, eventType, value).
  // Traffic type is fixed to "user" (the only one this app's flags use).
  track(userKey: string, eventType: string, value?: number): boolean {
    return this.client.track(userKey, "user", eventType, value);
  }
}
