import "server-only";

import { AffiliateStaffDocument } from "@/gql/graphql";
import { resolveSessionUser } from "@/lib/auth/resolve-session-user";
import { executeAuthenticatedGraphQL } from "@/lib/graphql";
import { classifyStaff, type StaffCheck } from "./staff-check";

export type { StaffCheck } from "./staff-check";

/**
 * Who may run the affiliate program: a signed-in Saleor staff account that can manage customers (MANAGE_USERS). Checked
 * with the visitor's own session on every admin page load and again in every admin action, so a stale page can't act for
 * someone who has lost access. The writes themselves then go through the affiliates app's token.
 *
 * The session is read the way the account pages read it (`resolveSessionUser`): a session Saleor briefly answers with no
 * user (a token being refreshed) is retried, then reported as "can't check right now", never as signed out.
 */
export async function checkAffiliateStaff(): Promise<StaffCheck> {
	return classifyStaff(
		await resolveSessionUser(() =>
			executeAuthenticatedGraphQL(AffiliateStaffDocument, { cache: "no-cache" }),
		),
	);
}
