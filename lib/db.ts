import path from "node:path";
import fs from "node:fs";
import Database from "better-sqlite3";
import type {
  Account,
  Mortgage,
  MortgageApplication,
  MortgageApplicationInput,
  Transaction,
  User,
  UserData,
} from "./types";
import type { TreatmentResult } from "./experiment/types";

// --- Connection (singleton, cached across dev hot-reloads) ---

const DB_PATH = path.join(process.cwd(), "data", "demo.sqlite");

function openDb(): Database.Database {
  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
  const db = new Database(DB_PATH);
  db.pragma("journal_mode = WAL");
  migrate(db);
  seedIfEmpty(db);
  return db;
}

declare global {
  // eslint-disable-next-line no-var
  var __northwindDb: Database.Database | undefined;
}

// NOTE: the actual connection is created at the BOTTOM of this file, after the
// SEED data is declared — otherwise openDb() -> seedIfEmpty() would reference
// SEED before its `const` is initialized (temporal dead zone).

// --- Schema ---

function migrate(db: Database.Database) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id    TEXT PRIMARY KEY,
      name  TEXT NOT NULL,
      tier  TEXT NOT NULL,
      email TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS accounts (
      id            TEXT PRIMARY KEY,
      user_id       TEXT NOT NULL REFERENCES users(id),
      name          TEXT NOT NULL,
      type          TEXT NOT NULL,
      balance_cents INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS transactions (
      id           TEXT PRIMARY KEY,
      user_id      TEXT NOT NULL REFERENCES users(id),
      account_id   TEXT NOT NULL REFERENCES accounts(id),
      date         TEXT NOT NULL,
      merchant     TEXT NOT NULL,
      category     TEXT NOT NULL,
      amount_cents INTEGER NOT NULL
    );
    -- Live experiment metric capture (F6): one row per assistant reply rated by a
    -- real user. The experiment dashboard blends these with the simulated fixtures.
    CREATE TABLE IF NOT EXISTS feedback (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      created_at TEXT NOT NULL,
      user_id    TEXT NOT NULL,
      treatment  TEXT NOT NULL,
      rating     TEXT NOT NULL,   -- 'up' | 'down'
      latency_ms INTEGER,
      cost_cents REAL
    );
    -- Mortgage refinance servicing: the pre-existing mortgage each user can
    -- refinance (F-mortgage). One row per user in demo scope.
    CREATE TABLE IF NOT EXISTS mortgages (
      id                        TEXT PRIMARY KEY,
      user_id                   TEXT NOT NULL REFERENCES users(id),
      lender                    TEXT NOT NULL,
      original_principal_cents  INTEGER NOT NULL,
      current_balance_cents     INTEGER NOT NULL,
      interest_rate_bps         INTEGER NOT NULL, -- basis points, e.g. 675 = 6.75%
      term_months               INTEGER NOT NULL,
      origination_date          TEXT NOT NULL
    );
    -- Submitted refinance applications. exp_mortgage_applicationFlow_web's
    -- treatment is captured per-row so the FME experiment can be attributed
    -- even though this demo doesn't render results in-app (console-only, D-016).
    CREATE TABLE IF NOT EXISTS mortgage_applications (
      id                     INTEGER PRIMARY KEY AUTOINCREMENT,
      created_at             TEXT NOT NULL,
      user_id                TEXT NOT NULL REFERENCES users(id),
      treatment              TEXT NOT NULL,
      pricing_option         TEXT NOT NULL, -- 'lowRatePointsUpfront' | 'zeroUpfrontHigherRate'
      refinance_amount_cents INTEGER NOT NULL,
      estimated_fee_cents    INTEGER NOT NULL
    );
  `);
}

// --- Queries ---

export function getUsers(): User[] {
  return db.prepare(`SELECT id, name, tier, email FROM users ORDER BY tier DESC`).all() as User[];
}

export function getUserData(userId: string): UserData | null {
  const user = db
    .prepare(`SELECT id, name, tier, email FROM users WHERE id = ?`)
    .get(userId) as User | undefined;
  if (!user) return null;

  const accounts = db
    .prepare(
      `SELECT id, name, type, balance_cents AS balanceCents
       FROM accounts WHERE user_id = ? ORDER BY balance_cents DESC`
    )
    .all(userId) as Account[];

  const transactions = db
    .prepare(
      `SELECT id, date, merchant, category, amount_cents AS amountCents
       FROM transactions WHERE user_id = ? ORDER BY date DESC, id DESC`
    )
    .all(userId) as Transaction[];

  return { user, accounts, transactions, mortgage: getMortgage(userId) };
}

// --- Experiment feedback (live metric capture, F6) ---

export interface FeedbackInput {
  userId: string;
  treatment: string;
  rating: "up" | "down";
  latencyMs?: number;
  costCents?: number;
}

export function recordFeedback(input: FeedbackInput): void {
  db.prepare(
    `INSERT INTO feedback (created_at, user_id, treatment, rating, latency_ms, cost_cents)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).run(
    new Date().toISOString(),
    input.userId,
    input.treatment,
    input.rating,
    input.latencyMs ?? null,
    input.costCents ?? null
  );
}

