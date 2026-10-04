"use server";

import { SaveMyQuitPlanDocument } from "@/gql/graphql";
import { executeAuthenticatedGraphQL } from "@/lib/graphql";
import type { SaveQuitResult } from "@/ui/sections/wv-home/wv-quit-account";
import { parseQuitData, updatedAt, type QuitData } from "@/ui/sections/wv-home/wv-quit-model";
import { fetchQuitAccount } from "./account";

/** Biggest plan (as JSON) saved to an account. A full plan with two years of logs is well under this. */
const MAX_JSON_CHARS = 100_000;
/** How far ahead of the server clock a copy's timestamp may be (device clocks drift). */
const CLOCK_SKEW_MS = 5 * 60_000;

/**
 * Saves the visitor's plan to their account, unless the account already holds a copy that changed more recently (say,
 * from another device), in which case that copy is handed back to use instead.
 */
export async function saveQuitPlan(input: QuitData): Promise<SaveQuitResult> {
	// Never trust what the browser sends: rebuild it through the strict parser and cap its size.
	const json = JSON.stringify(input ?? null);
	const parsed = json.length <= MAX_JSON_CHARS ? parseQuitData(json) : null;
	if (!parsed) return { status: "error" };
	const now = Date.now();
	const plan =
		parsed.savedAt !== undefined && parsed.savedAt > now + CLOCK_SKEW_MS
			? { ...parsed, savedAt: now }
			: parsed;

	const account = await fetchQuitAccount();
	if (account.status === "guest") return { status: "guest" };
	if (account.status !== "signedIn") return { status: "error" };
	if (account.plan && updatedAt(account.plan) > updatedAt(plan))
		return { status: "newer", plan: account.plan };

	const result = await executeAuthenticatedGraphQL(SaveMyQuitPlanDocument, {
		variables: { id: account.userId, value: JSON.stringify(plan) },
		cache: "no-cache",
	});
	if (!result.ok || result.data.updateMetadata?.errors?.length) return { status: "error" };
	return { status: "saved" };
}
