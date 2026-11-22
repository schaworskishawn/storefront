import { connection, NextResponse } from "next/server";
import { getAccountAuthState } from "@/app/(storefront)/[locale]/[channel]/(main)/account/get-current-user";
import { activeTierId } from "@/lib/distributors/records";
import { getDistributorAccount, isDistributorAppConfigured } from "@/lib/distributors/saleor-distributors";
import { tierById } from "@/lib/distributors/tiers";

/**
 * The signed-in visitor's distributor tier, for the wholesale prices product cards and pages show next to retail
 * (`WholesalePrice`). Asked from the browser so the catalogue pages stay cached for everyone; what checkout charges is
 * worked out on the server (sync.ts), never from this. Answers `{ tier: null }` for anyone who isn't an approved
 * distributor, and is never cached.
 */
export async function GET() {
	// Per visitor, so never prerendered: without this, a build with the program switched off would freeze `{ tier: null }`.
	await connection();
	const none = NextResponse.json({ tier: null }, { headers: { "Cache-Control": "private, no-store" } });
	if (!isDistributorAppConfigured()) return none;
	const auth = await getAccountAuthState();
	if (auth.status !== "authenticated") return none;
	const account = await getDistributorAccount(auth.user.id);
	const tierId = account.ok ? activeTierId(account.value?.record ?? null) : null;
	if (!tierId) return none;
	const tier = tierById(tierId);
	return NextResponse.json(
		{
			tier: { id: tier.id, name: tier.name, discountBps: tier.discountBps, minimumCents: tier.minimumCents },
		},
		{ headers: { "Cache-Control": "private, no-store" } },
	);
}
