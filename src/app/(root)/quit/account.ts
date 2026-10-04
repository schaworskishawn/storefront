import { MyQuitPlanDocument } from "@/gql/graphql";
import { executeAuthenticatedGraphQL } from "@/lib/graphql";
import { parseQuitData, type QuitData } from "@/ui/sections/wv-home/wv-quit-model";

/** Saleor metadata key the plan is stored under. Must match the key in src/graphql/QuitPlan.graphql. */
export const QUIT_PLAN_KEY = "wv_quit_plan";

export type QuitAccount =
	| { status: "guest" }
	| { status: "unavailable" }
	| { status: "signedIn"; userId: string; plan: QuitData | null };

/**
 * The signed-in customer's saved quit plan (JSON on their Saleor account, like their reviews). Runs with the visitor's
 * own session, so it only ever sees their own account.
 */
export async function fetchQuitAccount(): Promise<QuitAccount> {
	const r = await executeAuthenticatedGraphQL(MyQuitPlanDocument, { cache: "no-cache" });
	if (!r.ok) return { status: "unavailable" };
	if (!r.data.me) return { status: "guest" };
	return { status: "signedIn", userId: r.data.me.id, plan: parseQuitData(r.data.me.metafield) };
}
