/**
 * "Worldwide Vapor Distributors": a small Saleor app that lives inside this storefront (/api/distributor-app/*). It keeps
 * each distributor's record on their customer account and sets their wholesale prices on their checkouts. It is
 * separate from the payments, rewards and affiliates apps on purpose: setting checkout prices (HANDLE_CHECKOUTS) is a
 * power none of them should have, and any of them can be removed alone.
 *
 * Install it once in the Saleor Dashboard: Apps → Install external app → https://<your-domain>/api/distributor-app/manifest.
 */
export const DISTRIBUTOR_APP_ID = "worldwide-vapor.distributors";

/** Keep distributors' records on their accounts; set and clear wholesale prices on their checkout lines. */
export const DISTRIBUTOR_APP_PERMISSIONS = ["MANAGE_USERS", "HANDLE_CHECKOUTS"] as const;

export function buildDistributorAppManifest(origin: string) {
	const base = origin.replace(/\/+$/, "");
	return {
		id: DISTRIBUTOR_APP_ID,
		version: "1.0.0",
		name: "Worldwide Vapor Distributors",
		about:
			"Keeps each approved distributor's tier on their account and charges their tier's wholesale prices at checkout once their cart reaches the tier's minimum order.",
		permissions: [...DISTRIBUTOR_APP_PERMISSIONS],
		appUrl: `${base}/distributor-admin`,
		tokenTargetUrl: `${base}/api/distributor-app/register`,
		author: "Worldwide Vapor",
		webhooks: [],
	};
}
