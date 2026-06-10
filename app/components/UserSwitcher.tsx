import type { User } from "@/lib/types";

export default function UserSwitcher({
  users,
  currentId,
  onChange,
}: {
  users: User[];
  currentId: string;
  onChange: (id: string) => void;
}) {
  const current = users.find((u) => u.id === currentId);
  return (
    <div className="user-switch">
      {current && (
        <span className={`pill ${current.tier === "premium" ? "premium" : ""}`}>
          {current.tier}
        </span>
      )}
      <select value={currentId} onChange={(e) => onChange(e.target.value)}>
        {users.map((u) => (
          <option key={u.id} value={u.id}>
            {u.name}
          </option>
        ))}
      </select>
    </div>
  );
}
