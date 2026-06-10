import type { FlagClient, FlagMode } from "./types";
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
}
