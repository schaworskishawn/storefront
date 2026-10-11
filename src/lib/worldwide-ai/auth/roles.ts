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
