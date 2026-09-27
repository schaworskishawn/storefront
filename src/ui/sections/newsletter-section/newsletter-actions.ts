"use server";

export type NewsletterSubscribeState = {
	status: "idle" | "success" | "error";
	message?: string;
};

/**
 * TODO: wire to a real email service provider (Mailchimp, Klaviyo, SendGrid, a
 * Saleor app, etc.). This currently only validates the email shape and returns
 * success — no email address is actually stored or sent anywhere yet.
 *
 * Server Action, called from `NewsletterForm` via `useActionState`. Kept in its
 * own file (not inlined in the section) so it can gain real fetch/env-var logic
 * without turning the section component into a mixed server/client file.
 */
export async function subscribeToNewsletter(
	_prevState: NewsletterSubscribeState,
	formData: FormData,
): Promise<NewsletterSubscribeState> {
	const email = formData.get("email");

	if (typeof email !== "string" || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
		return { status: "error", message: "Enter a valid email address." };
	}

	// TODO: replace with a real API call, e.g.:
	// await fetch(process.env.NEWSLETTER_ENDPOINT, { method: "POST", body: JSON.stringify({ email }) });

	return { status: "success", message: "You're on the list." };
}
