// Shared types used by both server (DB/API) and client (components).

export type Tier = "free" | "premium";

export interface User {
  id: string;
  name: string;
  tier: Tier;
  email: string;
}

export interface Account {
  id: string;
  name: string;
  type: string;
  balanceCents: number;
}

export interface Transaction {
  id: string;
  date: string; // ISO yyyy-mm-dd
  merchant: string;
  category: string;
  amountCents: number; // negative = money out (debit), positive = money in (credit)
}

export interface UserData {
  user: User;
  accounts: Account[];
  transactions: Transaction[];
}
