import type { Role } from "./model";

/**
 * Who is a moderator. A staff account in the Saleor Dashboard is staff here (it can moderate anyone but other staff); anyone
 * whose email is in COMMUNITY_MODERATOR_EMAILS is a moderator (members only), with no Dashboard access needed.
 */

type Env = Record<string, string | undefined>;

export const parseEmailList = (value: string | undefined): Set<string> =>
	new Set(
		(value ?? "")
			.split(/[\s,;]+/)
			.map((email) => email.trim().toLowerCase())
			.filter(Boolean),
	);

export function roleFor(
	user: { email?: string | null; isStaff?: boolean | null },
	env: Env = process.env,
): Role {
	if (user.isStaff) return "staff";
	const email = user.email?.trim().toLowerCase();
	return email && parseEmailList(env.COMMUNITY_MODERATOR_EMAILS).has(email) ? "mod" : "member";
}
