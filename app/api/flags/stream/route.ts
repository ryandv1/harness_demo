import { getUserData } from "@/lib/db";
import { evaluateAllFlags, getFlagClient, getFlagMode, getFlagEnvironment } from "@/lib/flags";

export const dynamic = "force-dynamic";

// Server-Sent Events bridge for live flag updates. The FME SDK's SDK_UPDATE
// event (real streaming in live mode, or a demo toggle in mock mode) fires
// inside this Node process — it can't reach the browser on its own, so this
// route keeps one HTTP connection open per tab and forwards each change as
// an SSE message. No polling on either side.
export async function GET(req: Request) {
  const userId = new URL(req.url).searchParams.get("userId");
  if (!userId) {
    return new Response("userId is required", { status: 400 });
  }
  const data = getUserData(userId);
  if (!data) {
    return new Response("User not found", { status: 404 });
  }
  const attributes = { tier: data.user.tier };

  const client = await getFlagClient();
  const encoder = new TextEncoder();
  let unsubscribe: (() => void) | null = null;
  let heartbeat: ReturnType<typeof setInterval> | null = null;

  const stream = new ReadableStream({
    async start(controller) {
      const push = async () => {
        const evaluations = await evaluateAllFlags(userId, attributes);
        const payload = { mode: getFlagMode(), environment: getFlagEnvironment(), evaluations };
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`));
      };

      // Send current state right away, then again on every future change.
      await push();
      unsubscribe = client.onUpdate(() => {
        push().catch(() => {});
      });

      // Idle SSE connections can get dropped by proxies; a comment line every
      // 25s keeps this one alive without triggering an onmessage in the browser.
      heartbeat = setInterval(() => {
        controller.enqueue(encoder.encode(`: ping\n\n`));
      }, 25000);
    },
    cancel() {
      unsubscribe?.();
      if (heartbeat) clearInterval(heartbeat);
    },
  });

  req.signal.addEventListener("abort", () => {
    unsubscribe?.();
    if (heartbeat) clearInterval(heartbeat);
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
