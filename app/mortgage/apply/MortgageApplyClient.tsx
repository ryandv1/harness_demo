"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import type {
  FlagEnvironmentInfo,
  FlagEvaluation,
} from "@/lib/flags/types";
import type { PricingOption, UserData } from "@/lib/types";
import { FLAGS, resolveMortgageBannerConfig } from "@/lib/flags/flags";
import { computeEstimatedFeeCents } from "@/lib/mortgage/fees";
import { formatUSD } from "@/lib/format";
import FlagFooter from "@/app/components/FlagFooter";

interface FlagsResponse {
  environment: FlagEnvironmentInfo;
  evaluations: FlagEvaluation[];
}

const PRICING_LABELS: Record<PricingOption, string> = {
  lowRatePointsUpfront: "Low rate, points upfront",
  zeroUpfrontHigherRate: "Zero upfront, higher rate",
};

export default function MortgageApplyClient({ userId }: { userId: string }) {
  const [data, setData] = useState<UserData | null>(null);
  const [flags, setFlags] = useState<FlagsResponse | null>(null);
  const [notFound, setNotFound] = useState(false);

  const [page, setPage] = useState<1 | 2>(1);
  const [pricingOption, setPricingOption] = useState<PricingOption>("lowRatePointsUpfront");
  const [amountDollars, setAmountDollars] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmedFeeCents, setConfirmedFeeCents] = useState<number | null>(null);

  useEffect(() => {
    if (!userId) return;
    fetch(`/api/users/${userId}`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d: UserData) => {
        setData(d);
        if (d.mortgage) setAmountDollars(String(Math.round(d.mortgage.currentBalanceCents / 100)));
      })
      .catch(() => setNotFound(true));
    fetch(`/api/flags?userId=${userId}`)
      .then((r) => r.json())
      .then(setFlags);
  }, [userId]);

  const bannerEval = flags?.evaluations.find((e) => e.flag === FLAGS.MORTGAGE_REFI_BANNER);
  const flowEval = flags?.evaluations.find((e) => e.flag === FLAGS.MORTGAGE_APPLICATION_FLOW);
  const flowTreatment = flowEval?.treatment ?? "singleScreen";
  const config = resolveMortgageBannerConfig(bannerEval?.treatment ?? "on", bannerEval?.config);

  const refinanceAmountCents = Math.round((Number(amountDollars) || 0) * 100);
  const estimatedFeeCents = useMemo(
    () => computeEstimatedFeeCents(pricingOption, refinanceAmountCents, config),
    [pricingOption, refinanceAmountCents, config]
  );

  async function submit() {
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/mortgage/apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId,
          treatment: flowTreatment,
          pricingOption,
          refinanceAmountCents,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error ?? "Something went wrong.");
      setConfirmedFeeCents(json.application.estimatedFeeCents);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setSubmitting(false);
    }
  }

  if (!userId || notFound) {
    return (
      <Shell>
        <div className="card">
          Missing or unknown user. Go back to the dashboard and click the refinance banner.
        </div>
      </Shell>
    );
  }

  if (!data || !flags) {
    return (
      <Shell>
        <div className="card">Loading…</div>
      </Shell>
    );
  }

  if (!data.mortgage) {
    return (
      <Shell>
        <div className="card">No existing mortgage on file for {data.user.name}.</div>
      </Shell>
    );
  }

  if (confirmedFeeCents !== null) {
    return (
      <Shell flags={flags}>
        <div className="card mortgage-confirm">
          <h2>✓ Application submitted</h2>
          <p>
            Thanks, {data.user.name.split(" ")[0]} — your refinance application has been
            received. A loan specialist will follow up within 1–2 business days.
          </p>
          <div className="mortgage-summary">
            <div>
              <dt>Pricing option</dt>
              <dd>{PRICING_LABELS[pricingOption]}</dd>
            </div>
            <div>
              <dt>Refinance amount</dt>
              <dd>{formatUSD(refinanceAmountCents)}</dd>
            </div>
            <div>
              <dt>Estimated fee</dt>
              <dd>{formatUSD(confirmedFeeCents)}</dd>
            </div>
          </div>
          <Link className="mortgage-back-link" href="/">
            ← Back to dashboard
          </Link>
        </div>
      </Shell>
    );
  }

  const mortgageSummary = (
    <div className="mortgage-current">
      <div className="mortgage-current-label">Your current mortgage</div>
      <dl className="mortgage-current-grid">
        <div>
          <dt>Lender</dt>
          <dd>{data.mortgage.lender}</dd>
        </div>
        <div>
          <dt>Balance</dt>
          <dd>{formatUSD(data.mortgage.currentBalanceCents)}</dd>
        </div>
        <div>
          <dt>Rate</dt>
          <dd>{(data.mortgage.interestRateBps / 100).toFixed(2)}%</dd>
        </div>
        <div>
          <dt>Term</dt>
          <dd>{Math.round(data.mortgage.termMonths / 12)} yr</dd>
        </div>
      </dl>
    </div>
  );

  const pricingPicker = (
    <>
      <div className="mortgage-section-label">Choose your pricing option</div>
      <div className="pricing-options">
        <button
          type="button"
          className={`pricing-option ${pricingOption === "lowRatePointsUpfront" ? "active" : ""}`}
          onClick={() => setPricingOption("lowRatePointsUpfront")}
        >
          <div className="pricing-option-title">{config.promotedRateLabel} — points upfront</div>
          <div className="pricing-option-detail">
            Pay {config.lowRatePointsPct.toFixed(2)}% of the refinance amount in points at
            closing for the promoted rate.
          </div>
        </button>
        <button
          type="button"
          className={`pricing-option ${pricingOption === "zeroUpfrontHigherRate" ? "active" : ""}`}
          onClick={() => setPricingOption("zeroUpfrontHigherRate")}
        >
          <div className="pricing-option-title">Zero upfront, higher rate</div>
          <div className="pricing-option-detail">
            No points due at closing. Rate runs about +{(config.zeroUpfrontRateDeltaBps / 100).toFixed(2)}%
            higher than the promoted rate.
          </div>
        </button>
      </div>
    </>
  );

  const amountField = (
    <div className="mortgage-field">
      <label htmlFor="amount">Amount to refinance</label>
      <input
        id="amount"
        type="number"
        min={0}
        step={1000}
        value={amountDollars}
        onChange={(e) => setAmountDollars(e.target.value)}
      />
    </div>
  );

  const feePreview = (
    <div className="fee-preview">
      <span className="fee-preview-label">Estimated fee</span>
      <span className="fee-preview-value">{formatUSD(estimatedFeeCents)}</span>
    </div>
  );

  // Single-screen variant (exp_mortgage_applicationFlow_web = "singleScreen"):
  // every input visible at once.
  if (flowTreatment !== "twoPage") {
    return (
      <Shell flags={flags}>
        <div className="card mortgage-apply">
          <h1>Refinance your mortgage</h1>
          <p className="mortgage-sub">Review your options and submit in one step.</p>
          {mortgageSummary}
          {pricingPicker}
          {amountField}
          {feePreview}
          {error && <div className="mortgage-error">{error}</div>}
          <div className="mortgage-actions">
            <button
              className="primary"
              disabled={submitting || refinanceAmountCents <= 0}
              onClick={submit}
            >
              {submitting ? "Submitting…" : "Submit application"}
            </button>
          </div>
        </div>
      </Shell>
    );
  }

  // 2-page variant (exp_mortgage_applicationFlow_web = "twoPage"): pricing
  // choice, then amount + review — a separate step before submission.
  return (
    <Shell flags={flags}>
      <div className="card mortgage-apply">
        <div className="mortgage-step">Step {page} of 2</div>
        <h1>Refinance your mortgage</h1>
        {page === 1 ? (
          <>
            <p className="mortgage-sub">First, choose how you'd like to pay for your rate.</p>
            {mortgageSummary}
            {pricingPicker}
            <div className="mortgage-actions">
              <button className="primary" onClick={() => setPage(2)}>
                Continue
              </button>
            </div>
          </>
        ) : (
          <>
            <p className="mortgage-sub">Now confirm the amount and review your application.</p>
            {amountField}
            {feePreview}
            <div className="mortgage-summary">
              <div>
                <dt>Pricing option</dt>
                <dd>{PRICING_LABELS[pricingOption]}</dd>
              </div>
            </div>
            {error && <div className="mortgage-error">{error}</div>}
            <div className="mortgage-actions">
              <button className="secondary" onClick={() => setPage(1)}>
                Back
              </button>
              <button
                className="primary"
                disabled={submitting || refinanceAmountCents <= 0}
                onClick={submit}
              >
                {submitting ? "Submitting…" : "Submit application"}
              </button>
            </div>
          </>
        )}
      </div>
    </Shell>
  );
}

function Shell({
  children,
  flags,
}: {
  children: React.ReactNode;
  flags?: FlagsResponse;
}) {
  return (
    <div className="mortgage-shell">
      <Link href="/" className="mortgage-back-link">
        ← Northwind Bank
      </Link>
      {children}
      {flags && <FlagFooter evaluations={flags.evaluations} environment={flags.environment} />}
    </div>
  );
}
