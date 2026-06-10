"use client";

import { useEffect, useRef, useState } from "react";
import type { AssistantSource } from "@/lib/ai/claude";

interface ChatMessage {
  role: "user" | "assistant";
  text: string;
  source?: AssistantSource;
}

const SUGGESTIONS = [
  "What's my balance?",
  "How much did I spend on Dining?",
  "Can I afford $2,000?",
  "What was my biggest expense?",
];

export default function AssistantPanel({ userId }: { userId: string }) {
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
    if (!question || busy) return;
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

  return (
    <div className="card assistant">
      <h2>Financial assistant</h2>
      <div className="messages">
        {messages.length === 0 && (
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
              </span>
            )}
          </div>
        ))}
        {busy && <div className="msg assistant">…</div>}
        <div ref={endRef} />
      </div>

      <div className="suggestions">
        {SUGGESTIONS.map((s) => (
          <button key={s} onClick={() => send(s)} disabled={busy}>
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
          placeholder="Ask about your finances…"
        />
        <button type="submit" disabled={busy || !input.trim()}>
          Send
        </button>
      </form>
    </div>
  );
}
