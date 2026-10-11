import type { WorldwideAiConfig } from "../config";
import type { SqlClient } from "../db/sql";
import { sha256Hex } from "../hash";
import { createCase } from "./cases";

/**
 * Files a message from the public contact form as a support case, when the owner has switched that on
 * (`WORLDWIDE_AI_INGEST_CONTACT_FORM`). The form's email is the customer's real route to the store; this is a copy for the
 * workspace, so it never throws and never changes what the visitor is told.
 *
 * The same message from the same address is filed once, however many times it arrives. Nothing is drafted or sent: a case
 * waits in Support Drafts until a person asks Relay for a draft.
 */

export type ContactMessage = {
	firstName: string;
	lastName: string;
	email: string;
	order: string;
	subject: string;
	message: string;
};

export type IntakeResult =
	| { filed: true; caseId: string; created: boolean }
	| { filed: false; reason: "switched_off" | "no_database" | "failed" };

const contactActor = { kind: "system", label: "contact-form" } as const;

export async function fileContactMessage(
	deps: { config: WorldwideAiConfig; sql: () => Promise<SqlClient> },
	contact: ContactMessage,
): Promise<IntakeResult> {
	if (!deps.config.ingestContactForm) return { filed: false, reason: "switched_off" };
	// The demonstration store holds only fictional records, so a real visitor's message is never put in it.
	if (deps.config.database.mode !== "postgres") return { filed: false, reason: "no_database" };
	try {
		// An order number the form accepted but a case wouldn't (spaces, punctuation) is left out rather than refused.
		const order = contact.order.trim().replace(/^#/, "");
		const { case: filed, created } = await createCase(await deps.sql(), contactActor, {
			source: "contact_form",
			sourceRef: sha256Hex(`${contact.email.toLowerCase()}\n${contact.message}`).slice(0, 40),
			subject: contact.subject,
			message: contact.message,
			customerName: `${contact.firstName} ${contact.lastName}`.trim(),
			customerEmail: contact.email,
			orderNumber: /^[A-Za-z0-9-]{1,40}$/.test(order) ? order : null,
		});
		return { filed: true, caseId: filed.id, created };
	} catch {
		return { filed: false, reason: "failed" };
	}
}
