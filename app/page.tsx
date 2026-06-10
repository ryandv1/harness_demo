"use client";

import { useCallback, useEffect, useState } from "react";
import type { User, UserData } from "@/lib/types";
import type { FlagEvaluation, FlagMode } from "@/lib/flags/types";
import { FLAGS } from "@/lib/flags/flags";
import UserSwitcher from "./components/UserSwitcher";
import AccountOverview from "./components/AccountOverview";
import TransactionList from "./components/TransactionList";
import AssistantPanel from "./components/AssistantPanel";
import DemoPanel from "./components/DemoPanel";

interface FlagState {
  mode: FlagMode;
  evaluations: FlagEvaluation[];
}

export default function Home() {
  const [users, setUsers] = useState<User[]>([]);
  const [currentId, setCurrentId] = useState<string>("");
  const [data, setData] = useState<UserData | null>(null);
  const [flags, setFlags] = useState<FlagState | null>(null);

  useEffect(() => {
    fetch("/api/users")
      .then((r) => r.json())
      .then((list: User[]) => {
        setUsers(list);
        if (list.length) setCurrentId(list[0].id);
      });
  }, []);

  const refreshFlags = useCallback((userId: string) => {
    return fetch(`/api/flags?userId=${userId}`)
      .then((r) => r.json())
      .then(setFlags);
  }, []);

  useEffect(() => {
    if (!currentId) return;
    setData(null);
    fetch(`/api/users/${currentId}`)
      .then((r) => r.json())
      .then(setData);
    refreshFlags(currentId);
  }, [currentId, refreshFlags]);

  async function handleToggle(flag: string, treatment: string) {
    await fetch("/api/flags/override", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ flag, treatment }),
    });
    await refreshFlags(currentId);
  }

  const assistantEnabled =
    flags?.evaluations.find((e) => e.flag === FLAGS.AI_ASSISTANT_ENABLED)?.treatment !==
    "off";

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
        Demo app for Harness FME. Switch the user (free vs premium) to see flag targeting,
        and use the FME Demo Panel to flip flags live.
      </div>

      {data ? (
        <div className="layout">
          <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
            <AccountOverview accounts={data.accounts} />
            <TransactionList transactions={data.transactions} />
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
            {flags && (
              <DemoPanel
                mode={flags.mode}
                evaluations={flags.evaluations}
                onToggle={handleToggle}
              />
            )}
            <AssistantPanel userId={data.user.id} enabled={assistantEnabled} />
          </div>
        </div>
      ) : (
        <div className="card">Loading…</div>
      )}
    </div>
  );
}
