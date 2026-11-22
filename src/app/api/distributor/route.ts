import { NextResponse } from "next/server";
import { getAccountAuthState } from "@/app/(storefront)/[locale]/[channel]/(main)/account/get-current-user";
import { isSignedInStaff } from "@/lib/affiliates/staff";
import {
	applicationText,
	normalizeDistributorApplication,
	toApplicationRecord,
	validateDistributorApplication,
} from "@/lib/distributors/application";
import { newDistributorApplication } from "@/lib/distributors/records";
import {
	getDistributorAccount,
	isDistributorAppConfigured,
	saveDistributorRecord,
} from "@/lib/distributors/saleor-distributors";
import { isEmailConfigured, sendNotification } from "@/lib/email";
import { rateLimited } from "@/lib/rate-limit";

/**
 * Distributor application intake. Applying needs a signed-in customer account, because the tier, its wholesale prices and
 * the orders all belong to it. The application is saved on the account as pending (the distributors app's token), ready
 * for the owner to approve and pick a tier on /distributor-admin, and the owner is emailed. Without the app set up the
 * endpoint answers 501 and the form offers the applicant's own email app instead.
 */
export async function POST(request: Request) {
	const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
	if (rateLimited(`distributor:${ip}`, 5))
		return NextResponse.json(
			{ message: "Too many applications from this connection. Please try again later." },
			{ status: 429 },
		);

	const app = normalizeDistributorApplication(await request.json().catch(() => null));
	const errors = validateDistributorApplication(app);
	if (Object.keys(errors).length)
		return NextResponse.json({ message: "Please fix the highlighted fields.", errors }, { status: 400 });

	const auth = await getAccountAuthState();
	if (auth.status === "unavailable")
		return NextResponse.json(
			{ message: "We couldn't check your sign-in just now. Please try again in a moment." },
			{ status: 503 },
		);
	if (auth.status !== "authenticated")
		return NextResponse.json({ message: "Please sign in to apply.", signIn: true }, { status: 401 });
	if (await isSignedInStaff())
		return NextResponse.json(
			{
				message:
					"Staff accounts can't be distributors. Sign in with your business's customer account, or run the program from /distributor-admin.",
				staff: true,
			},
			{ status: 403 },
		);

	if (!isDistributorAppConfigured())
		return NextResponse.json(
			{ message: "Online applications aren't set up yet.", fallback: true },
			{ status: 501 },
		);

	const existing = await getDistributorAccount(auth.user.id);
	if (!existing.ok) {
		console.error(`[distributors] couldn't read an applicant's account: ${existing.message}`);
		return NextResponse.json(
			{ message: "We couldn't send your application. Please try again or email us." },
			{ status: 502 },
		);
	}
	const status = existing.value?.record.status;
	if (status === "approved" || status === "paused")
		return NextResponse.json(
			{ message: "You're already a distributor: your tier is under My Account.", already: true },
			{ status: 409 },
		);

	const record = toApplicationRecord(app);
	const saved = await saveDistributorRecord(auth.user.id, newDistributorApplication(record, new Date()));
	if (!saved.ok) {
		console.error(`[distributors] couldn't save an application: ${saved.message}`);
		return NextResponse.json(
			{ message: "We couldn't send your application. Please try again or email us." },
			{ status: 502 },
		);
	}

	if (isEmailConfigured()) {
		const sent = await sendNotification({
			subject: `Distributor application — ${record.businessName}`,
			text: `${applicationText(record)}\n\nAccount: ${auth.user.email}\nApprove it and choose a tier on the site at /distributor-admin.`,
			replyTo: record.email,
		});
		if (!sent.ok) console.warn("[distributors] the application was saved but the notification email failed");
	}
	return NextResponse.json({ ok: true });
}
