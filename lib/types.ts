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
  mortgage: Mortgage | null;
}

// --- Mortgage refinance servicing ---

/** A pre-existing mortgage the user can refinance. One per user (demo scope). */
export interface Mortgage {
  id: string;
  lender: string;
  originalPrincipalCents: number;
  currentBalanceCents: number;
  interestRateBps: number; // basis points, e.g. 675 = 6.75%
  termMonths: number;
  originationDate: string; // ISO yyyy-mm-dd
}

/** Which refinance pricing the applicant chose — drives the fee formula (D-0xx). */
export type PricingOption = "lowRatePointsUpfront" | "zeroUpfrontHigherRate";

export interface MortgageApplicationInput {
  userId: string;
  treatment: string; // exp_mortgage_applicationFlow_web treatment at submit time
  pricingOption: PricingOption;
  refinanceAmountCents: number;
}

export interface MortgageApplication {
  id: number;
  createdAt: string;
  userId: string;
  treatment: string;
  pricingOption: PricingOption;
  refinanceAmountCents: number;
  estimatedFeeCents: number;
}
