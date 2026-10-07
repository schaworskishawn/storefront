import { getAccountAuthState } from "@/app/(storefront)/[locale]/[channel]/(main)/account/get-current-user";
import { getDefaultLocaleSlug, resolveLocaleFromSlug } from "@/config/locale";
import { listLots } from "@/lib/rewards/saleor-rewards";
import { Notice, RewardsAccountView, RewardsSignInPrompt } from "./wv-rewards-account-view";

export { RewardsAccountSkeleton } from "./wv-rewards-account-view";

/**
 * The part of the rewards page that depends on who is looking: it reads the session and the customer's tokens, so the page
 * renders it inside Suspense and the rest of the page doesn't wait for it. What it shows is in `wv-rewards-account-view`.
 */
export async function RewardsAccount() {
	const auth = await getAccountAuthState();

	if (auth.status === "unavailable") {
		return (
			<Notice title="WE CAN'T CHECK YOUR TOKENS RIGHT NOW">
				Something went wrong while signing you in. Please refresh the page in a moment.
			</Notice>
		);
	}
	if (auth.status !== "authenticated") return <RewardsSignInPrompt />;

	const result = await listLots(auth.user.id);
	if (!result.ok) {
		console.error(`[rewards] couldn't load a customer's tokens for the rewards page: ${result.message}`);
		return (
			<Notice title="WE COULDN'T LOAD YOUR TOKENS">
				Your tokens are safe. Please refresh the page in a moment to see them.
			</Notice>
		);
	}

	// Read the clock only after the session above, so it doesn't make the page's static shell depend on it.
	const now = new Date();
	const { bcp47 } = resolveLocaleFromSlug(getDefaultLocaleSlug());
	return <RewardsAccountView lots={result.value} now={now} bcp47={bcp47} />;
}
