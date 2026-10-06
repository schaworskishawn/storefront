import { NextRequest } from "next/server";
import { isAuthorizedCronRequest } from "@/lib/installments/cron-auth";
import { runInstallmentsJob } from "@/lib/installments/run";

/** A run charges cards one order at a time, so give it room. */
export const maxDuration = 60;

/** Stops a second run starting while one is in progress in this instance (the scheduler normally fires once a day). */
let running = false;

/**
 * The daily "Pay in 4" job: Vercel Cron calls this (see vercel.json) with `Authorization: Bearer $CRON_SECRET`. It gives
 * new installment orders their plan and takes, reminds about, retries and reports each plan's payments.
 *
 * It charges real cards, so it refuses anyone without the secret, and refuses everyone while CRON_SECRET is unset or weak.
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
		const summary = await runInstallmentsJob();
		if (summary.errors.length > 0) console.error("[installments] run finished with errors:", summary.errors);
		return Response.json({ ok: summary.errors.length === 0, summary });
	} finally {
		running = false;
	}
}
