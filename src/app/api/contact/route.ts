import { NextResponse } from "next/server";
import { isEmailConfigured, sendNotification } from "@/lib/email";
import { rateLimited } from "@/lib/rate-limit";

const clean = (v: unknown, max: number) =>
	typeof v === "string"
		? v
				.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, " ")
				.trim()
				.slice(0, max)
		: "";

/** Contact-us form intake. Emailed to the site inbox with Reply-To set to the sender. 501 → form falls back to the visitor's email app. */
export async function POST(request: Request) {
	const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
	if (rateLimited(`contact:${ip}`, 8))
		return NextResponse.json(
			{ message: "Too many messages from this connection. Please try again later." },
			{ status: 429 },
		);

	const b = (await request.json().catch(() => null)) as Record<string, unknown> | null;
	if (clean(b?.company, 100)) return NextResponse.json({ ok: true }); // honeypot

	const firstName = clean(b?.firstName, 80);
	const lastName = clean(b?.lastName, 80);
	const email = clean(b?.email, 200);
	const order = clean(b?.order, 60);
	const subject = clean(b?.subject, 80) || "General";
	const message = clean(b?.message, 4000);

	const errors: Record<string, string> = {};
	if (!firstName) errors.firstName = "Enter your first name.";
	if (!lastName) errors.lastName = "Enter your last name.";
	if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errors.email = "Enter a valid email address.";
	if (message.length < 10) errors.message = "Tell us a little more (at least 10 characters).";
	if (Object.keys(errors).length)
		return NextResponse.json({ message: "Please fix the highlighted fields.", errors }, { status: 400 });

	if (!isEmailConfigured())
		return NextResponse.json(
			{ message: "Online messaging isn't set up yet.", fallback: true },
			{ status: 501 },
		);

	const r = await sendNotification({
		subject: `${subject} — ${firstName} ${lastName}`,
		replyTo: email,
		text: [
			`Name: ${firstName} ${lastName}`,
			`Email: ${email}`,
			order ? `Order number: ${order}` : null,
			`Subject: ${subject}`,
			"",
			message,
		]
			.filter((l) => l !== null)
			.join("\n"),
	});
	return r.ok
		? NextResponse.json({ ok: true })
		: NextResponse.json(
				{ message: "We couldn't send your message. Please try again or email us." },
				{ status: 502 },
			);
}
