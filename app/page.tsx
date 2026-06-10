"use client";

import { useEffect, useState } from "react";
import type { User, UserData } from "@/lib/types";
import UserSwitcher from "./components/UserSwitcher";
import AccountOverview from "./components/AccountOverview";
import TransactionList from "./components/TransactionList";
import AssistantPanel from "./components/AssistantPanel";

export default function Home() {
  const [users, setUsers] = useState<User[]>([]);
  const [currentId, setCurrentId] = useState<string>("");
  const [data, setData] = useState<UserData | null>(null);

  useEffect(() => {
    fetch("/api/users")
      .then((r) => r.json())
      .then((list: User[]) => {
        setUsers(list);
        if (list.length) setCurrentId(list[0].id);
      });
  }, []);

  useEffect(() => {
    if (!currentId) return;
    setData(null);
    fetch(`/api/users/${currentId}`)
      .then((r) => r.json())
      .then(setData);
  }, [currentId]);

  return (
    <div className="app-shell">
      <div className="topbar">
        <div className="brand">
          <span className="logo">N</span>
          Northwind Bank
        </div>
        {users.length > 0 && (
          <UserSwitcher users={users} currentId={currentId} onChange={setCurrentId} />
        )}
      </div>

      <div className="banner">
        Demo app for Harness FME. Switch the user (free vs premium) to preview targeting —
        feature flags arrive in Phase 1.
      </div>

      {data ? (
        <div className="layout">
          <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
            <AccountOverview accounts={data.accounts} />
            <TransactionList transactions={data.transactions} />
          </div>
          <AssistantPanel userId={data.user.id} />
        </div>
      ) : (
        <div className="card">Loading…</div>
      )}
    </div>
  );
}
