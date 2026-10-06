import "server-only";

import { sendEmail, sendNotification } from "@/lib/email";
import { earnForOrder, reverseForOrder, type RewardsDeps } from "./engine";
import {
	addRewardsOrderNote,
	adjustLot,
	createLot,
	deactivateLot,
	fetchRewardsOrder,
	findLotsByOrder,
	listUsageForOrder,
	markRestored,
	readLotCode,
	storeLotCode,
} from "./saleor-rewards";
import { readRewardsConfig } from "./tokens";

/**
 * Connects the rewards engine to the real services: Saleor for orders and gift cards, Resend for email. The engine itself is
 * tested with fakes (engine.test.ts); this file is only the wiring.
 */

export function productionDeps(): RewardsDeps {
	return {
		now: () => new Date(),
		config: readRewardsConfig(),
		orders: {
			get: (id) => fetchRewardsOrder(id),
			note: (orderId, message) => addRewardsOrderNote(orderId, message),
		},
		lots: {
			findByOrder: (orderId) => findLotsByOrder(orderId),
			create: (lot) => createLot(lot),
			storeCode: (id, code) => storeLotCode(id, code),
			readCode: (id) => readLotCode(id),
			deactivate: (id) => deactivateLot(id),
			adjust: (id, deltaCents) => adjustLot(id, deltaCents),
			usageForOrder: (userId, orderId, orderNumber) => listUsageForOrder(userId, orderId, orderNumber),
			markRestored: (id, orderNumber) => markRestored(id, orderNumber),
		},
		notify: {
			customer: async (to, email) => {
				const sent = await sendEmail({ to, subject: email.subject, text: email.text });
				if (!sent.ok) console.warn(`[rewards] couldn't email a customer (${sent.reason}): ${email.subject}`);
			},
			staff: async (email) => {
				const sent = await sendNotification({ subject: email.subject, text: email.text });
				// Without email set up, the order note and this log line are all staff get: say so loudly.
				if (!sent.ok)
					console.error(
						`[rewards] STAFF ALERT (not emailed: ${sent.reason}): ${email.subject}\n${email.text}`,
					);
			},
		},
	};
}

type OrderEvent = { order?: { id?: string | null } | null };

/** ORDER_FULLY_PAID: award the tokens. Always answers 2xx: a failure is alerted on, and Saleor re-sending the event is harmless. */
export async function handleOrderFullyPaid(payload: OrderEvent) {
	const orderId = payload.order?.id;
	if (!orderId) return { ok: false, reason: "no_order" };
	return { ok: true, outcome: await earnForOrder(orderId, productionDeps()) };
}

/** ORDER_CANCELLED and ORDER_FULLY_REFUNDED: take back what the order earned, give back what it spent. */
export async function handleOrderReversed(payload: OrderEvent) {
	const orderId = payload.order?.id;
	if (!orderId) return { ok: false, reason: "no_order" };
	return { ok: true, outcome: await reverseForOrder(orderId, productionDeps()) };
}
