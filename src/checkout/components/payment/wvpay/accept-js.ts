import { acceptJsUrl, type AuthorizeNetEnvironment } from "@/lib/payments-app/constants";

/**
 * Thin wrapper around Authorize.net's Accept.js. The card is sent from the browser straight to Authorize.net, which returns
 * a one-time token ("opaque data"); only that token ever reaches our servers. Accept.js is loaded from a URL we derive from the
 * environment name, never from a URL supplied by a response.
 */

export type OpaqueData = { dataDescriptor: string; dataValue: string };

type AcceptResponse = {
	opaqueData?: OpaqueData;
	messages: { resultCode: "Ok" | "Error"; message: Array<{ code: string; text: string }> };
};

export type AcceptJs = {
	dispatchData: (secureData: unknown, callback: (response: AcceptResponse) => void) => void;
};

declare global {
	interface Window {
		Accept?: AcceptJs;
	}
}

export type TokenizeResult =
	| { ok: true; opaqueData: OpaqueData }
	| { ok: false; code: string | null; message: string };

export type CardInput = {
	number: string;
	/** "MM" and four-digit year. */
	month: string;
	year: string;
	cvv: string;
	fullName?: string;
	zip?: string;
};

const loading = new Map<string, Promise<void>>();

/** Loads Accept.js once per environment. Rejects if the script can't be fetched. */
export function loadAcceptJs(environment: AuthorizeNetEnvironment): Promise<void> {
	const src = acceptJsUrl(environment);
	const existing = loading.get(src);
	if (existing) return existing;

	const promise = new Promise<void>((resolve, reject) => {
		if (window.Accept) {
			resolve();
			return;
		}
		const script = document.createElement("script");
		script.src = src;
		script.async = true;
		script.charset = "utf-8";
		script.onload = () =>
			window.Accept ? resolve() : reject(new Error("Accept.js loaded without defining Accept"));
		script.onerror = () => reject(new Error("Accept.js failed to load"));
		document.head.appendChild(script);
	});
	// A failed load must be retryable.
	promise.catch(() => loading.delete(src));
	loading.set(src, promise);
	return promise;
}

/** Exchanges a card for a one-time token. Never throws; failures come back as `{ ok: false }`. */
export function tokenizeCard({
	card,
	apiLoginId,
	clientKey,
	accept = typeof window === "undefined" ? undefined : window.Accept,
}: {
	card: CardInput;
	apiLoginId: string;
	clientKey: string;
	accept?: AcceptJs;
}): Promise<TokenizeResult> {
	return new Promise((resolve) => {
		if (!accept) {
			resolve({ ok: false, code: null, message: "The card form isn't ready yet." });
			return;
		}

		try {
			accept.dispatchData(
				{
					authData: { clientKey, apiLoginID: apiLoginId },
					cardData: {
						cardNumber: card.number.replace(/\D/g, ""),
						month: card.month,
						year: card.year,
						cardCode: card.cvv,
						...(card.zip ? { zip: card.zip } : {}),
						...(card.fullName ? { fullName: card.fullName } : {}),
					},
				},
				(response) => {
					if (response.messages.resultCode === "Ok" && response.opaqueData) {
						resolve({ ok: true, opaqueData: response.opaqueData });
						return;
					}
					const first = response.messages.message?.[0];
					resolve({
						ok: false,
						code: first?.code ?? null,
						message: first?.text ?? "The card could not be verified.",
					});
				},
			);
		} catch {
			resolve({ ok: false, code: null, message: "The card could not be verified." });
		}
	});
}

/** Accept.js error codes the shopper can fix themselves, mapped to the card field they relate to. */
export const ACCEPT_FIELD_ERRORS: Record<string, "number" | "expiry" | "cvv"> = {
	E_WC_05: "number",
	E_WC_06: "expiry",
	E_WC_07: "expiry",
	E_WC_08: "expiry",
	E_WC_15: "cvv",
};
