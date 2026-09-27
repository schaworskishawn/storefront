import { NextResponse } from "next/server";
import { addToAudience, isEmailConfigured, sendNotification } from "@/lib/email";
import { rateLimited } from "@/lib/rate-limit";

/**
 * Newsletter sign-up. With RESEND_AUDIENCE_ID set the address is added to that Resend audience; otherwise the site
 * inbox gets a "new subscriber" notification so nobody is lost. Success is only reported when one of those worked.
 */
export async function POST(request: Request) {
	const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
	if (rateLimited(`newsletter:${ip}`, 10))
		return NextResponse.json(
			{ message: "Too many sign-ups from this connection. Please try again later." },
			{ status: 429 },
		);

	const body = (await request.json().catch(() => null)) as { email?: unknown } | null;
	const email = typeof body?.email === "string" ? body.email.trim().slice(0, 200) : "";
	if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
		return NextResponse.json({ message: "Enter a valid email address." }, { status: 400 });

	if (!isEmailConfigured())
		return NextResponse.json(
			{ message: "Sign-ups aren't available right now. Please try again later." },
			{ status: 503 },
		);

	const inAudience = await addToAudience(email);
	if (inAudience.ok) return NextResponse.json({ message: "You're on the list." });

	const note = await sendNotification({
		subject: `New newsletter subscriber: ${email}`,
		text: `Please add this address to your mailing list:\n\n${email}`,
		replyTo: email,
	});
	return note.ok
		? NextResponse.json({ message: "You're on the list." })
		: NextResponse.json({ message: "We couldn't sign you up right now. Please try again." }, { status: 502 });
}
