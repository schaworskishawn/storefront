import { NextRequest } from "next/server";
import { productionPayoutDeps } from "@/lib/affiliates/payout-deps";
import { runAffiliatePayouts } from "@/lib/affiliates/payout-run";
import { isAuthorizedCronRequest } from "@/lib/installments/cron-auth";

/** A run pays affiliates one by one and may call Claude once, so give it room. */
export const maxDuration = 300;

/** Stops a second run starting while one is in progress in this instance (the scheduler fires once a day). */
let running = false;

/**
 * The daily affiliate job: Vercel Cron calls this (see vercel.json) with `Authorization: Bearer $CRON_SECRET`. It pays
 * what's due (Vapor Tokens automatically; crypto too when allowed), keeps crypto payouts' status current, runs the AI
 * review on Mondays (UTC), and emails the owner what needs them.
 *
 * It pays real money and credit, so it refuses anyone without the secret, and refuses everyone while CRON_SECRET is unset
 * or weak.
 */
export async function GET(request: NextRequest) {
	if (!isAuthorizedCronRequest(request.headers.get("authorization"), process.env.CRON_SECRET)) {
		return Response.json({ error: "Unauthorized" }, { status: 401 });
	}
	if (running) {
		return Response.json({ error: "A run is already in progress" }, { status: 409 });
	}

	running = true;
	try {
		const summary = await runAffiliatePayouts(productionPayoutDeps(), {
			weekly: new Date().getUTCDay() === 1,
		});
		return Response.json({ ok: true, summary });
	} finally {
		running = false;
	}
}
