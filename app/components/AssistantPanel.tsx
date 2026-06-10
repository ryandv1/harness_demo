"use client";

import { useEffect, useRef, useState } from "react";
import type { AssistantSource } from "@/lib/ai/claude";

interface ChatMessage {
  role: "user" | "assistant";
  text: string;
  source?: AssistantSource;
  treatment?: string; // exp_assistant_modelChoice_web arm that produced this reply (for feedback)
  latencyMs?: number;
  costCents?: number;
  rating?: "up" | "down"; // user's thumbs feedback, once given
}

const SUGGESTIONS = [
  "What's my balance?",
  "How much did I spend on Dining?",
  "Can I afford $2,000?",
  "What was my biggest expense?",
];

export default function AssistantPanel({
  userId,
  enabled,
  onFeedback,
}: {
  userId: string;
  enabled: boolean;
  onFeedback?: () => void;
}) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  // Reset the conversation when the active user changes.
  useEffect(() => {
    setMessages([]);
  }, [userId]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function send(text: string) {
    const question = text.trim();
    if (!question || busy || !enabled) return;
    setInput("");
    setMessages((m) => [...m, { role: "user", text: question }]);
    setBusy(true);
    try {
      const res = await fetch("/api/assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, message: question }),
      });
      const data = await res.json();
      setMessages((m) => [
        ...m,
        {
          role: "assistant",
          text: data.reply ?? data.error ?? "Something went wrong.",
          source: data.source,
          treatment: data.treatment,
          latencyMs: data.latencyMs,
          costCents: data.costCents,
        },
      ]);
    } catch {
      setMessages((m) => [
        ...m,
        { role: "assistant", text: "Network error — please try again." },
      ]);
    } finally {
      setBusy(false);
    }
  }

  // Record a thumbs-up/down for an assistant reply, attributed to its treatment.
  // This is the live experiment metric (F6) that blends into the dashboard.
  async function rate(index: number, rating: "up" | "down") {
    const msg = messages[index];
    if (!msg || msg.role !== "assistant" || !msg.treatment || msg.rating) return;
    setMessages((m) =>
      m.map((x, i) => (i === index ? { ...x, rating } : x))
    );
    try {
      await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId,
          treatment: msg.treatment,
          rating,
          latencyMs: msg.latencyMs,
          costCents: msg.costCents,
        }),
      });
      onFeedback?.();
    } catch {
      // Non-fatal: leave the optimistic rating in place.
    }
  }

  return (
    <div className="card assistant">
      <h2>Financial assistant</h2>
      {!enabled && (
        <div className="banner kill">
          Assistant turned off by the <code>ops_assistant_killSwitch_web</code> flag.
        </div>
      )}
      <div className="messages">
        {messages.length === 0 && enabled && (
          <div className="msg assistant">
            Hi! I can answer questions about your accounts and spending. Try one of the
            suggestions below.
          </div>
        )}
        {messages.map((m, i) => (
          <div key={i} className={`msg ${m.role}`}>
            {m.text}
            {m.role === "assistant" && m.source && (
              <span className="source">
                {m.source === "claude" ? "answered by Claude" : "computed (no AI key)"}
                {m.treatment && ` · ${m.treatment}`}
                {typeof m.latencyMs === "number" && ` · ${m.latencyMs}ms`}
              </span>
            )}
            {m.role === "assistant" && m.treatment && (
              <div className="rate">
                <button
                  className={`thumb ${m.rating === "up" ? "on" : ""}`}
                  onClick={() => rate(i, "up")}
                  disabled={!!m.rating}
                  title="Helpful"
                  aria-label="Thumbs up"
                >
                  👍
                </button>
                <button
                  className={`thumb ${m.rating === "down" ? "on" : ""}`}
                  onClick={() => rate(i, "down")}
                  disabled={!!m.rating}
                  title="Not helpful"
                  aria-label="Thumbs down"
                >
                  👎
                </button>
              </div>
            )}
          </div>
        ))}
        {busy && <div className="msg assistant">…</div>}
        <div ref={endRef} />
      </div>

      <div className="suggestions">
        {SUGGESTIONS.map((s) => (
          <button key={s} onClick={() => send(s)} disabled={busy || !enabled}>
            {s}
          </button>
        ))}
      </div>

      <form
        className="composer"
        onSubmit={(e) => {
          e.preventDefault();
          send(input);
        }}
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={enabled ? "Ask about your finances…" : "Assistant is disabled"}
          disabled={!enabled}
        />
        <button type="submit" disabled={busy || !input.trim() || !enabled}>
          Send
        </button>
      </form>
    </div>
  );
}
