import "server-only";

import { sendNotification } from "@/lib/email";
import { creditOrder, reverseOrder, type AffiliateEngineDeps } from "./engine";
import {
	addAffiliateOrderNote,
	fetchAffiliateOrder,
	listAffiliateAccounts,
	stampAffiliateOrder,
} from "./saleor-affiliates";

/** Connects the crediting engine to the real services: Saleor and Resend. The engine is tested with fakes; this is wiring. */
export function productionDeps(): AffiliateEngineDeps {
	return {
		now: () => new Date(),
		orders: {
			get: (id) => fetchAffiliateOrder(id),
			stamp: (orderId, stamp) => stampAffiliateOrder(orderId, stamp),
			note: async (orderId, message) => {
				const noted = await addAffiliateOrderNote(orderId, message);
				if (!noted.ok) console.warn(`[affiliates] couldn't add an order note: ${noted.message}`);
				return noted;
			},
		},
		affiliates: { list: () => listAffiliateAccounts() },
		alertStaff: async (subject, text) => {
			const sent = await sendNotification({ subject, text });
			if (!sent.ok)
				console.error(`[affiliates] STAFF ALERT (not emailed: ${sent.reason}): ${subject}\n${text}`);
		},
	};
}

type OrderEvent = { order?: { id?: string | null } | null };

/** ORDER_FULLY_PAID: credit the referring affiliate. Always 2xx: failures are alerted on, and a re-sent event is harmless. */
export async function handleOrderFullyPaid(payload: OrderEvent) {
	const orderId = payload.order?.id;
	if (!orderId) return { ok: false, reason: "no_order" };
	return { ok: true, outcome: await creditOrder(orderId, productionDeps()) };
}

/** ORDER_CANCELLED and ORDER_FULLY_REFUNDED: take the commission back. */
export async function handleOrderReversed(payload: OrderEvent) {
	const orderId = payload.order?.id;
	if (!orderId) return { ok: false, reason: "no_order" };
	return { ok: true, outcome: await reverseOrder(orderId, productionDeps()) };
}
