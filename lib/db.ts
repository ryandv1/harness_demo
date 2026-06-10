import path from "node:path";
import fs from "node:fs";
import Database from "better-sqlite3";
import type { Account, Transaction, User, UserData } from "./types";

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

  return { user, accounts, transactions };
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
    }
  });
  seed();
}

type SeedTxn = Omit<Transaction, "id">;
interface SeedUser {
  user: User;
  accounts: Account[];
  transactions: SeedTxn[];
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
  },
];

// --- Connection bootstrap (must come after SEED is declared) ---

const db: Database.Database = globalThis.__northwindDb ?? openDb();
if (process.env.NODE_ENV !== "production") globalThis.__northwindDb = db;
