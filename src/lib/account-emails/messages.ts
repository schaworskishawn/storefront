import type { AccountEmailKind } from "./manifest";

/**
 * The account emails, as plain text and a simple HTML version with a button. Pure, so the wording and the links are
 * tested on their own (messages.test.ts).
 *
 * The link is the address the request asked Saleor to send people back to (`redirectUrl`, which Saleor only accepts for
 * this store's own sites) with the account's email and the one-time token added, the same link Saleor's own emails build:
 * the shop's login page confirms the account from it, its reset-password page and the Dashboard's new-password page read
 * `email` and `token`.
 */

export type AccountEmail = { subject: string; text: string; html: string };

/** The request's link with `email` and `token` added; null when it isn't a web address. */
export function actionLink(redirectUrl: string, email: string, token: string): string | null {
	let url: URL;
	try {
		url = new URL(redirectUrl);
	} catch {
		return null;
	}
	if (url.protocol !== "https:" && url.protocol !== "http:") return null;
	url.searchParams.set("email", email);
	url.searchParams.set("token", token);
	return url.toString();
}

const escapeHtml = (s: string) =>
	s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

const COPY: Record<AccountEmailKind, { subject: string; intro: string; button: string; ignore: string }> = {
	"confirm-account": {
		subject: "Confirm your Worldwide Vapor account",
		intro:
			"Thanks for creating a Worldwide Vapor account. Confirm your email address to finish setting it up:",
		button: "Confirm my email",
		ignore: "If you didn't create an account, you can ignore this email.",
	},
	"reset-password": {
		subject: "Reset your Worldwide Vapor password",
		intro: "We got a request to reset the password for your Worldwide Vapor account. Choose a new one here:",
		button: "Choose a new password",
		ignore: "If you didn't ask for this, you can ignore this email: your password stays the same.",
	},
	"staff-set-password": {
		subject: "Set your Worldwide Vapor staff password",
		intro: "Use this link to set the password for your Worldwide Vapor staff account:",
		button: "Set my password",
		ignore: "If you didn't expect this, you can ignore this email.",
	},
};

export function accountEmail(
	kind: AccountEmailKind,
	{ firstName, link }: { firstName: string; link: string },
): AccountEmail {
	const c = COPY[kind];
	const hello = `Hi ${firstName.trim() || "there"},`;
	const text = [
		hello,
		"",
		c.intro,
		link,
		"",
		"The link works once and only for a limited time.",
		c.ignore,
		"",
		"Worldwide Vapor",
	].join("\n");
	const html = `<div style="font-family:system-ui,-apple-system,Segoe UI,sans-serif;font-size:15px;line-height:1.6;color:#1a1a1a;max-width:520px">
<p>${escapeHtml(hello)}</p>
<p>${escapeHtml(c.intro)}</p>
<p style="margin:24px 0"><a href="${escapeHtml(link)}" style="display:inline-block;background:#111;color:#fff;text-decoration:none;padding:12px 22px;border-radius:10px;font-weight:600">${escapeHtml(c.button)}</a></p>
<p style="font-size:13px;color:#555">Or paste this link into your browser:<br><a href="${escapeHtml(link)}" style="color:#555;word-break:break-all">${escapeHtml(link)}</a></p>
<p style="font-size:13px;color:#555">The link works once and only for a limited time. ${escapeHtml(c.ignore)}</p>
<p>Worldwide Vapor</p>
</div>`;
	return { subject: c.subject, text, html };
}
