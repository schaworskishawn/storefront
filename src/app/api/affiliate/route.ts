import { NextResponse } from "next/server";
import { normalize, toPlainText, validate } from "@/lib/affiliate-application";
import { isEmailConfigured, sendNotification } from "@/lib/email";
import { rateLimited } from "@/lib/rate-limit";

/**
 * Affiliate application intake. Delivered by email (Resend) to AFFILIATE_INBOX_EMAIL, or forwarded as JSON to
 * AFFILIATE_WEBHOOK_URL. With neither configured the endpoint answers 501 and the form falls back to the
 * applicant's own email app. Success is only reported when the application was actually handed off.
 */
export async function POST(request: Request) {
	const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
	if (rateLimited(`affiliate:${ip}`, 5))
		return NextResponse.json(
			{ message: "Too many applications from this connection. Please try again later." },
			{ status: 429 },
		);

	const app = normalize(await request.json().catch(() => null));
	if (app.company) return NextResponse.json({ ok: true }); // honeypot

	const errors = validate(app);
	if (Object.keys(errors).length)
		return NextResponse.json({ message: "Please fix the highlighted fields.", errors }, { status: 400 });

	const text = toPlainText(app);
	const failed = NextResponse.json(
		{ message: "We couldn't send your application. Please try again or email us." },
		{ status: 502 },
	);

	if (isEmailConfigured()) {
		const r = await sendNotification({
			subject: `Affiliate application — ${app.name}`,
			text,
			replyTo: app.email,
		});
		return r.ok ? NextResponse.json({ ok: true }) : failed;
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
					company: undefined,
					text,
				}),
			});
			return res.ok ? NextResponse.json({ ok: true }) : failed;
		} catch {
			return failed;
		}
	}

	return NextResponse.json(
		{ message: "Online submission isn't set up yet.", fallback: true },
		{ status: 501 },
	);
}