/** Aggregate live feedback into per-treatment rows the dashboard can blend in. */
export function getFeedbackResults(): TreatmentResult[] {
  const rows = db
    .prepare(
      `SELECT treatment,
              COUNT(*)                                  AS exposures,
              SUM(CASE WHEN rating = 'up' THEN 1 ELSE 0 END) AS conversions,
              AVG(latency_ms)                           AS avgLatencyMs,
              AVG(cost_cents)                           AS avgCostCents
       FROM feedback
       GROUP BY treatment`
    )
    .all() as Array<{
    treatment: string;
    exposures: number;
    conversions: number;
    avgLatencyMs: number | null;
    avgCostCents: number | null;
  }>;

  return rows.map((r) => ({
    treatment: r.treatment,
    exposures: r.exposures,
    conversions: r.conversions,
    conversionRate: r.exposures ? r.conversions / r.exposures : 0,
    avgLatencyMs: Math.round(r.avgLatencyMs ?? 0),
    avgCostCents: Number((r.avgCostCents ?? 0).toFixed(4)),
  }));
}

// --- Mortgage refinance servicing ---

export function getMortgage(userId: string): Mortgage | null {
  const row = db
    .prepare(
      `SELECT id, lender,
              original_principal_cents AS originalPrincipalCents,
              current_balance_cents    AS currentBalanceCents,
              interest_rate_bps        AS interestRateBps,
              term_months              AS termMonths,
              origination_date         AS originationDate
       FROM mortgages WHERE user_id = ?`
    )
    .get(userId) as Mortgage | undefined;
  return row ?? null;
}

export function recordMortgageApplication(
  input: MortgageApplicationInput,
  estimatedFeeCents: number
): MortgageApplication {
  const createdAt = new Date().toISOString();
  const result = db
    .prepare(
      `INSERT INTO mortgage_applications
         (created_at, user_id, treatment, pricing_option, refinance_amount_cents, estimated_fee_cents)
       VALUES (?, ?, ?, ?, ?, ?)`
    )
    .run(
      createdAt,
      input.userId,
      input.treatment,
      input.pricingOption,
      input.refinanceAmountCents,
      estimatedFeeCents
    );
  return {
    id: Number(result.lastInsertRowid),
    createdAt,
    userId: input.userId,
    treatment: input.treatment,
    pricingOption: input.pricingOption,
    refinanceAmountCents: input.refinanceAmountCents,
    estimatedFeeCents,
  };
}

export function getMortgageApplications(userId: string): MortgageApplication[] {
  return db
    .prepare(
      `SELECT id, created_at AS createdAt, user_id AS userId, treatment,
              pricing_option AS pricingOption,
              refinance_amount_cents AS refinanceAmountCents,
              estimated_fee_cents AS estimatedFeeCents
       FROM mortgage_applications WHERE user_id = ? ORDER BY id DESC`
    )
    .all(userId) as MortgageApplication[];
}

// --- Seed ---

function seedIfEmpty(db: Database.Database) {
  const count = (db.prepare(`SELECT COUNT(*) AS n FROM users`).get() as { n: number }).n;
  if (count > 0) return;

  const insertUser = db.prepare(`INSERT INTO users (id, name, tier, email) VALUES (?, ?, ?, ?)`);
  const insertAccount = db.prepare(
    `INSERT INTO accounts (id, user_id, name, type, balance_cents) VALUES (?, ?, ?, ?, ?)`
  );
  const insertTxn = db.prepare(
    `INSERT INTO transactions (id, user_id, account_id, date, merchant, category, amount_cents)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  );
  const insertMortgage = db.prepare(
    `INSERT INTO mortgages
       (id, user_id, lender, original_principal_cents, current_balance_cents,
        interest_rate_bps, term_months, origination_date)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  );

  const seed = db.transaction(() => {
    for (const u of SEED) {
      insertUser.run(u.user.id, u.user.name, u.user.tier, u.user.email);
      for (const a of u.accounts) {
        insertAccount.run(a.id, u.user.id, a.name, a.type, a.balanceCents);
      }
      let i = 0;
      const checkingId = u.accounts[0].id;
      for (const t of u.transactions) {
        insertTxn.run(
          `${u.user.id}-t${i++}`,
          u.user.id,
          checkingId,
          t.date,
          t.merchant,
          t.category,
          t.amountCents
        );
      }
      if (u.mortgage) {
        insertMortgage.run(
          u.mortgage.id,
          u.user.id,
          u.mortgage.lender,
          u.mortgage.originalPrincipalCents,
          u.mortgage.currentBalanceCents,
          u.mortgage.interestRateBps,
          u.mortgage.termMonths,
          u.mortgage.originationDate
        );
      }
    }
  });
  seed();
}

type SeedTxn = Omit<Transaction, "id">;
interface SeedUser {
  user: User;
  accounts: Account[];
  transactions: SeedTxn[];
  mortgage?: Mortgage;
}

