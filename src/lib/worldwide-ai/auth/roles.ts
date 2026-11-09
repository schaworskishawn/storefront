import { isDemoStore, type Env, type WorldwideAiConfig } from "../config";
import type { OperatorActor } from "../types";

/**
 * Who may use the dashboard. Signing in is the store's normal sign-in (the Saleor session), and then two more things have to
 * be true: the account is a Saleor staff account (so an ordinary customer account can never qualify, whatever its email),
 * and its email is on the owner list or the staff list in the environment. With neither list set, nobody gets in.
 */

export type SaleorViewer = {
	id: string;
	email?: string | null;
	firstName?: string | null;
	lastName?: string | null;
	isStaff?: boolean | null;
	isActive?: boolean | null;
};

export function operatorFor(
	viewer: SaleorViewer,
	config: Pick<WorldwideAiConfig, "ownerEmails" | "staffEmails">,
): OperatorActor | null {
	if (!viewer.id || viewer.isStaff !== true || viewer.isActive === false) return null;
	const email = viewer.email?.trim().toLowerCase();
	if (!email) return null;
	const label = [viewer.firstName, viewer.lastName].filter(Boolean).join(" ").trim() || email;
	if (config.ownerEmails.includes(email)) return { kind: "operator", id: viewer.id, label, role: "owner" };
	if (config.staffEmails.includes(email)) return { kind: "operator", id: viewer.id, label, role: "staff" };
	return null;
}

/**
 * Which of the checks above an account passed, for the audit log when it is turned away: "not found" says nothing to the
 * person, so this is how the owner finds out why (a customer account, or an email that isn't exactly the one listed). It
 * never includes the email itself.
 */
export type AccessChecks = {
	staffAccount: boolean;
	active: boolean;
	onOwnerList: boolean;
	onStaffList: boolean;
	ownersListed: number;
	staffListed: number;
};

export function accessChecks(
	viewer: SaleorViewer,
	config: Pick<WorldwideAiConfig, "ownerEmails" | "staffEmails">,
): AccessChecks {
	const email = viewer.email?.trim().toLowerCase();
	return {
		staffAccount: viewer.isStaff === true,
		active: viewer.isActive !== false,
		onOwnerList: Boolean(email && config.ownerEmails.includes(email)),
		onStaffList: Boolean(email && config.staffEmails.includes(email)),
		ownersListed: config.ownerEmails.length,
		staffListed: config.staffEmails.length,
	};
}

export const isOwner = (actor: OperatorActor): boolean => actor.role === "owner";

/**
 * A stand-in operator for previewing the workspace on a developer's own machine, with no store sign-in. It exists only when
 * all of these hold: the app is running under `next dev`, it is not on Vercel, the in-memory demonstration store is selected
 * (which holds fictional records only and is itself refused in production), and WORLDWIDE_AI_DEMO_OPERATOR names a role.
 * Anywhere else this returns null and the real sign-in applies.
 */
export function demoOperatorFor(env: Env, config: Pick<WorldwideAiConfig, "database">): OperatorActor | null {
	if (env.NODE_ENV !== "development" || env.VERCEL || !isDemoStore(config as WorldwideAiConfig)) return null;
	const role = env.WORLDWIDE_AI_DEMO_OPERATOR;
	if (role !== "owner" && role !== "staff") return null;
	return {
		kind: "operator",
		id: `demo-${role}`,
		label: role === "owner" ? "Demo Owner" : "Demo Staff",
		role,
	};
}
