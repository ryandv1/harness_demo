"use client";

import { useEffect, useState } from "react";
import type { User, UserData } from "@/lib/types";
import type {
  FlagEnvironmentInfo,
  FlagEvaluation,
  FlagMode,
} from "@/lib/flags/types";
import { FLAGS } from "@/lib/flags/flags";
import UserSwitcher from "./components/UserSwitcher";
import AccountOverview from "./components/AccountOverview";
import TransactionList from "./components/TransactionList";
import AssistantPanel from "./components/AssistantPanel";
import DemoPanel from "./components/DemoPanel";
import ExperimentResults from "./components/ExperimentResults";
import FlagFooter from "./components/FlagFooter";
import MortgageBanner from "./components/MortgageBanner";

interface FlagState {
  mode: FlagMode;
  environment: FlagEnvironmentInfo;
  evaluations: FlagEvaluation[];
}

export default function Home() {
  const [users, setUsers] = useState<User[]>([]);
  const [currentId, setCurrentId] = useState<string>("");
  const [data, setData] = useState<UserData | null>(null);
  const [flags, setFlags] = useState<FlagState | null>(null);
  // Bumped whenever the user rates a reply, to refresh the experiment dashboard.
  const [experimentKey, setExperimentKey] = useState(0);

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
    // Deliberately do NOT setData(null) here. Nulling it out made the whole
    // layout (and MortgageBanner, both gated on `data`) unmount for one frame
    // on every switch, then remount once the refetch resolved — a same-frame
    // collapse/snap-back that (a) hid the banner and (b) triggered the
    // browser's scroll-anchoring adjustment when the page height suddenly
    // changed, which is what looked like "the page scrolls down a little."
    // Keeping the previous user's data mounted until the new one arrives
    // avoids the height change entirely. `active` guards against a stale
    // response winning a race if the user switches again before this fetch
    // resolves (fetch has no built-in cancellation-by-dependency).
    let active = true;
    fetch(`/api/users/${currentId}`)
      .then((r) => r.json())
      .then((d: UserData) => {
        if (active) setData(d);
      });
    return () => {
      active = false;
    };
  }, [currentId]);

  // Live flag updates: one SSE connection per current user. The server pushes
  // a fresh evaluation set immediately on connect, then again whenever the
  // FME SDK's SDK_UPDATE fires (real streaming in live mode, a demo toggle in
  // mock mode) — no polling, no manual refresh.
  useEffect(() => {
    if (!currentId) return;
    const source = new EventSource(`/api/flags/stream?userId=${currentId}`);
    source.onmessage = (event) => setFlags(JSON.parse(event.data));
    return () => source.close();
  }, [currentId]);

  async function handleToggle(flag: string, treatment: string) {
    await fetch("/api/flags/override", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ flag, treatment }),
    });
    // No manual refetch: setOverride() notifies the mock emitter, which pushes
    // the new evaluations down the open SSE connection above.
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

      {data && flags && (
        <MortgageBanner
          evaluation={flags.evaluations.find((e) => e.flag === FLAGS.MORTGAGE_REFI_BANNER)}
          userId={data.user.id}
        />
      )}

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
            <AssistantPanel
              userId={data.user.id}
              enabled={assistantEnabled}
              onFeedback={() => setExperimentKey((k) => k + 1)}
            />
            <ExperimentResults refreshKey={experimentKey} />
          </div>
        </div>
      ) : (
        <div className="card">Loading…</div>
      )}

      {flags && (
        <FlagFooter
          evaluations={flags.evaluations}
          environment={flags.environment}
        />
      )}
    </div>
  );
}