const SEED: SeedUser[] = [
  {
    user: { id: "jordan", name: "Jordan Avery", tier: "free", email: "jordan@example.com" },
    accounts: [
      { id: "jordan-chk", name: "Everyday Checking", type: "checking", balanceCents: 248391 },
      { id: "jordan-sav", name: "Savings", type: "savings", balanceCents: 512000 },
    ],
    transactions: [
      { date: "2026-06-07", merchant: "Whole Foods Market", category: "Groceries", amountCents: -8742 },
      { date: "2026-06-06", merchant: "Shell", category: "Transport", amountCents: -5230 },
      { date: "2026-06-05", merchant: "Chipotle", category: "Dining", amountCents: -1419 },
      { date: "2026-06-03", merchant: "Netflix", category: "Subscriptions", amountCents: -1599 },
      { date: "2026-06-01", merchant: "Acme Payroll", category: "Income", amountCents: 320000 },
      { date: "2026-05-29", merchant: "Trader Joe's", category: "Groceries", amountCents: -6310 },
      { date: "2026-05-27", merchant: "Starbucks", category: "Dining", amountCents: -742 },
      { date: "2026-05-24", merchant: "Uber", category: "Transport", amountCents: -2188 },
      { date: "2026-05-22", merchant: "AMC Theatres", category: "Entertainment", amountCents: -3400 },
      { date: "2026-05-20", merchant: "ConEd Utilities", category: "Utilities", amountCents: -9120 },
      { date: "2026-05-18", merchant: "Chipotle", category: "Dining", amountCents: -1532 },
      { date: "2026-05-15", merchant: "Amazon", category: "Shopping", amountCents: -4299 },
      { date: "2026-05-12", merchant: "Whole Foods Market", category: "Groceries", amountCents: -7765 },
      { date: "2026-05-09", merchant: "Spotify", category: "Subscriptions", amountCents: -1099 },
      { date: "2026-05-04", merchant: "Delta Air Lines", category: "Travel", amountCents: -28400 },
      { date: "2026-05-01", merchant: "Acme Payroll", category: "Income", amountCents: 320000 },
    ],
    mortgage: {
      id: "jordan-mtg",
      lender: "Northwind Home Loans",
      originalPrincipalCents: 31000000,
      currentBalanceCents: 28453000,
      interestRateBps: 675, // 6.75%
      termMonths: 360,
      originationDate: "2021-08-01",
    },
  },
  {
    user: { id: "riley", name: "Riley Chen", tier: "premium", email: "riley@example.com" },
    accounts: [
      { id: "riley-chk", name: "Premium Checking", type: "checking", balanceCents: 1840255 },
      { id: "riley-sav", name: "High-Yield Savings", type: "savings", balanceCents: 4250000 },
    ],
    transactions: [
      { date: "2026-06-08", merchant: "The Ritz-Carlton", category: "Travel", amountCents: -84200 },
      { date: "2026-06-07", merchant: "Nobu", category: "Dining", amountCents: -21800 },
      { date: "2026-06-05", merchant: "Apple Store", category: "Shopping", amountCents: -129900 },
      { date: "2026-06-04", merchant: "United Airlines", category: "Travel", amountCents: -64200 },
      { date: "2026-06-02", merchant: "Equinox", category: "Subscriptions", amountCents: -28500 },
      { date: "2026-06-01", merchant: "Globex Capital", category: "Income", amountCents: 980000 },
      { date: "2026-05-30", merchant: "Whole Foods Market", category: "Groceries", amountCents: -15420 },
      { date: "2026-05-28", merchant: "Tesla Supercharger", category: "Transport", amountCents: -3210 },
      { date: "2026-05-25", merchant: "Four Seasons", category: "Travel", amountCents: -112000 },
      { date: "2026-05-23", merchant: "Nordstrom", category: "Shopping", amountCents: -45600 },
      { date: "2026-05-20", merchant: "ConEd Utilities", category: "Utilities", amountCents: -14380 },
      { date: "2026-05-17", merchant: "Carbone", category: "Dining", amountCents: -18900 },
      { date: "2026-05-14", merchant: "Amazon", category: "Shopping", amountCents: -8750 },
      { date: "2026-05-10", merchant: "Delta Air Lines", category: "Travel", amountCents: -52300 },
      { date: "2026-05-06", merchant: "Whole Foods Market", category: "Groceries", amountCents: -16890 },
      { date: "2026-05-01", merchant: "Globex Capital", category: "Income", amountCents: 980000 },
    ],
    mortgage: {
      id: "riley-mtg",
      lender: "Northwind Private Client Lending",
      originalPrincipalCents: 125000000,
      currentBalanceCents: 118250000,
      interestRateBps: 712, // 7.125%
      termMonths: 360,
      originationDate: "2022-03-01",
    },
  },
];

// --- Connection bootstrap (must come after SEED is declared) ---

const db: Database.Database = globalThis.__northwindDb ?? openDb();
if (process.env.NODE_ENV !== "production") globalThis.__northwindDb = db;
