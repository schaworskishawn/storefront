import type { WorldwideAiConfig } from "../config";
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
