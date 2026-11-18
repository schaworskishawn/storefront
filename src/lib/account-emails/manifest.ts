/**
 * "Worldwide Vapor Emails" — a small Saleor app that lives inside this storefront (route handlers under /api/emails-app/*).
 * Saleor only emails customers and staff itself when an email sender is connected to it; this app is that sender for the
 * account emails: confirming a new account, resetting a password, and a staff member setting theirs. Saleor hands the app
 * the link's token in a signed webhook, and the app emails the link through Resend, the store's sender.
 *
 * It keeps no token and calls nothing in Saleor: it only receives. It is separate from the other apps so that the
 * permissions these events need (seeing customer and staff accounts) aren't given to an app that does anything else.
 *
 * Install it once in the Saleor Dashboard: Apps → Install external app → https://<your-domain>/api/emails-app/manifest.
 */
export const EMAILS_APP_ID = "worldwide-vapor.emails";
const EMAILS_APP_NAME = "Worldwide Vapor Emails";
const EMAILS_APP_VERSION = "1.0.0";

/** Saleor only delivers the customer account events to an app that can manage customers, and the staff one to staff. */
export const EMAILS_APP_PERMISSIONS = ["MANAGE_USERS", "MANAGE_STAFF"] as const;

export type AccountEmailKind = "confirm-account" | "reset-password" | "staff-set-password";

type EmailsWebhookDefinition = {
	/** URL segment under /api/emails-app/webhooks/, and the email it sends. */
	slug: AccountEmailKind;
	name: string;
	asyncEvents: string[];
	query: string;
};

const accountEventQuery = (type: string) => `subscription {
	event {
		... on ${type} {
			redirectUrl
			token
			user { email firstName isConfirmed }
		}
	}
}`;

export const EMAILS_WEBHOOK_DEFINITIONS: readonly EmailsWebhookDefinition[] = [
	{
		slug: "confirm-account",
		name: "Account confirmation requested (email the confirmation link)",
		asyncEvents: ["ACCOUNT_CONFIRMATION_REQUESTED"],
		query: accountEventQuery("AccountConfirmationRequested"),
	},
	{
		slug: "reset-password",
		name: "Password reset requested (email the reset link)",
		asyncEvents: ["ACCOUNT_SET_PASSWORD_REQUESTED"],
		query: accountEventQuery("AccountSetPasswordRequested"),
	},
	{
		slug: "staff-set-password",
		name: "Staff password set or reset requested (email the link)",
		asyncEvents: ["STAFF_SET_PASSWORD_REQUESTED"],
		query: accountEventQuery("StaffSetPasswordRequested"),
	},
];

export function buildEmailsAppManifest(origin: string) {
	const base = origin.replace(/\/+$/, "");
	return {
		id: EMAILS_APP_ID,
		version: EMAILS_APP_VERSION,
		name: EMAILS_APP_NAME,
		about:
			"Sends the store's account emails through Resend: confirming a new account, resetting a password, and setting a staff password.",
		permissions: [...EMAILS_APP_PERMISSIONS],
		appUrl: base,
		tokenTargetUrl: `${base}/api/emails-app/register`,
		author: "Worldwide Vapor",
		webhooks: EMAILS_WEBHOOK_DEFINITIONS.map((definition) => ({
			name: definition.name,
			asyncEvents: definition.asyncEvents,
			query: definition.query,
			targetUrl: `${base}/api/emails-app/webhooks/${definition.slug}`,
			isActive: true,
		})),
	};
}
