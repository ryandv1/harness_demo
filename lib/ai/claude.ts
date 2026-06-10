import type { UserData } from "@/lib/types";
import { formatUSD } from "@/lib/format";

// Phase 0: the model is a constant. Phase 1 makes this an FME-flag-driven choice.
const DEFAULT_MODEL = "claude-sonnet-4-6";

export type AssistantSource = "claude" | "fallback";

export interface AssistantResult {
  reply: string;
  source: AssistantSource;
  model?: string;
}

export async function askAssistant(
  data: UserData,
  question: string
): Promise<AssistantResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return { reply: localAnswer(data, question), source: "fallback" };
  }

  try {
    // Imported lazily so the app installs/runs even before the SDK is added.
    const Anthropic = (await import("@anthropic-ai/sdk")).default;
    const client = new Anthropic({ apiKey });
    const msg = await client.messages.create({
      model: DEFAULT_MODEL,
      max_tokens: 600,
      system:
        "You are Northwind Bank's friendly financial assistant. Answer using ONLY the " +
        "account data provided in the user's message. All amounts are USD. Be concise and " +
        "specific, cite figures from the data, and if the data cannot answer the question, " +
        "say so plainly. Never invent transactions or balances.",
      messages: [
        {
          role: "user",
          content: `${buildContext(data)}\n\nQuestion: ${question}`,
        },
      ],
    });
    const reply = msg.content
      .filter((b): b is { type: "text"; text: string } => b.type === "text")
      .map((b) => b.text)
      .join("")
      .trim();
    return { reply: reply || "(no response)", source: "claude", model: DEFAULT_MODEL };
  } catch (err) {
    // If the live call fails, degrade gracefully so the demo never dead-ends.
    const note =
      "[Live AI call failed; showing a computed answer instead.]\n\n";
    return { reply: note + localAnswer(data, question), source: "fallback" };
  }
}

// --- Context for the LLM ---

function buildContext(data: UserData): string {
  const accounts = data.accounts
    .map((a) => `- ${a.name} (${a.type}): ${formatUSD(a.balanceCents)}`)
    .join("\n");
  const txns = data.transactions
    .map((t) => `- ${t.date} | ${t.merchant} | ${t.category} | ${formatUSD(t.amountCents)}`)
    .join("\n");
  return [
    `Customer: ${data.user.name} (${data.user.tier} tier)`,
    `\nAccounts:\n${accounts}`,
    `\nTransactions (negative = money out):\n${txns}`,
  ].join("\n");
}

// --- Deterministic fallback (no API key needed) ---

const KNOWN_CATEGORIES = [
  "Dining",
  "Groceries",
  "Travel",
  "Transport",
  "Shopping",
  "Utilities",
  "Entertainment",
  "Subscriptions",
  "Income",
];

function localAnswer(data: UserData, question: string): string {
  const q = question.toLowerCase();
  const totalBalance = data.accounts.reduce((s, a) => s + a.balanceCents, 0);
  const checking = data.accounts.find((a) => a.type === "checking");

  // "Can I afford $X?"
  const affordMatch = q.match(/afford.*?\$?\s*([\d,]+(?:\.\d{1,2})?)/);
  if (affordMatch) {
    const dollars = parseFloat(affordMatch[1].replace(/,/g, ""));
    const cents = Math.round(dollars * 100);
    const available = checking?.balanceCents ?? totalBalance;
    const ok = cents <= available;
    return `Your ${checking?.name ?? "available balance"} is ${formatUSD(available)}. A ${formatUSD(
      cents
    )} purchase ${ok ? "is within" : "exceeds"} that balance${
      ok ? `, leaving ${formatUSD(available - cents)}.` : "."
    }`;
  }

  // "How much did I spend on <category>?"
  const matchedCategory = KNOWN_CATEGORIES.find(
    (c) => c !== "Income" && q.includes(c.toLowerCase())
  );
  if (matchedCategory && /(spend|spent|spending)/.test(q)) {
    const cents = data.transactions
      .filter((t) => t.category === matchedCategory && t.amountCents < 0)
      .reduce((s, t) => s + t.amountCents, 0);
    return `You've spent ${formatUSD(Math.abs(cents))} on ${matchedCategory} across your recent transactions.`;
  }

  // Balance
  if (/(balance|how much.*have|total)/.test(q)) {
    const lines = data.accounts
      .map((a) => `  • ${a.name}: ${formatUSD(a.balanceCents)}`)
      .join("\n");
    return `Your total balance is ${formatUSD(totalBalance)}:\n${lines}`;
  }

  // Income
  if (/(income|paid|salary|deposit|earn)/.test(q)) {
    const cents = data.transactions
      .filter((t) => t.amountCents > 0)
      .reduce((s, t) => s + t.amountCents, 0);
    return `Your recent deposits total ${formatUSD(cents)}.`;
  }

  // Biggest expense
  if (/(biggest|largest|highest|most expensive)/.test(q)) {
    const biggest = [...data.transactions]
      .filter((t) => t.amountCents < 0)
      .sort((a, b) => a.amountCents - b.amountCents)[0];
    if (biggest) {
      return `Your largest recent expense was ${formatUSD(Math.abs(biggest.amountCents))} at ${
        biggest.merchant
      } (${biggest.category}) on ${biggest.date}.`;
    }
  }

  // Default: top spending categories
  const byCategory = new Map<string, number>();
  for (const t of data.transactions) {
    if (t.amountCents < 0) {
      byCategory.set(t.category, (byCategory.get(t.category) ?? 0) + t.amountCents);
    }
  }
  const top = [...byCategory.entries()]
    .sort((a, b) => a[1] - b[1])
    .slice(0, 3)
    .map(([cat, cents]) => `  • ${cat}: ${formatUSD(Math.abs(cents))}`)
    .join("\n");
  return `Here's a quick snapshot. Total balance: ${formatUSD(
    totalBalance
  )}. Your top spending categories recently:\n${top}\n\n(Ask me about a category, your balance, income, or whether you can afford something.)`;
}
