import MortgageApplyClient from "./MortgageApplyClient";

// Next 16: searchParams is async (Promise) and must be awaited, same as the
// dynamic-route `params` pattern in app/api/users/[id]/route.ts. Kept as a thin
// server wrapper so the interactive form logic can stay in a client component
// without needing useSearchParams()/Suspense.
export default async function MortgageApplyPage({
  searchParams,
}: {
  searchParams: Promise<{ userId?: string }>;
}) {
  const { userId } = await searchParams;
  return <MortgageApplyClient userId={userId ?? ""} />;
}
