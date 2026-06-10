import type { Transaction } from "@/lib/types";
import { formatUSD } from "@/lib/format";

function formatDate(iso: string): string {
  return new Date(iso + "T00:00:00").toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

export default function TransactionList({
  transactions,
}: {
  transactions: Transaction[];
}) {
  return (
    <div className="card">
      <h2>Recent transactions</h2>
      <div>
        {transactions.map((t) => {
          const isCredit = t.amountCents > 0;
          return (
            <div className="txn" key={t.id}>
              <span className="meta">
                <span className="merchant">{t.merchant}</span>
                <span className="sub">
                  {formatDate(t.date)} · {t.category}
                </span>
              </span>
              <span className={`amount ${isCredit ? "credit" : "debit"}`}>
                {isCredit ? "+" : ""}
                {formatUSD(t.amountCents)}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
