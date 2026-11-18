import { NextResponse } from "next/server";
import { getAccountAuthState } from "@/app/(storefront)/[locale]/[channel]/(main)/account/get-current-user";
import { normalize, toPlainText, validate } from "@/lib/affiliate-application";
import { newApplicationRecord } from "@/lib/affiliates/records";
import {
	getAffiliateAccount,
	isAffiliateAppConfigured,
	saveAffiliateRecord,
} from "@/lib/affiliates/saleor-affiliates";
import { isSignedInStaff } from "@/lib/affiliates/staff";
import { isEmailConfigured, sendNotification } from "@/lib/email";
import { rateLimited } from "@/lib/rate-limit";

/**
 * Affiliate application intake. Applying needs a signed-in account, because the affiliate's dashboard, commission and
 * payouts belong to it.
 *
 * With the affiliates app set up (AFFILIATE_APP_TOKEN), the application is saved on the account as pending, ready to
 * approve on /affiliate-admin. Either way it's also delivered by email (Resend) to AFFILIATE_INBOX_EMAIL, or forwarded as
 * JSON to AFFILIATE_WEBHOOK_URL. With none of those set up the endpoint answers 501 and the form falls back to the
 * applicant's own email app. Success is only reported when the application was actually saved or handed off.
 */
export async function POST(request: Request) {
	const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
	if (rateLimited(`affiliate:${ip}`, 5))
		return NextResponse.json(
			{ message: "Too many applications from this connection. Please try again later." },
			{ status: 429 },
		);

	const app = normalize(await request.json().catch(() => null));
	// No honeypot: applying needs a signed-in account (and is rate-limited), and a hidden "Company" field got filled in by
	// browsers' autofill, which made real applications look like bots and quietly vanish.

	const errors = validate(app);
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
	const account = auth.user;
	if (await isSignedInStaff())
		return NextResponse.json(
			{
				message:
					"Staff accounts can't join the affiliate program. Sign in with a customer account to apply, or run the program from /affiliate-admin.",
				staff: true,
			},
			{ status: 403 },
		);

	const failed = NextResponse.json(
		{ message: "We couldn't send your application. Please try again or email us." },
		{ status: 502 },
	);

	let saved = false;
	if (isAffiliateAppConfigured()) {
		const existing = await getAffiliateAccount(account.id);
		if (!existing.ok) {
			console.error(`[affiliates] couldn't read an applicant's account: ${existing.message}`);
			return failed;
		}
		const status = existing.value?.record.status;
		if (status === "approved" || status === "paused")
			return NextResponse.json(
				{ message: "You're already an affiliate: your dashboard is under My Account.", already: true },
				{ status: 409 },
			);
		const { name, email, phone, country, platform, profileUrl, audience, plan } = app;
		const record = newApplicationRecord(
			{ name, email, phone, country, platform, profileUrl, audience, plan },
			new Date(),
		);
		const result = await saveAffiliateRecord(account.id, record);
		if (!result.ok) {
			console.error(`[affiliates] couldn't save an application: ${result.message}`);
			return failed;
		}
		saved = true;
	}

	const text = [
		toPlainText(app),
		"",
		`Account: ${account.email}`,
		saved ? "Approve or reject it on the site at /affiliate-admin." : "",
	]
		.join("\n")
		.trimEnd();

	if (isEmailConfigured()) {
		const r = await sendNotification({
			subject: `Affiliate application — ${app.name}`,
			text,
			replyTo: app.email,
		});
		if (!r.ok) console.warn("[affiliates] the application was saved but the notification email failed");
		return r.ok || saved ? NextResponse.json({ ok: true }) : failed;
	}

	const webhook = process.env.AFFILIATE_WEBHOOK_URL;
	if (webhook) {
		try {
			const res = await fetch(webhook, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					type: "affiliate_application",
					submittedAt: new Date().toISOString(),
					...app,
					account: account.email,
					text,
				}),
			});
			return res.ok || saved ? NextResponse.json({ ok: true }) : failed;
		} catch {
			return saved ? NextResponse.json({ ok: true }) : failed;
		}
	}

	if (saved) return NextResponse.json({ ok: true });
	return NextResponse.json(
		{ message: "Online submission isn't set up yet.", fallback: true },
		{ status: 501 },
	);
}
