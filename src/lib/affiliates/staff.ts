import "server-only";

import { AffiliateStaffDocument } from "@/gql/graphql";
import { hasAuthSession } from "@/lib/auth/has-auth-session";
import { executeAuthenticatedGraphQL } from "@/lib/graphql";

/**
 * Who may run the affiliate program: a signed-in Saleor staff account that can manage customers (MANAGE_USERS). Checked
 * with the visitor's own session on every admin page load and again in every admin action, so a stale page can't act for
 * someone who has lost access. The writes themselves then go through the affiliates app's token.
 */

export type StaffCheck =
	| { ok: true; userId: string; email: string }
	| { ok: false; reason: "signed-out" | "not-staff" | "unavailable" };

export async function checkAffiliateStaff(): Promise<StaffCheck> {
	if (!(await hasAuthSession())) return { ok: false, reason: "signed-out" };
	const result = await executeAuthenticatedGraphQL(AffiliateStaffDocument, { cache: "no-cache" });
	if (!result.ok) return { ok: false, reason: "unavailable" };
	const me = result.data.me;
	if (!me) return { ok: false, reason: "signed-out" };
	const canManageUsers = (me.userPermissions ?? []).some((p) => p.code === "MANAGE_USERS");
	if (!me.isStaff || !canManageUsers) return { ok: false, reason: "not-staff" };
	return { ok: true, userId: me.id, email: me.email };
}
