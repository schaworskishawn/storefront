import "server-only";

import { sendEmail, sendNotification } from "@/lib/email";
import {
	chargeStoredCard,
	createStoredCardFromTransaction,
	deleteStoredCard,
	readAuthorizeNetConfig,
	type AuthorizeNetConfig,
} from "@/lib/payments-app/authorizenet";
import { reportTransactionEvent } from "@/lib/payments-app/saleor-api";
import {
	emptySummary,
	runInstallments,
	setUpPlan,
	type EngineDeps,
	type RunSummary,
	type SetupOutcome,
} from "./engine";
import { addOrderNote, fetchOrder, listActiveOrders, listOrdersSince, savePlan } from "./saleor-orders";

/**
 * Connects the installment engine to the real services: Authorize.net for the cards, Saleor for orders and payment events,
 * Resend for email. The engine itself is tested with fakes (engine.test.ts); this file is only the wiring.
 */

export function productionDeps(config: AuthorizeNetConfig): EngineDeps {
	return {
		now: () => new Date(),
		card: {
			save: ({ transactionId, merchantCustomerId, email }) =>
				createStoredCardFromTransaction(config, {
					transactionId,
					merchantCustomerId,
					description: "Pay in 4",
					email,
				}),
			charge: (input) => chargeStoredCard(config, input),
			remove: (customerProfileId) => deleteStoredCard(config, customerProfileId),
		},
		orders: {
			listActive: () => listActiveOrders(),
			listSince: (isoDate) => listOrdersSince(isoDate),
			save: (orderId, record) => savePlan(orderId, record),
			note: (orderId, message) => addOrderNote(orderId, message),
		},
		report: (input) => reportTransactionEvent(input),
		notify: {
			customer: async (to, email) => {
				const sent = await sendEmail({ to, subject: email.subject, text: email.text });
				if (!sent.ok)
					console.warn(`[installments] couldn't email a customer (${sent.reason}): ${email.subject}`);
			},
			staff: async (email) => {
				const sent = await sendNotification({ subject: email.subject, text: email.text });
				// Without email set up, the order note and this log line are all staff get: say so loudly.
				if (!sent.ok)
					console.error(
						`[installments] STAFF ALERT (not emailed: ${sent.reason}): ${email.subject}\n${email.text}`,
					);
			},
		},
	};
}

/** The daily job: new installment orders get their plan, then every active plan is worked through. */
export async function runInstallmentsJob(): Promise<RunSummary> {
	const config = readAuthorizeNetConfig();
	if (!config) {
		const summary = emptySummary();
		summary.errors.push("Authorize.net isn't configured, so no installment payments were taken.");
		return summary;
	}
	return runInstallments(productionDeps(config));
}

/** Gives one just-created order its plan (the ORDER_CREATED webhook). */
export async function setUpPlanForOrder(orderId: string): Promise<SetupOutcome | "unavailable"> {
	const config = readAuthorizeNetConfig();
	if (!config) return "unavailable";

	const fetched = await fetchOrder(orderId);
	if (!fetched.ok) {
		console.error(`[installments] couldn't read order ${orderId} to set up its plan: ${fetched.message}`);
		return "unavailable";
	}
	if (!fetched.value) return "unavailable";
	return setUpPlan(fetched.value, productionDeps(config));
}

/** The ORDER_CREATED webhook. Always answers 2xx: a failure is alerted on and retried by the daily job, and Saleor re-sending the event would only repeat it. */
export async function handleOrderCreated(payload: { order?: { id?: string | null } | null }) {
	const orderId = payload.order?.id;
	if (!orderId) return { ok: false, reason: "no_order" };
	return { ok: true, outcome: await setUpPlanForOrder(orderId) };
}
