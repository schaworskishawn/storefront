import type { SessionAuthState } from "@/lib/auth/session-auth-state";

/** Whether the visitor may run the affiliate program, and if not, why (with who they're signed in as, when they are). */
export type StaffCheck =
	| { ok: true; userId: string; email: string }
	| { ok: false; reason: "signed-out" | "unavailable" }
	| { ok: false; reason: "not-staff"; email: string };

type StaffUser = {
	id: string;
	email: string;
	isStaff: boolean;
	userPermissions?: ReadonlyArray<{ code: string }> | null;
};

/** Turns the session into the admin decision: only staff with MANAGE_USERS get in. Pure, so it's tested on its own. */
export function classifyStaff(state: SessionAuthState<StaffUser>): StaffCheck {
	if (state.status === "guest") return { ok: false, reason: "signed-out" };
	if (state.status === "unavailable") return { ok: false, reason: "unavailable" };
	const me = state.user;
	const canManageUsers = (me.userPermissions ?? []).some((p) => p.code === "MANAGE_USERS");
	if (!me.isStaff || !canManageUsers) return { ok: false, reason: "not-staff", email: me.email };
	return { ok: true, userId: me.id, email: me.email };
}
