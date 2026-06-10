import type { Account } from "@/lib/types";
import { formatUSD } from "@/lib/format";

export default function AccountOverview({ accounts }: { accounts: Account[] }) {
  const total = accounts.reduce((sum, a) => sum + a.balanceCents, 0);
  return (
    <div className="card">
      <h2>Total balance</h2>
      <div className="balance">{formatUSD(total)}</div>
      <div style={{ marginTop: 16 }}>
        {accounts.map((a) => (
          <div className="account-row" key={a.id}>
            <span className="name">{a.name}</span>
            <span>{formatUSD(a.balanceCents)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
